// examples/10-distributed-execution/user-service.ts
// User service with resilience patterns

import { Result } from "../../packages/lfts-type-runtime/mod.ts";
import {
  createCircuitBreaker,
  httpGet,
  type NetworkError,
  withFallback,
  withRetry,
} from "../../packages/lfts-type-runtime/distributed.ts";
import type { User } from "./types.ts";
import { UserSchema } from "./schemas.ts";

// Port interface - location transparent
export interface UserServicePort {
  getUser(id: number): Promise<Result<User, NetworkError>>;
}

// Default user for fallback
const DEFAULT_USER: User = {
  id: 0,
  name: "Guest User",
  email: "guest@example.com",
};

/**
 * Create a resilient user service adapter with retry, circuit breaker, and fallback.
 *
 * This demonstrates composing all resilience patterns:
 * 1. Circuit breaker - prevents cascading failures
 * 2. Retry with exponential backoff - handles transient failures
 * 3. Fallback - provides default when remote fails
 */
export function createUserServiceAdapter(baseUrl: string): UserServicePort {
  // Circuit breaker shared across all calls to this service
  const breaker = createCircuitBreaker({
    failureThreshold: 5, // Open after 5 failures
    successThreshold: 2, // Close after 2 successes in half-open
    timeoutMs: 60000, // Wait 60s before trying half-open
  });

  return {
    getUser: async (id: number) => {
      return await withRetry(
        () =>
          withFallback(
            breaker.execute(() =>
              httpGet<User>(
                `${baseUrl}/users/${id}`,
                UserSchema,
                { timeoutMs: 2000 } // 2s timeout per request
              )
            ),
            Promise.resolve(Result.ok(DEFAULT_USER))
          ),
        {
          maxAttempts: 3,
          initialDelayMs: 100,
          backoffMultiplier: 2,
          shouldRetry: (err) => {
            // Only retry transient errors
            return (
              err.type === "timeout" ||
              err.type === "connection_refused" ||
              (err.type === "http_error" && err.status >= 500)
            );
          },
        }
      );
    },
  };
}

/**
 * Example of using the user service in business logic.
 *
 * Business logic depends on the port interface, not the transport.
 * This makes it easy to:
 * - Test with a mock implementation
 * - Switch between HTTP, gRPC, local, etc.
 * - Deploy the same code in different environments
 */
export async function processUser(
  userService: UserServicePort,
  userId: number
): Promise<Result<string, NetworkError>> {
  const result = await userService.getUser(userId);

  if (!result.ok) {
    return result;
  }

  const user = result.value;
  return Result.ok(`Processed user: ${user.name} (${user.email})`);
}
