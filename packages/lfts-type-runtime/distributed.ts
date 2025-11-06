// packages/lfts-type-runtime/distributed.ts
// Optional distributed execution helpers for LFTS
// Uses existing primitives: Result, AsyncResult, schemas, ports

import { Result, validateSafe, type TypeObject } from "./mod.ts";

/**
 * Network failure modes for distributed operations.
 * All remote calls return Result<T, NetworkError>.
 *
 * Use pattern matching for exhaustive error handling:
 * ```typescript
 * if (!result.ok) {
 *   match(result.error, {
 *     timeout: (e) => console.log(`Timeout after ${e.ms}ms`),
 *     http_error: (e) => console.log(`HTTP ${e.status}: ${e.body}`),
 *     connection_refused: (e) => console.log(`Cannot reach ${e.url}`),
 *     dns_failure: (e) => console.log(`DNS failed for ${e.domain}`),
 *     serialization_error: (e) => console.log(`Invalid response: ${e.message}`),
 *   });
 * }
 * ```
 */
export type NetworkError =
  | {
    readonly type: "timeout";
    readonly url: string;
    readonly ms: number;
  }
  | {
    readonly type: "connection_refused";
    readonly url: string;
  }
  | {
    readonly type: "http_error";
    readonly url: string;
    readonly status: number;
    readonly body: string;
  }
  | {
    readonly type: "dns_failure";
    readonly domain: string;
  }
  | {
    readonly type: "serialization_error";
    readonly message: string;
    readonly path?: string;
  };

/**
 * Configuration options for HTTP requests.
 */
export type HttpOptions = {
  /** Request timeout in milliseconds (default: 5000) */
  readonly timeoutMs?: number;
  /** Additional HTTP headers */
  readonly headers?: Record<string, string>;
  /** HTTP method override (for advanced use cases) */
  readonly method?: string;
};

/**
 * HTTP GET request with automatic response validation.
 *
 * Returns Result<T, NetworkError> with explicit failure modes:
 * - "timeout": Request exceeded timeout limit
 * - "http_error": Non-2xx status code
 * - "serialization_error": Response failed schema validation
 * - "connection_refused": Network unreachable
 * - "dns_failure": Domain name resolution failed
 *
 * @param url - Full URL to fetch
 * @param schema - LFTS schema for response validation
 * @param options - Optional configuration (timeout, headers)
 *
 * @example
 * ```typescript
 * const result = await httpGet<User>(
 *   "https://api.example.com/users/123",
 *   User$,
 *   { timeoutMs: 5000 }
 * );
 *
 * if (result.ok) {
 *   console.log("User:", result.value);
 * } else {
 *   console.error("Failed:", result.error);
 * }
 * ```
 */
export async function httpGet<T>(
  url: string,
  schema: TypeObject,
  options: HttpOptions = {}
): Promise<Result<T, NetworkError>> {
  const { timeoutMs = 5000, headers = {} } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Accept": "application/json",
        ...headers,
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // Handle HTTP errors (non-2xx status)
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      return Result.err({
        type: "http_error",
        url,
        status: response.status,
        body,
      });
    }

    // Parse response body
    const data = await response.json().catch((err) => {
      return Result.err({
        type: "serialization_error",
        message: `Failed to parse JSON: ${err.message}`,
      });
    });

    // Early return if JSON parsing failed
    if (typeof data === "object" && "ok" in data && !data.ok) {
      return data as Result<T, NetworkError>;
    }

    // Validate response against schema
    const validated = validateSafe<T>(schema, data);

    if (!validated.ok) {
      return Result.err({
        type: "serialization_error",
        message: validated.error.message,
        path: validated.error.path,
      });
    }

    return Result.ok(validated.value);
  } catch (err) {
    clearTimeout(timeoutId);

    if (err instanceof Error) {
      // Timeout via AbortController
      if (err.name === "AbortError") {
        return Result.err({
          type: "timeout",
          url,
          ms: timeoutMs,
        });
      }

      // DNS failure (ENOTFOUND, etc.)
      if (err.message.includes("ENOTFOUND") || err.message.includes("DNS")) {
        const domain = new URL(url).hostname;
        return Result.err({
          type: "dns_failure",
          domain,
        });
      }
    }

    // Connection refused, network unreachable, etc.
    return Result.err({
      type: "connection_refused",
      url,
    });
  }
}

