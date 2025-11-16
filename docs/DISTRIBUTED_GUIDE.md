# LFTS Distributed Execution Guide

**Version**: 0.9.0 (Phase 2 Complete)
**Status**: Production Ready
**Bundle Size**: ~6KB minified (tree-shakeable)

## Overview

LFTS provides optional helpers for building distributed systems using the **Light-FP philosophy**: composable primitives over layered frameworks. The distributed module offers HTTP adapters and resilience patterns that work seamlessly with LFTS's `Result<T, E>` type and schema validation.

### Core Principles

1. **Distributed = Local + Network Errors**: All network operations return `Result<T, NetworkError>` for explicit error handling
2. **Schema-Driven Serialization**: Automatic validation at boundaries using LFTS bytecode schemas
3. **Composable Resilience**: Retry, circuit breaker, fallback, and timeout patterns compose via pure functions
4. **Location Transparency**: Port pattern abstracts transport (HTTP, RPC, local) behind interfaces
5. **Zero Framework**: No classes, no decorators, no magic—just functions and data

## Installation

The distributed helpers are built into the runtime package:

```typescript
import {
  httpGet,
  httpPost,
  httpPut,
  httpDelete,
  withRetry,
  createCircuitBreaker,
  withFallback,
  withTimeout,
  type NetworkError,
} from "./packages/lfts-type-runtime/distributed.ts";
```

**Zero external dependencies** - uses native `fetch` and `AbortController`.

## NetworkError ADT

All network operations return `Result<T, NetworkError>` where `NetworkError` is a discriminated union:

```typescript
type NetworkError =
  | { type: "timeout"; url: string; ms: number }
  | { type: "connection_refused"; url: string }
  | { type: "http_error"; url: string; status: number; body: string }
  | { type: "dns_failure"; domain: string }
  | { type: "serialization_error"; message: string; path?: string };
```

### Exhaustive Error Handling

Use pattern matching for exhaustive error handling:

```typescript
const result = await httpGet<User>(url, UserSchema);

if (!result.ok) {
  // Pattern match on error type
  if (result.error.type === "timeout") {
    console.log(`Timeout after ${result.error.ms}ms`);
  } else if (result.error.type === "http_error") {
    console.log(`HTTP ${result.error.status}: ${result.error.body}`);
  } else if (result.error.type === "connection_refused") {
    console.log(`Cannot reach ${result.error.url}`);
  } else if (result.error.type === "dns_failure") {
    console.log(`DNS failed for ${result.error.domain}`);
  } else if (result.error.type === "serialization_error") {
    console.log(`Invalid response: ${result.error.message}`);
  }
}
```

## HTTP Adapters

### httpGet

Fetch and validate JSON response:

```typescript
async function httpGet<T>(
  url: string,
  schema: TypeObject,
  options?: HttpOptions
): Promise<Result<T, NetworkError>>
```

**Example:**

```typescript
const result = await httpGet<User>(
  "https://api.example.com/users/123",
  UserSchema,
  {
    timeoutMs: 5000,
    headers: { "Authorization": "Bearer token" }
  }
);

if (result.ok) {
  console.log("User:", result.value);
} else {
  console.error("Failed:", result.error);
}
```

### httpPost

Send JSON request, validate response:

```typescript
async function httpPost<TRequest, TResponse>(
  url: string,
  requestData: TRequest,
  requestSchema: TypeObject,
  responseSchema: TypeObject,
  options?: HttpOptions
): Promise<Result<TResponse, NetworkError>>
```

**Example:**

```typescript
const newUser = { name: "Alice", email: "alice@example.com" };

const result = await httpPost<CreateUserRequest, User>(
  "https://api.example.com/users",
  newUser,
  CreateUserRequestSchema,
  UserSchema
);
```

### httpPut

Update resource:

```typescript
const result = await httpPut<UpdateUserRequest, User>(
  "https://api.example.com/users/123",
  { name: "Alice Updated" },
  UpdateUserRequestSchema,
  UserSchema
);
```

### httpDelete

Delete resource:

```typescript
const result = await httpDelete("https://api.example.com/users/123");

if (result.ok) {
  console.log("Deleted successfully");
}
```

