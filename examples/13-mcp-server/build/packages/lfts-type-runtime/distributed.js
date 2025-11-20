// packages/lfts-type-runtime/distributed.ts
// Optional distributed execution helpers for LFTS
// Uses existing primitives: Result, AsyncResult, schemas, ports
import { Result, validateSafe } from "./mod.js";
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
export async function httpGet(url, schema, options = {}) {
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
            return data;
        }
        // Validate response against schema
        const validated = validateSafe(schema, data);
        if (!validated.ok) {
            return Result.err({
                type: "serialization_error",
                message: validated.error.message,
                path: validated.error.path,
            });
        }
        return Result.ok(validated.value);
    }
    catch (err) {
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
export async function httpPost(url, requestData, requestSchema, responseSchema, options = {}) {
    const { timeoutMs = 5000, headers = {} } = options;
    // Validate request before sending
    const validatedRequest = validateSafe(requestSchema, requestData);
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
            return data;
        }
        // Validate response against schema
        const validated = validateSafe(responseSchema, data);
        if (!validated.ok) {
            return Result.err({
                type: "serialization_error",
                message: validated.error.message,
                path: validated.error.path,
            });
        }
        return Result.ok(validated.value);
    }
    catch (err) {
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
export async function httpPut(url, requestData, requestSchema, responseSchema, options = {}) {
    const { timeoutMs = 5000, headers = {} } = options;
    // Validate request before sending
    const validatedRequest = validateSafe(requestSchema, requestData);
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
            return data;
        }
        const validated = validateSafe(responseSchema, data);
        if (!validated.ok) {
            return Result.err({
                type: "serialization_error",
                message: validated.error.message,
                path: validated.error.path,
            });
        }
        return Result.ok(validated.value);
    }
    catch (err) {
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
export async function httpDelete(url, options = {}) {
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
    }
    catch (err) {
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
export async function withRetry(fn, options) {
    const { maxAttempts, initialDelayMs = 100, backoffMultiplier = 2, maxDelayMs = 10000, shouldRetry = () => true, } = options;
    let lastError;
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
        const delay = Math.min(initialDelayMs * Math.pow(backoffMultiplier, attempt), maxDelayMs);
        await new Promise((resolve) => setTimeout(resolve, delay));
    }
    // Should never reach here due to last attempt logic, but TypeScript needs this
    return Result.err(lastError);
}
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
export function createCircuitBreaker(options = {}) {
    const { failureThreshold = 5, successThreshold = 2, timeoutMs = 60000, } = options;
    let state = "closed";
    let failureCount = 0;
    let successCount = 0;
    let nextAttempt = 0;
    return {
        getState: () => state,
        execute: async (fn) => {
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
                }
                else if (state === "closed") {
                    failureCount = 0; // Reset on success
                }
                return result;
            }
            else {
                // Failure handling
                if (state === "half_open") {
                    state = "open";
                    nextAttempt = Date.now() + timeoutMs;
                    failureCount = 0;
                }
                else if (state === "closed") {
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
export async function withFallback(primary, fallback) {
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
export async function withTimeout(promise, ms, service) {
    let timeoutId;
    const timeoutPromise = new Promise((resolve) => {
        timeoutId = setTimeout(() => {
            resolve(Result.err({
                type: "timeout",
                url: service,
                ms,
            }));
        }, ms);
    });
    const result = await Promise.race([promise, timeoutPromise]);
    if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
    }
    return result;
}