/**
 * HTTP POST request with request serialization and response validation.
 *
 * Serializes the request body to JSON, sends POST request, validates response.
 *
 * @param url - Full URL to post to
 * @param requestData - Request body (will be JSON serialized)
 * @param requestSchema - LFTS schema for request validation
 * @param responseSchema - LFTS schema for response validation
 * @param options - Optional configuration (timeout, headers)
 *
 * @example
 * ```typescript
 * const result = await httpPost<CreateUserRequest, User>(
 *   "https://api.example.com/users",
 *   { name: "Alice", email: "alice@example.com" },
 *   CreateUserRequest$,
 *   User$
 * );
 *
 * if (result.ok) {
 *   console.log("Created user:", result.value);
 * } else {
 *   console.error("Failed:", result.error);
 * }
 * ```
 */
export async function httpPost<TRequest, TResponse>(
  url: string,
  requestData: TRequest,
  requestSchema: TypeObject,
  responseSchema: TypeObject,
  options: HttpOptions = {}
): Promise<Result<TResponse, NetworkError>> {
  const { timeoutMs = 5000, headers = {} } = options;

  // Validate request before sending
  const validatedRequest = validateSafe<TRequest>(requestSchema, requestData);
  if (!validatedRequest.ok) {
    return Result.err({
      type: "serialization_error",
      message: `Request validation failed: ${validatedRequest.error.message}`,
      path: validatedRequest.error.path,
    });
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        ...headers,
      },
      body: JSON.stringify(requestData),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // Handle HTTP errors
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      return Result.err({
        type: "http_error",
        url,
        status: response.status,
        body,
      });
    }

    // Parse response body
    const data = await response.json().catch((err) => {
      return Result.err({
        type: "serialization_error",
        message: `Failed to parse JSON response: ${err.message}`,
      });
    });

    // Early return if JSON parsing failed
    if (typeof data === "object" && "ok" in data && !data.ok) {
      return data as Result<TResponse, NetworkError>;
    }

    // Validate response against schema
    const validated = validateSafe<TResponse>(responseSchema, data);

    if (!validated.ok) {
      return Result.err({
        type: "serialization_error",
        message: validated.error.message,
        path: validated.error.path,
      });
    }

    return Result.ok(validated.value);
  } catch (err) {
    clearTimeout(timeoutId);

    if (err instanceof Error) {
      if (err.name === "AbortError") {
        return Result.err({
          type: "timeout",
          url,
          ms: timeoutMs,
        });
      }

      if (err.message.includes("ENOTFOUND") || err.message.includes("DNS")) {
        const domain = new URL(url).hostname;
        return Result.err({
          type: "dns_failure",
          domain,
        });
      }
    }

    return Result.err({
      type: "connection_refused",
      url,
    });
  }
}

/**
 * HTTP PUT request with request serialization and response validation.
 *
 * Used for updating resources. Similar to POST but semantically for updates.
 *
 * @param url - Full URL to put to
 * @param requestData - Request body (will be JSON serialized)
 * @param requestSchema - LFTS schema for request validation
 * @param responseSchema - LFTS schema for response validation
 * @param options - Optional configuration (timeout, headers)
 *
 * @example
 * ```typescript
 * const result = await httpPut<UpdateUserRequest, User>(
 *   "https://api.example.com/users/123",
 *   { name: "Alice Updated" },
 *   UpdateUserRequest$,
 *   User$
 * );
 * ```
 */
export async function httpPut<TRequest, TResponse>(
  url: string,
  requestData: TRequest,
  requestSchema: TypeObject,
  responseSchema: TypeObject,
  options: HttpOptions = {}
): Promise<Result<TResponse, NetworkError>> {
  const { timeoutMs = 5000, headers = {} } = options;

  // Validate request before sending
  const validatedRequest = validateSafe<TRequest>(requestSchema, requestData);
  if (!validatedRequest.ok) {
    return Result.err({
      type: "serialization_error",
      message: `Request validation failed: ${validatedRequest.error.message}`,
      path: validatedRequest.error.path,
    });
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        ...headers,
      },
      body: JSON.stringify(requestData),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      return Result.err({
        type: "http_error",
        url,
        status: response.status,
        body,
      });
    }

    const data = await response.json().catch((err) => {
      return Result.err({
        type: "serialization_error",
        message: `Failed to parse JSON response: ${err.message}`,
      });
    });

    if (typeof data === "object" && "ok" in data && !data.ok) {
      return data as Result<TResponse, NetworkError>;
    }

    const validated = validateSafe<TResponse>(responseSchema, data);

    if (!validated.ok) {
      return Result.err({
        type: "serialization_error",
        message: validated.error.message,
        path: validated.error.path,
      });
    }

    return Result.ok(validated.value);
  } catch (err) {
    clearTimeout(timeoutId);

    if (err instanceof Error) {
      if (err.name === "AbortError") {
        return Result.err({
          type: "timeout",
          url,
          ms: timeoutMs,
        });
      }

      if (err.message.includes("ENOTFOUND") || err.message.includes("DNS")) {
        const domain = new URL(url).hostname;
        return Result.err({
          type: "dns_failure",
          domain,
        });
      }
    }

    return Result.err({
      type: "connection_refused",
      url,
    });
  }
}