### HttpOptions

```typescript
type HttpOptions = {
  timeoutMs?: number;           // Default: 5000
  headers?: Record<string, string>;
  method?: string;              // Override HTTP method
};
```

## Resilience Patterns

### withRetry - Exponential Backoff

Retry failed operations with exponential backoff:

```typescript
type RetryOptions<E> = {
  maxAttempts: number;
  initialDelayMs?: number;       // Default: 100
  backoffMultiplier?: number;    // Default: 2
  maxDelayMs?: number;           // Default: 10000
  shouldRetry?: (error: E, attempt: number) => boolean;
};
```

**Example:**

```typescript
const result = await withRetry(
  () => httpGet<User>(url, UserSchema),
  {
    maxAttempts: 3,
    initialDelayMs: 100,
    backoffMultiplier: 2,
    shouldRetry: (err) => {
      // Only retry transient errors
      return err.type === "timeout" ||
             err.type === "connection_refused" ||
             (err.type === "http_error" && err.status >= 500);
    }
  }
);
```

**Backoff calculation:** `delay = min(initialDelay * backoff^attempt, maxDelay)`

### createCircuitBreaker - Fault Tolerance

Prevent cascading failures with circuit breaker pattern:

```typescript
type CircuitBreakerOptions = {
  failureThreshold?: number;    // Default: 5
  successThreshold?: number;    // Default: 2
  timeoutMs?: number;           // Default: 60000
};

type CircuitState = "closed" | "open" | "half_open";
```

**States:**
- **closed**: Normal operation, requests pass through
- **open**: Too many failures, reject requests immediately
- **half_open**: Testing recovery, allow limited requests

**Example:**

```typescript
const breaker = createCircuitBreaker({
  failureThreshold: 5,    // Open after 5 failures
  successThreshold: 2,    // Close after 2 successes in half-open
  timeoutMs: 60000        // Wait 60s before half-open
});

const result = await breaker.execute(() =>
  httpGet<User>(url, UserSchema)
);

console.log("Circuit state:", breaker.getState());
```

**Error Type:**

```typescript
type CircuitBreakerError = {
  type: "circuit_open";
  message: string;
};
```

### withFallback - Graceful Degradation

Fall back to alternative source on failure:

```typescript
const result = await withFallback(
  httpGet<Config>(remoteUrl, ConfigSchema),
  Promise.resolve(Result.ok(DEFAULT_CONFIG))
);
```

**Use cases:**
- Cached data fallback
- Default configuration
- Degraded service mode

### withTimeout - Custom Timeouts

Add timeout to any async Result operation:

```typescript
const result = await withTimeout(
  httpGet<User>(url, UserSchema),
  1000,                  // 1 second timeout
  "user-service"         // Service name for error message
);

if (!result.ok && result.error.type === "timeout") {
  console.error("Request exceeded 1s timeout");
}
```

## Pattern Composition

All patterns are pure functions that compose via standard function composition:

### Retry + Circuit Breaker

```typescript
const breaker = createCircuitBreaker({ failureThreshold: 5 });

const result = await withRetry(
  () => breaker.execute(() => httpGet<User>(url, UserSchema)),
  {
    maxAttempts: 3,
    shouldRetry: (err) => err.type !== "circuit_open"
  }
);
```

### Retry + Fallback

```typescript
const result = await withRetry(
  () => withFallback(
    httpGet<Config>(remoteUrl, ConfigSchema),
    Promise.resolve(Result.ok(DEFAULT_CONFIG))
  ),
  { maxAttempts: 2 }
);
```

### Full Stack (Timeout + Retry + Circuit Breaker + Fallback)

```typescript
const breaker = createCircuitBreaker({ failureThreshold: 3 });

const result = await withRetry(
  () => withFallback(
    withTimeout(
      breaker.execute(() => httpGet<Product>(url, ProductSchema)),
      2000,
      "inventory-service"
    ),
    Promise.resolve(Result.ok(DEFAULT_PRODUCT))
  ),
  {
    maxAttempts: 2,
    shouldRetry: (err) => err.type === "timeout"
  }
);
```

