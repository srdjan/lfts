# Example 10: Distributed Execution

This example demonstrates LFTS distributed execution helpers for building resilient microservices.

## What This Example Shows

1. **HTTP Adapters** - Schema-validated HTTP client
2. **NetworkError ADT** - Explicit error handling for all failure modes
3. **Resilience Patterns** - Retry, circuit breaker, fallback, timeout
4. **Pattern Composition** - Combining multiple resilience strategies
5. **Port Pattern** - Location transparency via dependency injection

## Files

- `types.ts` - Domain types (User, Order, Payment)
- `schemas.ts` - Runtime schemas for validation
- `user-service.ts` - User service with resilience patterns
- `order-workflow.ts` - Complete order processing workflow
- `main.ts` - Demo application showing all patterns

## Running the Example

```bash
# From the repository root
deno run -A examples/10-distributed-execution/main.ts
```

## What You'll Learn

### 1. Basic HTTP with Validation

```typescript
const result = await httpGet<User>(
  "https://api.example.com/users/123",
  UserSchema,
  { timeoutMs: 5000 }
);

if (result.ok) {
  console.log("User:", result.value);
} else {
  // All error modes are explicitly typed
  if (result.error.type === "timeout") {
    console.error("Request timed out");
  }
}
```

### 2. Retry with Exponential Backoff

```typescript
const result = await withRetry(
  () => httpGet<User>(url, UserSchema),
  {
    maxAttempts: 3,
    initialDelayMs: 100,
    backoffMultiplier: 2,
    shouldRetry: (err) =>
      err.type === "timeout" ||
      err.type === "connection_refused" ||
      (err.type === "http_error" && err.status >= 500)
  }
);
```

### 3. Circuit Breaker for Fault Tolerance

```typescript
const breaker = createCircuitBreaker({
  failureThreshold: 5,    // Open after 5 failures
  successThreshold: 2,    // Close after 2 successes
  timeoutMs: 60000        // Wait 60s before retry
});

const result = await breaker.execute(() =>
  httpGet<Config>(url, ConfigSchema)
);

console.log("Circuit state:", breaker.getState()); // closed | open | half_open
```

### 4. Fallback to Cached Data

```typescript
const result = await withFallback(
  httpGet<Config>(remoteUrl, ConfigSchema),
  Promise.resolve(Result.ok(DEFAULT_CONFIG))
);
```

### 5. Composed Resilience (All Patterns Together)

```typescript
const breaker = createCircuitBreaker({ failureThreshold: 5 });

const result = await withRetry(
  () => withFallback(
    breaker.execute(() =>
      httpGet<User>(url, UserSchema, { timeoutMs: 2000 })
    ),
    Promise.resolve(Result.ok(CACHED_USER))
  ),
  {
    maxAttempts: 3,
    shouldRetry: (err) => err.type === "timeout"
  }
);
```

### 6. Port Pattern (Location Transparency)

```typescript
// Define port interface
interface UserServicePort {
  getUser(id: number): Promise<Result<User, NetworkError>>;
}

// HTTP adapter implementation
function createUserServiceAdapter(baseUrl: string): UserServicePort {
  const breaker = createCircuitBreaker({ failureThreshold: 5 });

  return {
    getUser: (id) =>
      withRetry(
        () => breaker.execute(() =>
          httpGet<User>(`${baseUrl}/users/${id}`, UserSchema)
        ),
        { maxAttempts: 3 }
      )
  };
}

// Business logic depends on port, not transport
async function processUser(userService: UserServicePort, userId: number) {
  const result = await userService.getUser(userId);
  // ... business logic
}
```

## Philosophy

This example demonstrates the Light-FP approach to distributed systems:

- **Explicit over implicit** - All errors via `Result<T, NetworkError>` ADT
- **Composition over inheritance** - Pure functions compose naturally
- **Data over classes** - `NetworkError` is a discriminated union
- **Ports over coupling** - Location transparency via interfaces
- **Zero framework** - No decorators, no magic, just functions

## Next Steps

- Experiment with different resilience configurations
- Try combining patterns in different orders
- Implement compensating actions (sagas)
- Add metrics and observability hooks
- Build a complete microservice workflow

## Related Examples

- [07-async-result](../07-async-result/) - AsyncResult combinators
- [09-mini-application](../09-mini-application/) - Complete LFTS application

## See Also

- [docs/DISTRIBUTED_GUIDE.md](../../docs/DISTRIBUTED_GUIDE.md) - Complete guide
- [packages/lfts-type-runtime/distributed-example.ts](../../packages/lfts-type-runtime/distributed-example.ts) - More examples