/**
 * HTTP DELETE request.
 *
 * Returns Result<void, NetworkError> on success.
 *
 * @param url - Full URL to delete
 * @param options - Optional configuration (timeout, headers)
 *
 * @example
 * ```typescript
 * const result = await httpDelete(
 *   "https://api.example.com/users/123",
 *   { timeoutMs: 5000 }
 * );
 *
 * if (result.ok) {
 *   console.log("Deleted successfully");
 * } else {
 *   console.error("Delete failed:", result.error);
 * }
 * ```
 */
export async function httpDelete(
  url: string,
  options: HttpOptions = {}
): Promise<Result<void, NetworkError>> {
  const { timeoutMs = 5000, headers = {} } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: "DELETE",
      headers: {
        "Accept": "application/json",
        ...headers,
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      return Result.err({
        type: "http_error",
        url,
        status: response.status,
        body,
      });
    }

    // DELETE typically returns 204 No Content or 200 OK
    // Consume the response body to prevent resource leaks
    await response.text().catch(() => "");

    return Result.ok(undefined);
  } catch (err) {
    clearTimeout(timeoutId);

    if (err instanceof Error) {
      if (err.name === "AbortError") {
        return Result.err({
          type: "timeout",
          url,
          ms: timeoutMs,
        });
      }

      if (err.message.includes("ENOTFOUND") || err.message.includes("DNS")) {
        const domain = new URL(url).hostname;
        return Result.err({
          type: "dns_failure",
          domain,
        });
      }
    }

    return Result.err({
      type: "connection_refused",
      url,
    });
  }
}

// ============================================================================
// Resilience Patterns
// ============================================================================

/**
 * Configuration for retry behavior.
 */
export type RetryOptions<E> = {
  /** Maximum number of attempts (including initial try) */
  readonly maxAttempts: number;
  /** Initial delay in milliseconds before first retry (default: 100) */
  readonly initialDelayMs?: number;
  /** Multiplier for exponential backoff (default: 2) */
  readonly backoffMultiplier?: number;
  /** Maximum delay in milliseconds (default: 10000) */
  readonly maxDelayMs?: number;
  /** Predicate to determine if error is retryable (default: always retry) */
  readonly shouldRetry?: (error: E, attempt: number) => boolean;
};

/**
 * Retry a function with exponential backoff.
 *
 * Implements exponential backoff: delay = min(initialDelay * backoff^attempt, maxDelay)
 *
 * @param fn - Function to retry
 * @param options - Retry configuration
 *
 * @example
 * ```typescript
 * const result = await withRetry(
 *   () => httpGet<User>("https://api.example.com/users/123", User$),
 *   {
 *     maxAttempts: 3,
 *     initialDelayMs: 100,
 *     shouldRetry: (err) => err.type === "timeout" || err.type === "connection_refused"
 *   }
 * );
 * ```
 */
export async function withRetry<T, E>(
  fn: () => Promise<Result<T, E>>,
  options: RetryOptions<E>
): Promise<Result<T, E>> {
  const {
    maxAttempts,
    initialDelayMs = 100,
    backoffMultiplier = 2,
    maxDelayMs = 10000,
    shouldRetry = () => true,
  } = options;

  let lastError: E | undefined;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const result = await fn();

    if (result.ok) {
      return result;
    }

    lastError = result.error;

    // Don't retry if we're on the last attempt or if error is not retryable
    if (attempt === maxAttempts - 1 || !shouldRetry(result.error, attempt + 1)) {
      return result;
    }

    // Calculate delay with exponential backoff
    const delay = Math.min(
      initialDelayMs * Math.pow(backoffMultiplier, attempt),
      maxDelayMs
    );

    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  // Should never reach here due to last attempt logic, but TypeScript needs this
  return Result.err(lastError!);
}