## Port Pattern (Location Transparency)

Abstract transport behind interfaces:

### Define Port Interface

```typescript
interface UserServicePort {
  getUser(id: number): Promise<Result<User, NetworkError>>;
  createUser(user: Omit<User, "id">): Promise<Result<User, NetworkError>>;
  deleteUser(id: number): Promise<Result<void, NetworkError>>;
}
```

### HTTP Adapter Implementation

```typescript
function createUserServiceAdapter(baseUrl: string): UserServicePort {
  const breaker = createCircuitBreaker({ failureThreshold: 5 });

  return {
    getUser: (id) =>
      withRetry(
        () => breaker.execute(() =>
          httpGet<User>(`${baseUrl}/users/${id}`, UserSchema)
        ),
        { maxAttempts: 3 }
      ),

    createUser: (user) =>
      httpPost<Omit<User, "id">, User>(
        `${baseUrl}/users`,
        user,
        CreateUserRequestSchema,
        UserSchema
      ),

    deleteUser: (id) =>
      httpDelete(`${baseUrl}/users/${id}`)
  };
}
```

### Business Logic (Transport-Agnostic)

```typescript
async function processUser(
  userService: UserServicePort,
  userId: number
): Promise<Result<void, NetworkError>> {
  const userResult = await userService.getUser(userId);

  if (!userResult.ok) {
    return userResult;
  }

  // Business logic here...
  return Result.ok(undefined);
}

// Usage with HTTP adapter
const httpAdapter = createUserServiceAdapter("https://api.example.com");
await processUser(httpAdapter, 123);

// Usage with mock (for tests)
const mockAdapter = createMockUserService();
await processUser(mockAdapter, 123);
```

## Real-World Example: Order Processing

Complete e-commerce workflow with resilience:

```typescript
type OrderWorkflowError =
  | NetworkError
  | { type: "circuit_open"; message: string }
  | { type: "payment_failed"; reason: string };

async function processOrder(
  request: CreateOrderRequest
): Promise<Result<Order, OrderWorkflowError>> {
  // Step 1: Validate user (with retry)
  const userResult = await withRetry(
    () => httpGet<User>(`/users/${request.userId}`, UserSchema),
    { maxAttempts: 3 }
  );

  if (!userResult.ok) {
    return userResult;
  }

  // Step 2: Create order (with timeout)
  const orderResult = await withTimeout(
    httpPost<CreateOrderRequest, Order>(
      "/orders",
      request,
      CreateOrderRequestSchema,
      OrderSchema
    ),
    5000,
    "order-service"
  );

  if (!orderResult.ok) {
    return orderResult;
  }

  // Step 3: Process payment (with circuit breaker)
  const paymentBreaker = createCircuitBreaker({ failureThreshold: 3 });

  const paymentResult = await paymentBreaker.execute(() =>
    httpPost<PaymentRequest, PaymentResponse>(
      "/payments",
      { orderId: orderResult.value.id, amount: orderResult.value.total },
      PaymentRequestSchema,
      PaymentResponseSchema
    )
  );

  if (!paymentResult.ok) {
    // Compensating action: cancel order
    await httpDelete(`/orders/${orderResult.value.id}`);
    return paymentResult;
  }

  // Step 4: Schedule shipping (with fallback to manual processing)
  await withFallback(
    httpPost<ShippingRequest, ShippingResponse>(
      "/shipping",
      { orderId: orderResult.value.id },
      ShippingRequestSchema,
      ShippingResponseSchema
    ),
    Promise.resolve(Result.ok({ scheduled: false }))
  );

  return Result.ok(orderResult.value);
}
```

## Performance Characteristics

- **HTTP adapters**: ~1-2ms overhead for validation (vs raw fetch)
- **Retry**: Adds backoff delays only (no overhead on success path)
- **Circuit breaker**: ~0.1ms overhead per call (state check + counter update)
- **Fallback**: ~0.1ms overhead (single conditional)
- **Timeout**: ~0.1ms overhead (Promise.race + cleanup)

**Bundle size**: ~6KB minified for full distributed module (tree-shakeable)

