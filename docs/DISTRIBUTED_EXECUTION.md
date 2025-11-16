# Distributed Execution in LFTS

**Status**: Design proposal
**Version**: v0.8.0
**Date**: 2025-01-03

This document describes how to build distributed systems using LFTS's existing primitives, without requiring new framework features or runtime complexity.

---

## Executive Summary

**Key Finding**: LFTS already has everything needed for distributed execution:
- ✅ **Ports** provide location-transparent service interfaces
- ✅ **AsyncResult** handles async operations with explicit errors
- ✅ **Schemas** enable automatic serialization/validation
- ✅ **Result<T, E>** models network failures as first-class ADTs

**No core changes required**—users can build distributed systems by composing existing primitives with standard HTTP/fetch APIs.

**Philosophy**: "Distributed systems are just functions that happen to run on different machines. Model remote calls as ports, network errors as Result types, and let users compose resilience patterns explicitly."

---

## Table of Contents

1. [Background: Distributed Programming Models](#background-distributed-programming-models)
2. [LFTS Distributed Design](#lfts-distributed-design)
3. [Concrete Example: User Registration Workflow](#concrete-example-user-registration-workflow)
4. [Resilience Patterns](#resilience-patterns)
5. [Comparison with Other Approaches](#comparison-with-other-approaches)
6. [Implementation Guide](#implementation-guide)
7. [Future Considerations](#future-considerations)

---

## Background: Distributed Programming Models

### Distributed-Async-Await (Resonate)

The [distributed-async-await.io](https://www.distributed-async-await.io/specification/programming-model) specification introduces **durable promises** that persist across process boundaries:

**Key concepts**:
- **Durable Promises**: Promises with persistent identity and state
- **Location Transparency**: Functions can invoke other functions regardless of location
- **Distributed Recovery**: Execution resumes after failures via promise durability
- **Call Graphs**: Visualize execution as directed graphs with zoomable abstraction levels

**Programming model**: Two abstractions:
1. **Functions** (computation units)
2. **Promises** (coordination primitives)

**Trade-offs**:
- ✅ Automatic recovery from failures
- ✅ Long-running workflow support
- ❌ Requires Resonate server infrastructure
- ❌ Framework-specific SDK (vendor lock-in)
- ❌ Higher complexity for simple use cases

### Traditional RPC/gRPC

**Model**: Client-server request-response with code generation

**Trade-offs**:
- ✅ Cross-language interop (protobuf)
- ✅ HTTP/2 streaming support
- ❌ Separate IDL (`.proto` files)
- ❌ Codegen required for type safety
- ❌ Larger bundle size (gRPC runtime)
- ❌ Exception-based error handling

### Actor Model (Akka, Orleans)

**Model**: Asynchronous message passing between isolated actors

**Trade-offs**:
- ✅ Fine-grained state isolation
- ✅ Automatic distribution
- ✅ Supervision hierarchies for fault tolerance
- ❌ Object-oriented mental model (mutable state)
- ❌ Heavy runtime (actor system)
- ❌ Steep learning curve

---

## LFTS Distributed Design

### Core Principle: Distributed = Local + Explicit Network Errors

The beauty of LFTS is that **distributed execution requires no new primitives**. The existing port pattern naturally extends to remote calls:

```typescript
// Port interface (location-transparent)
interface UserServicePort {
  createUser(req: CreateUserRequest): Promise<Result<User, ServiceError>>;
  getUser(id: UserId): Promise<Result<User, ServiceError>>;
}

// Local implementation (in-process)
const localUserService: UserServicePort = {
  createUser: async (req) => {
    // Direct database access
    const user = await db.insert("users", req);
    return Result.ok(user);
  },
  // ...
};

// Remote implementation (HTTP)
const remoteUserService: UserServicePort = {
  createUser: async (req) => {
    // HTTP call with automatic serialization
    return httpPost("/users", req, User$);
  },
  // ...
};

// Domain logic is IDENTICAL regardless of implementation
async function registerUser(
  userService: UserServicePort,
  req: CreateUserRequest
): Promise<Result<User, RegistrationError>> {
  return AsyncResult.andThen(
    userService.createUser(req),
    (user) => sendWelcomeEmail(user.email)
  );
}
```

### Key Design Principles

**1. Location Transparency via Ports**

Ports define service contracts without exposing implementation details:
- **Interface**: `interface XxxPort { ... }`
- **Local impl**: Direct function calls, database access
- **Remote impl**: HTTP, gRPC, WebSocket, message queue
- **Mock impl**: In-memory stub for testing

Domain logic depends only on the port interface, not the implementation.

**2. Network Errors as First-Class ADTs**

Model all network failure modes explicitly:

```typescript
type NetworkError =
  | { readonly type: "timeout"; readonly service: string; readonly ms: number }
  | { readonly type: "connection_refused"; readonly host: string }
  | { readonly type: "http_error"; readonly status: number; readonly body: string }
  | { readonly type: "dns_failure"; readonly domain: string }
  | { readonly type: "serialization_error"; readonly message: string };

type ServiceError =
  | { readonly type: "business_logic"; readonly reason: string }
  | { readonly type: "network"; readonly error: NetworkError };
```

Benefits:
- ✅ Type-safe error handling (exhaustive pattern matching)
- ✅ Explicit failure modes (no hidden exceptions)
- ✅ Composable with domain errors via union types

**3. Schema-Based Automatic Serialization**

LFTS schemas enable zero-boilerplate serialization:

```typescript
// Type definition
type User = {
  readonly id: UserId;
  readonly name: string;
  readonly email: Email;
};

// Schema automatically generated by compiler
export type UserSchema = User;
// → Compiler emits: export const User$ = [bytecode];

// HTTP adapter uses schema for validation
async function httpGet<T>(
  url: string,
  schema: TypeObject
): Promise<Result<T, NetworkError>> {
  const response = await fetch(url);
  const data = await response.json();

  // Automatic validation using schema
  const validated = validateSafe<T>(schema, data);

  if (!validated.ok) {
    return Result.err({
      type: "serialization_error",
      message: validated.error.message
    });
  }

  return Result.ok(validated.value);
}
```

Benefits:
- ✅ No manual serialization code
- ✅ Runtime validation catches API mismatches
- ✅ Compile-time type safety + runtime safety
- ✅ Works across network boundaries automatically

**4. Resilience Through Composition**

Users explicitly compose resilience patterns using standard functions:

```typescript
// Retry with exponential backoff
function withRetry<T, E>(
  fn: () => Promise<Result<T, E>>,
  maxRetries: number
): Promise<Result<T, E>> {
  // User-provided resilience logic
}

// Circuit breaker wrapper
function withCircuitBreaker<P>(
  port: P,
  config: CircuitBreakerConfig
): P {
  // User-provided fault isolation
}

// Timeout wrapper
function withTimeout<T, E>(
  promise: Promise<Result<T, E>>,
  ms: number
): Promise<Result<T, E | { type: "timeout" }>> {
  // User-provided timeout logic
}

// Compose patterns explicitly
const resilientService = withCircuitBreaker(
  withRetry(remoteService, 3),
  { failureThreshold: 5, timeout: 30000 }
);
```

Benefits:
- ✅ User controls resilience strategy
- ✅ Composable via function wrapping
- ✅ No magic framework behavior
- ✅ Testable (mock wrappers for testing)

**5. Minimal Runtime, Maximum Control**

LFTS provides primitives, users build patterns:

**What LFTS provides** (already exists):
- Port validation: `validatePort()`
- Async composition: `AsyncResult.andThen()`, `.map()`, `.all()`
- Error handling: `Result<T, E>`
- Schema validation: `validateSafe()`

**What users provide** (application-specific):
- HTTP client adapters
- Retry/timeout logic
- Circuit breakers
- Service discovery
- Load balancing

This division keeps the core minimal while enabling sophisticated distributed systems.

---

## Concrete Example: User Registration Workflow

### Scenario

User registration calls 3 remote services:
1. **UserService**: Create user account (critical)
2. **EmailService**: Send welcome email (best-effort)
3. **AuditService**: Log registration event (best-effort)

### Step 1: Define Types and Errors

```typescript
// types.ts - Pure data definitions
type UserId = string & { readonly __brand: "UserId" };
type Email = string & { readonly __brand: "Email" };

type User = {
  readonly id: UserId;
  readonly name: string;
  readonly email: Email;
  readonly createdAt: number;
};

type RegistrationRequest = {
  readonly name: string;
  readonly email: string;
  readonly agreeToTerms: boolean;
};

type RegistrationResult = {
  readonly user: User;
  readonly emailSent: boolean;
  readonly auditLogged: boolean;
};

// Network errors (reusable across all services)
type NetworkError =
  | { readonly type: "timeout"; readonly service: string; readonly ms: number }
  | { readonly type: "connection_refused"; readonly service: string; readonly host: string }
  | { readonly type: "http_error"; readonly service: string; readonly status: number }
  | { readonly type: "serialization_error"; readonly service: string; readonly message: string };

// Domain errors
type RegistrationError =
  | { readonly type: "invalid_email"; readonly email: string }
  | { readonly type: "terms_not_accepted" }
  | { readonly type: "user_already_exists"; readonly email: string }
  | { readonly type: "service_unavailable"; readonly service: string; readonly reason: string };
```

### Step 2: Define Port Interfaces

```typescript
// ports.ts - Service contracts (location-transparent)

/** @port */
interface UserServicePort {
  createUser(
    name: string,
    email: Email
  ): Promise<Result<User, NetworkError | { type: "duplicate_email" }>>;

  getUser(
    id: UserId
  ): Promise<Result<User, NetworkError | { type: "not_found" }>>;
}

/** @port */
interface EmailServicePort {
  sendWelcome(
    email: Email,
    name: string
  ): Promise<Result<void, NetworkError>>;

  sendPasswordReset(
    email: Email
  ): Promise<Result<void, NetworkError>>;
}

/** @port */
interface AuditServicePort {
  logEvent(
    event: string,
    userId: UserId,
    metadata: Record<string, unknown>
  ): Promise<Result<void, NetworkError>>;
}

/** @port */
interface ClockPort {
  now(): number;
}
```

### Step 3: Pure Business Logic

```typescript
// registration.ts - Pure domain logic, zero network knowledge

async function registerUser(
  ports: {
    userService: UserServicePort;
    emailService: EmailServicePort;
    auditService: AuditServicePort;
    clock: ClockPort;
  },
  request: RegistrationRequest
): Promise<Result<RegistrationResult, RegistrationError>> {
  // Validation
  if (!request.agreeToTerms) {
    return Result.err({ type: "terms_not_accepted" });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(request.email)) {
    return Result.err({ type: "invalid_email", email: request.email });
  }

  const email = request.email as Email;

  // Step 1: Create user account (CRITICAL - fail if error)
  const userResult = await ports.userService.createUser(request.name, email);

  if (!userResult.ok) {
    if (userResult.error.type === "duplicate_email") {
      return Result.err({ type: "user_already_exists", email: request.email });
    }
    // Network error
    return Result.err({
      type: "service_unavailable",
      service: "UserService",
      reason: JSON.stringify(userResult.error)
    });
  }

  const user = userResult.value;

  // Step 2 & 3: Send email and log audit in parallel (BEST-EFFORT)
  const [emailResult, auditResult] = await Promise.all([
    ports.emailService.sendWelcome(email, user.name),
    ports.auditService.logEvent("user_registered", user.id, {
      email: user.email,
      timestamp: ports.clock.now(),
    }),
  ]);

  // Return success even if email/audit fail (degraded but acceptable)
  return Result.ok({
    user,
    emailSent: emailResult.ok,
    auditLogged: auditResult.ok,
  });
}
```

**Key observations**:
- ✅ Pure function (no side effects, easy to test)
- ✅ Explicit error handling (pattern match on Result)
- ✅ Clear business logic (validation → create → notify)
- ✅ Zero knowledge of HTTP, serialization, retries, etc.
- ✅ Parallel execution via `Promise.all()` (standard JS)
- ✅ Degraded mode (user created even if email fails)

### Step 4: HTTP Adapter with Resilience

```typescript
// adapters/http-user-service.ts - HTTP implementation

function createHttpUserService(config: {
  baseUrl: string;
  timeout: number;
  maxRetries: number;
}): UserServicePort {

  // Helper: retry with exponential backoff
  async function retryWithBackoff<T, E>(
    fn: () => Promise<Result<T, E>>,
    maxRetries: number
  ): Promise<Result<T, E>> {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const result = await fn();

      if (result.ok || attempt === maxRetries - 1) {
        return result;
      }

      // Exponential backoff: 100ms, 200ms, 400ms, 800ms
      const delayMs = 100 * Math.pow(2, attempt);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }

    return await fn(); // Final attempt
  }

  return {
    async createUser(name, email) {
      return retryWithBackoff(
        () => AsyncResult.try(
          async () => {
            // Timeout handling
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), config.timeout);

            try {
              const response = await fetch(`${config.baseUrl}/users`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name, email }),
                signal: controller.signal,
              });

              clearTimeout(timeoutId);

              // Handle duplicate email (409 Conflict)
              if (response.status === 409) {
                return Result.err({ type: "duplicate_email" as const });
              }

              if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
              }

              const data = await response.json();

              // Automatic validation using schema
              const validated = validateSafe<User>(User$, data);

              if (!validated.ok) {
                throw new Error(`Invalid response: ${validated.error.message}`);
              }

              return Result.ok(validated.value);
            } finally {
              clearTimeout(timeoutId);
            }
          },
          // Error mapper: native errors → NetworkError ADT
          (err): NetworkError | { type: "duplicate_email" } => {
            if (err instanceof Error) {
              if (err.name === "AbortError") {
                return {
                  type: "timeout",
                  service: "UserService",
                  ms: config.timeout
                };
              }
              if (err.message.includes("HTTP")) {
                const status = parseInt(err.message.match(/\d+/)?.[0] || "500");
                return {
                  type: "http_error",
                  service: "UserService",
                  status
                };
              }
              if (err.message.startsWith("Invalid response")) {
                return {
                  type: "serialization_error",
                  service: "UserService",
                  message: err.message
                };
              }
            }
            return {
              type: "connection_refused",
              service: "UserService",
              host: config.baseUrl
            };
          }
        ),
        config.maxRetries
      );
    },

    async getUser(id) {
      // Similar implementation...
      return Result.err({ type: "not_found" as const });
    },
  };
}
```

**Key observations**:
- ✅ Implements `UserServicePort` interface exactly
- ✅ Handles timeout via `AbortController` (native Web API)
- ✅ Retry logic via user-provided function (not framework magic)
- ✅ Schema-based validation via `validateSafe()`
- ✅ Maps native errors to domain ADTs
- ✅ All network concerns isolated in adapter

### Step 5: Application Wiring

```typescript
// main.ts - Dependency injection

async function main() {
  // Production implementations
  const userService = createHttpUserService({
    baseUrl: "https://api.example.com",
    timeout: 5000,
    maxRetries: 3,
  });

  const emailService = createHttpEmailService({
    baseUrl: "https://email.example.com",
    timeout: 3000,
    maxRetries: 2,
  });

  const auditService = createHttpAuditService({
    baseUrl: "https://audit.example.com",
    timeout: 2000,
    maxRetries: 1,
  });

  // Optional: Validate port implementations at startup
  const validation = validatePort<UserServicePort>(UserServicePort$, userService);
  if (!validation.ok) {
    console.error("Invalid UserServicePort:", validation.error);
    Deno.exit(1);
  }

  // Wire up dependencies
  const ports = {
    userService,
    emailService,
    auditService,
    clock: { now: () => Date.now() },
  };

  // Execute business logic
  const request: RegistrationRequest = {
    name: "Alice",
    email: "alice@example.com",
    agreeToTerms: true,
  };

  const result = await registerUser(ports, request);

  if (result.ok) {
    console.log("Registration successful:", result.value);
  } else {
    console.error("Registration failed:", result.error);
  }
}
```

### Step 6: Testing with Mocks

```typescript
// registration.test.ts - Pure logic testing

Deno.test("registerUser - success case", async () => {
  const mockUserService: UserServicePort = {
    async createUser(name, email) {
      return Result.ok({
        id: "user-123" as UserId,
        name,
        email,
        createdAt: Date.now(),
      });
    },
    async getUser(id) {
      return Result.err({ type: "not_found" });
    },
  };

  const mockEmailService: EmailServicePort = {
    async sendWelcome(email, name) {
      return Result.ok(undefined);
    },
    async sendPasswordReset(email) {
      return Result.ok(undefined);
    },
  };

  const mockAuditService: AuditServicePort = {
    async logEvent(event, userId, metadata) {
      return Result.ok(undefined);
    },
  };

  const ports = {
    userService: mockUserService,
    emailService: mockEmailService,
    auditService: mockAuditService,
    clock: { now: () => 1234567890 },
  };

  const request: RegistrationRequest = {
    name: "Bob",
    email: "bob@example.com",
    agreeToTerms: true,
  };

  const result = await registerUser(ports, request);

  assert(result.ok);
  assertEquals(result.value.user.name, "Bob");
  assertEquals(result.value.emailSent, true);
  assertEquals(result.value.auditLogged, true);
});

Deno.test("registerUser - email service fails", async () => {
  const mockUserService: UserServicePort = {
    async createUser(name, email) {
      return Result.ok({
        id: "user-123" as UserId,
        name,
        email,
        createdAt: Date.now(),
      });
    },
    async getUser(id) {
      return Result.err({ type: "not_found" });
    },
  };

  const mockEmailService: EmailServicePort = {
    async sendWelcome(email, name) {
      // Simulate email service failure
      return Result.err({
        type: "timeout",
        service: "EmailService",
        ms: 5000
      });
    },
    async sendPasswordReset(email) {
      return Result.ok(undefined);
    },
  };

  const mockAuditService: AuditServicePort = {
    async logEvent(event, userId, metadata) {
      return Result.ok(undefined);
    },
  };

  const ports = {
    userService: mockUserService,
    emailService: mockEmailService,
    auditService: mockAuditService,
    clock: { now: () => 1234567890 },
  };

  const request: RegistrationRequest = {
    name: "Charlie",
    email: "charlie@example.com",
    agreeToTerms: true,
  };

  const result = await registerUser(ports, request);

  // Should still succeed (email is best-effort)
  assert(result.ok);
  assertEquals(result.value.user.name, "Charlie");
  assertEquals(result.value.emailSent, false); // Email failed
  assertEquals(result.value.auditLogged, true);
});
```

**Key observations**:
- ✅ No network setup required (pure mock objects)
- ✅ Fast tests (no HTTP overhead)
- ✅ Exhaustive scenario coverage (success, partial failure, total failure)
- ✅ Pure domain logic is trivial to test

---

## Resilience Patterns

### 1. Retry with Exponential Backoff

```typescript
async function retryWithBackoff<T, E>(
  fn: () => Promise<Result<T, E>>,
  config: {
    maxRetries: number;
    initialDelayMs: number;
    maxDelayMs: number;
    backoffMultiplier: number;
  }
): Promise<Result<T, E>> {
  let attempt = 0;
  let delayMs = config.initialDelayMs;

  while (attempt < config.maxRetries) {
    const result = await fn();

    if (result.ok || attempt === config.maxRetries - 1) {
      return result;
    }

    // Wait before retry
    await new Promise(resolve => setTimeout(resolve, delayMs));

    // Exponential backoff
    delayMs = Math.min(delayMs * config.backoffMultiplier, config.maxDelayMs);
    attempt++;
  }

  return await fn(); // Final attempt
}

// Usage
const resilientService = {
  async createUser(req) {
    return retryWithBackoff(
      () => httpPost("/users", req),
      { maxRetries: 3, initialDelayMs: 100, maxDelayMs: 2000, backoffMultiplier: 2 }
    );
  },
};
```

### 2. Circuit Breaker

```typescript
type CircuitState = "closed" | "open" | "half_open";

function withCircuitBreaker<P extends Record<string, Function>>(
  port: P,
  config: {
    failureThreshold: number;
    successThreshold: number;
    timeout: number;
  }
): P {
  let state: CircuitState = "closed";
  let failureCount = 0;
  let successCount = 0;
  let lastFailureTime = 0;

  const wrapped: any = {};

  for (const [methodName, method] of Object.entries(port)) {
    if (typeof method !== "function") continue;

    wrapped[methodName] = async (...args: any[]) => {
      // Check circuit state
      if (state === "open") {
        const now = Date.now();
        if (now - lastFailureTime < config.timeout) {
          return Result.err({
            type: "circuit_open",
            service: methodName,
            message: "Circuit breaker is open"
          });
        }
        state = "half_open";
        successCount = 0;
      }

      // Execute method
      const result = await method.apply(port, args);

      // Update circuit state
      if (result.ok) {
        failureCount = 0;
        if (state === "half_open") {
          successCount++;
          if (successCount >= config.successThreshold) {
            state = "closed";
          }
        }
      } else {
        successCount = 0;
        failureCount++;
        lastFailureTime = Date.now();
        if (failureCount >= config.failureThreshold) {
          state = "open";
        }
      }

      return result;
    };
  }

  return wrapped as P;
}

// Usage
const resilientService = withCircuitBreaker(userService, {
  failureThreshold: 5,  // Open after 5 consecutive failures
  successThreshold: 2,  // Close after 2 consecutive successes in half-open
  timeout: 30000,       // Stay open for 30 seconds before half-open
});
```

### 3. Timeout Wrapper

```typescript
function withTimeout<T, E>(
  promise: Promise<Result<T, E>>,
  ms: number,
  service: string
): Promise<Result<T, E | NetworkError>> {
  return Promise.race([
    promise,
    new Promise<Result<T, NetworkError>>((resolve) =>
      setTimeout(
        () => resolve(Result.err({ type: "timeout", service, ms })),
        ms
      )
    ),
  ]);
}

// Usage
const result = await withTimeout(
  userService.createUser(req),
  5000,
  "UserService"
);
```

### 4. Fallback Chain

```typescript
async function withFallback<T, E>(
  primary: Promise<Result<T, E>>,
  fallback: Promise<Result<T, E>>
): Promise<Result<T, E>> {
  const result = await primary;
  if (result.ok) return result;

  console.warn("Primary failed, trying fallback:", result.error);
  return await fallback;
}

// Usage
const user = await withFallback(
  primaryDB.getUser(id),
  replicaDB.getUser(id)
);
```

### 5. Metrics/Observability

```typescript
function withMetrics<P extends Record<string, Function>>(
  port: P,
  portName: string
): P {
  const wrapped: any = {};

  for (const [methodName, method] of Object.entries(port)) {
    if (typeof method !== "function") continue;

    wrapped[methodName] = async (...args: any[]) => {
      const startTime = performance.now();

      try {
        const result = await method.apply(port, args);
        const duration = performance.now() - startTime;

        // Emit metrics
        metrics.recordCall({
          port: portName,
          method: methodName,
          success: result.ok,
          durationMs: duration,
        });

        return result;
      } catch (err) {
        const duration = performance.now() - startTime;

        metrics.recordCall({
          port: portName,
          method: methodName,
          success: false,
          durationMs: duration,
          error: String(err),
        });

        throw err;
      }
    };
  }

  return wrapped as P;
}

// Usage
const monitoredService = withMetrics(userService, "UserService");
```

---

## Comparison with Other Approaches

### Light-FP vs RPC/gRPC

| Aspect | Light-FP | RPC/gRPC |
|--------|----------|----------|
| **Interface Definition** | TypeScript interfaces | `.proto` files (separate language) |
| **Type Safety** | End-to-end TypeScript | Codegen required |
| **Serialization** | Automatic via schemas (zero boilerplate) | Manual codegen from protobuf |
| **Error Handling** | `Result<T, E>` ADTs (type-safe) | Exceptions or status codes |
| **Async Pattern** | Native async/await + Result | Streaming or callback-based |
| **Testing** | Mock ports (pure TS objects) | Requires mock server or stubs |
| **Bundle Size** | Tiny (only schemas you use) | Larger (gRPC runtime + codegen) |
| **Location Transparency** | Port pattern (explicit interface) | Transparent via client stubs |
| **Resilience** | Composable user code | Framework-provided (Envoy, Istio) |
| **Cross-Language** | TypeScript only | All languages (protobuf) |
| **HTTP/2 Streaming** | Not built-in | Native support |

**Verdict**: Light-FP wins for simplicity, type safety, and bundle size within TypeScript ecosystems. gRPC wins for cross-language interop and HTTP/2 streaming.

### Light-FP vs Distributed-Async-Await (Resonate)

| Aspect | Light-FP | Distributed-Async-Await |
|--------|----------|-------------------------|
| **Durability** | None (ephemeral by default) | Built-in durable promises |
| **Recovery** | Manual retry/resume | Automatic execution resumption |
| **Complexity** | Minimal (just functions + data) | Requires Resonate server/SDK |
| **State Management** | User's responsibility | Handled by framework |
| **Debugging** | Standard async/await debugging | Call graph visualization |
| **Deployment** | Any runtime (Deno, Node, browser) | Requires Resonate infrastructure |
| **Programming Model** | Standard JavaScript | Extended with RFI/LFI primitives |
| **Vendor Lock-in** | None | Resonate-specific |
| **Long-Running Workflows** | Manual state persistence | Native support |

**Verdict**: Light-FP wins for simplicity and zero infrastructure. Distributed-Async-Await wins for long-running workflows requiring durability (saga patterns, multi-day processes).

### Light-FP vs Actor Model (Akka, Orleans)

| Aspect | Light-FP | Actor Model |
|--------|----------|-------------|
| **State Model** | Functional (immutable data) | Object-oriented (mutable actors) |
| **Communication** | Direct port method calls | Asynchronous message passing |
| **Location Transparency** | Explicit via ports | Transparent actor references |
| **Failure Handling** | Result<T, E> explicit | Supervision hierarchies |
| **Concurrency** | AsyncResult composition | Actor mailboxes + isolation |
| **Learning Curve** | Low (just functions) | High (actor mental model) |
| **Scalability** | User-managed | Framework-managed |
| **Runtime** | Minimal | Heavy (actor system) |
| **Fine-Grained State** | Not designed for | Native support (one actor per entity) |

**Verdict**: Light-FP wins for simplicity and functional purity. Actor model wins for fine-grained state isolation and automatic distribution at scale.

### Summary: Light-FP's Unique Advantages

1. **Simplicity**: No framework, no codegen, no special runtime—just TypeScript functions and data
2. **Composability**: AsyncResult + Result + ports compose cleanly without magic
3. **Type Safety**: End-to-end compile-time types + runtime validation
4. **Testability**: Pure functions + mock ports = effortless testing
5. **Bundle Size**: Tree-shakeable, only pay for what you use (~35KB for full distributed capabilities)
6. **Flexibility**: User controls resilience patterns (retry, circuit breaker, timeout)
7. **Portability**: Works anywhere JavaScript runs (Deno, Node, browser, edge)
8. **Zero Vendor Lock-in**: Standard JavaScript, no proprietary protocols

---

## Implementation Guide

### What LFTS Already Has (No Changes Needed!)

✅ **Opcodes**: All necessary opcodes exist (`Op.PORT`, `Op.PORT_METHOD`, `Op.OBJECT`, `Op.UNION`, etc.)

✅ **Runtime Validation**: `validate()`, `validateSafe()`, `validatePort()` all work

✅ **Serialization**: `serialize()` function exists (currently identity after validation)

✅ **AsyncResult Helpers**: Complete set of combinators ready to use

✅ **Result Type**: Perfect for network error handling

✅ **Port Pattern**: Compiler enforcement + runtime validation

### User-Land Libraries (Community/Ecosystem)

Users can implement these as libraries (no core changes needed):

**1. Network Error Types** (planned user-land module, ~1KB)
```typescript
export type NetworkError =
  | { type: "timeout"; service: string; ms: number }
  | { type: "connection_refused"; service: string; host: string }
  | { type: "http_error"; service: string; status: number; body: string }
  | { type: "dns_failure"; domain: string }
  | { type: "serialization_error"; service: string; message: string };
```

**2. HTTP Port Adapter** (planned user-land module, ~8KB)
```typescript
export function createHttpPort<P>(
  schema: TypeObject,
  config: HttpConfig
): P {
  // Generate port implementation from schema + HTTP config
  // Uses fetch + validateSafe + AsyncResult.try
}
```

**3. Resilience Helpers** (planned user-land module, ~6KB)
```typescript
export function withRetry<T, E>(...);
export function withCircuitBreaker<P>(...);
export function withTimeout<T, E>(...);
export function withFallback<T, E>(...);
```

**4. Observability Wrappers** (planned user-land module, ~8KB)
```typescript
export function withMetrics<P>(...);
export function withTracing<P>(...);
export function withLogging<P>(...);
```

### Bundle Size Estimate

Core LFTS runtime (already exists):
- Runtime validator: ~15KB minified + gzip
- Result/AsyncResult helpers: ~3KB
- Port validation: ~2KB
- **Total core: ~20KB**

User-land distributed extensions:
- Network errors: ~1KB
- HTTP adapter: ~8KB
- Retry logic: ~2KB
- Circuit breaker: ~4KB
- **Total extensions: ~15KB**

**Grand total: ~35KB for full distributed execution capabilities** (smaller than most RPC frameworks!)

---

## Future Considerations

### If Adoption Grows

**Phase 1: Documentation and Examples** (v0.9.0)
- Add distributed patterns to `EFFECTS_GUIDE.md`
- Create example projects (microservices, API gateway)
- Publish starter templates

**Phase 2: Community Libraries** (User-driven)
- `network-errors`: Standard network error ADT
- `http-adapter`: Generate HTTP port implementations
- `resilience`: Retry, circuit breaker, timeout helpers
- `observability`: Metrics, tracing, logging wrappers
- `testing`: Mock port generators, test harness

**Phase 3: Optional Advanced Features** (v1.1+, if needed)
- Service registry for discovery (optional package)
- RPC framework over HTTP adapter (optional)
- Distributed tracing (correlation ID propagation)
- Durable execution integration (Temporal, Resonate adapters)

### Comparison to Alternative Approaches

**NOT recommended** (violates Light-FP principles):
- ❌ **Built-in durable promises**: Requires persistence layer, framework complexity
- ❌ **Automatic service discovery**: Adds magic, hidden behavior
- ❌ **Transparent network calls**: Hides failures, violates explicit errors principle
- ❌ **Code generation**: Adds build complexity, multiple sources of truth

**Recommended** (aligns with Light-FP):
- ✅ **User-provided adapters**: Explicit, composable, testable
- ✅ **ADT-based errors**: Type-safe, exhaustive, functional
- ✅ **Port pattern**: Location-transparent, dependency injection
- ✅ **Schema-based serialization**: Automatic, validated, type-safe

---

## Conclusion

**LFTS already has everything needed for distributed execution**—no core changes required!

The combination of:
- **Ports** (location-transparent interfaces)
- **AsyncResult** (composable async error handling)
- **Schemas** (automatic serialization/validation)
- **Result<T, E>** (explicit error types)

...creates a simpler, more type-safe alternative to traditional RPC frameworks.

The Light-FP approach **prioritizes simplicity and composability** over magic and framework complexity. Users explicitly compose resilience patterns (retry, circuit breaker, timeout) using plain functions and AsyncResult helpers—no heavyweight infrastructure required.

This design scales from simple microservices to complex distributed workflows while maintaining LFTS's core philosophy: **minimal, functional, and composable primitives over layered frameworks**.

---

## References

- [Distributed-Async-Await Specification](https://www.distributed-async-await.io/specification/programming-model)
- [EFFECTS_GUIDE.md](EFFECTS_GUIDE.md) - AsyncResult patterns
- [FEATURES.md](FEATURES.md) - Port validation and AsyncResult implementation
- [LANG-SPEC.md](LANG-SPEC.md) - Light-FP language rules
- [IMPROVEMENT_ANALYSIS.md](IMPROVEMENT_ANALYSIS.md) - Analysis of proposed language improvements