/**
 * Circuit breaker states.
 */
export type CircuitState = "closed" | "open" | "half_open";

/**
 * Circuit breaker error type.
 */
export type CircuitBreakerError = {
  readonly type: "circuit_open";
  readonly message: string;
};

/**
 * Configuration for circuit breaker.
 */
export type CircuitBreakerOptions = {
  /** Number of failures before opening circuit (default: 5) */
  readonly failureThreshold?: number;
  /** Number of successes to close circuit from half-open (default: 2) */
  readonly successThreshold?: number;
  /** Time in ms to wait before attempting half-open (default: 60000) */
  readonly timeoutMs?: number;
};

/**
 * Circuit breaker implementation for fault tolerance.
 *
 * States:
 * - closed: Normal operation, requests pass through
 * - open: Too many failures, reject all requests immediately
 * - half_open: Testing if service recovered, allow limited requests
 *
 * @example
 * ```typescript
 * const breaker = createCircuitBreaker({
 *   failureThreshold: 5,
 *   successThreshold: 2,
 *   timeoutMs: 60000
 * });
 *
 * const result = await breaker.execute(() =>
 *   httpGet<User>("https://api.example.com/users/123", User$)
 * );
 * ```
 */
export function createCircuitBreaker<T, E>(options: CircuitBreakerOptions = {}) {
  const {
    failureThreshold = 5,
    successThreshold = 2,
    timeoutMs = 60000,
  } = options;

  let state: CircuitState = "closed";
  let failureCount = 0;
  let successCount = 0;
  let nextAttempt = 0;

  return {
    getState: () => state,

    execute: async (
      fn: () => Promise<Result<T, E>>
    ): Promise<Result<T, E | CircuitBreakerError>> => {
      // Check if circuit is open
      if (state === "open") {
        if (Date.now() < nextAttempt) {
          return Result.err({
            type: "circuit_open",
            message: `Circuit breaker is open, retry after ${new Date(nextAttempt).toISOString()}`,
          });
        }
        // Transition to half-open to test service
        state = "half_open";
        successCount = 0;
      }

      // Execute the function
      const result = await fn();

      if (result.ok) {
        // Success handling
        if (state === "half_open") {
          successCount++;
          if (successCount >= successThreshold) {
            state = "closed";
            failureCount = 0;
          }
        } else if (state === "closed") {
          failureCount = 0; // Reset on success
        }
        return result;
      } else {
        // Failure handling
        if (state === "half_open") {
          state = "open";
          nextAttempt = Date.now() + timeoutMs;
          failureCount = 0;
        } else if (state === "closed") {
          failureCount++;
          if (failureCount >= failureThreshold) {
            state = "open";
            nextAttempt = Date.now() + timeoutMs;
          }
        }
        return result;
      }
    },
  };
}

/**
 * Fallback to alternative result if primary fails.
 *
 * @param primary - Primary operation to attempt
 * @param fallback - Fallback operation if primary fails
 *
 * @example
 * ```typescript
 * const result = await withFallback(
 *   httpGet<Config>("https://api.example.com/config", Config$),
 *   Promise.resolve(Result.ok(DEFAULT_CONFIG))
 * );
 * ```
 */
export async function withFallback<T, E>(
  primary: Promise<Result<T, E>>,
  fallback: Promise<Result<T, E>>
): Promise<Result<T, E>> {
  const result = await primary;
  if (result.ok) {
    return result;
  }
  return await fallback;
}

/**
 * Add timeout to any async operation returning Result.
 *
 * @param promise - Operation to add timeout to
 * @param ms - Timeout in milliseconds
 * @param service - Service name for error message
 *
 * @example
 * ```typescript
 * const result = await withTimeout(
 *   httpGet<User>("https://slow-api.example.com/users/123", User$),
 *   1000,
 *   "user-service"
 * );
 * ```
 */
export async function withTimeout<T, E>(
  promise: Promise<Result<T, E>>,
  ms: number,
  service: string
): Promise<Result<T, E | NetworkError>> {
  let timeoutId: number | undefined;

  const timeoutPromise = new Promise<Result<T, E | NetworkError>>((resolve) => {
    timeoutId = setTimeout(() => {
      resolve(
        Result.err({
          type: "timeout",
          url: service,
          ms,
        })
      );
    }, ms);
  });

  const result = await Promise.race([promise, timeoutPromise]);
  if (timeoutId !== undefined) {
    clearTimeout(timeoutId);
  }
  return result;
}