## Comparison with Alternatives

| Feature | LFTS Distributed | gRPC | tRPC | Actor Model |
|---------|------------------|------|------|-------------|
| Philosophy | Composable primitives | Code generation | Type-safe RPC | OOP + message passing |
| Bundle Size | 6KB | 100KB+ | 50KB+ | 200KB+ |
| Runtime Overhead | Minimal (validation only) | Protobuf encoding | Type checking | Actor scheduling |
| Error Handling | Explicit Result ADT | Exceptions | Exceptions | Supervision trees |
| Resilience | Composed functions | External (Envoy) | Manual | Built-in (OTP) |
| Learning Curve | Low (if know FP) | Medium (proto DSL) | Low (if know TS) | High (new paradigm) |
| Tree-shakeable | Yes | No | Partial | No |

## Best Practices

### 1. Use Ports for All Remote Services

```typescript
// ✓ Good: Port abstraction
interface PaymentPort {
  charge(request: ChargeRequest): Promise<Result<Receipt, PaymentError>>;
}

// ✗ Bad: Direct HTTP calls in business logic
async function processOrder() {
  const receipt = await httpPost(...); // Tightly coupled
}
```

### 2. Only Retry Transient Errors

```typescript
// ✓ Good: Selective retry
shouldRetry: (err) =>
  err.type === "timeout" ||
  err.type === "connection_refused" ||
  (err.type === "http_error" && err.status >= 500)

// ✗ Bad: Retry everything (including 404, 401, etc.)
shouldRetry: () => true
```

### 3. Set Realistic Timeouts

```typescript
// ✓ Good: Service-specific timeouts
const fastService = { timeoutMs: 1000 };   // Reads
const slowService = { timeoutMs: 10000 };  // Writes

// ✗ Bad: One-size-fits-all
const timeout = 30000; // Too generous for most operations
```

### 4. Use Circuit Breakers for External Dependencies

```typescript
// ✓ Good: One breaker per external service
const paymentBreaker = createCircuitBreaker(...);
const shippingBreaker = createCircuitBreaker(...);

// ✗ Bad: Global breaker for all services
const globalBreaker = createCircuitBreaker(...); // Affects unrelated services
```

### 5. Validate at System Boundaries

```typescript
// ✓ Good: Schema validation at network boundary
const result = await httpGet<User>(url, UserSchema);

// ✗ Bad: Skip validation, assume correct format
const result = await fetch(url).then(r => r.json()); // Unsafe
```

## Troubleshooting

### Common Issues

**Problem**: `serialization_error` even though JSON looks correct

**Solution**: Check schema definition. LFTS validates strictly:
```typescript
// If API returns { id: "123" } but schema expects number
const UserSchema = enc.obj([
  { name: "id", type: enc.num() }, // Will fail if API sends string
]);
```

**Problem**: Circuit breaker opens too aggressively

**Solution**: Increase failure threshold or check `shouldRetry` predicate:
```typescript
const breaker = createCircuitBreaker({
  failureThreshold: 10, // Increased from 5
  timeoutMs: 30000      // Reduced cooldown from 60s
});
```

**Problem**: Retries exhausted but service is available

**Solution**: Check network latency and increase timeout:
```typescript
const result = await httpGet<User>(url, UserSchema, {
  timeoutMs: 10000 // Increased from default 5000
});
```

## See Also

- [EFFECTS_GUIDE.md](./EFFECTS_GUIDE.md) - AsyncResult patterns and effect handling
- [FEATURES.md](./FEATURES.md) - Complete LFTS feature list
- [DISTRIBUTED_EXECUTION.md](./DISTRIBUTED_EXECUTION.md) - Design rationale and architecture

## Examples

Run the complete example suite:

```bash
deno run -A packages/lfts-type-runtime/distributed-example.ts
```

This demonstrates:
1. Basic HTTP operations (GET, POST, PUT, DELETE)
2. Retry with exponential backoff
3. Circuit breaker state transitions
4. Fallback to cached data
5. Custom timeout handling
6. Composed resilience patterns
7. Complete order processing workflow
8. Port pattern for location transparency
