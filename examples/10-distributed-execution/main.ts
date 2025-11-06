// examples/10-distributed-execution/main.ts
// Demo application showing all distributed execution patterns

import { Result } from "../../packages/lfts-type-runtime/mod.ts";
import {
  createCircuitBreaker,
  httpGet,
  type NetworkError,
  withFallback,
  withRetry,
  withTimeout,
} from "../../packages/lfts-type-runtime/distributed.ts";
import type { CreateOrderRequest, User } from "./types.ts";
import { UserSchema } from "./schemas.ts";
import {
  createUserServiceAdapter,
  processUser,
} from "./user-service.ts";
import { processOrderWorkflow } from "./order-workflow.ts";

// ============================================================================
// Example 1: Basic HTTP with Validation
// ============================================================================

async function example1_BasicHTTP() {
  console.log("\n╔════════════════════════════════════════════════════════════╗");
  console.log("║  Example 1: Basic HTTP with Validation                    ║");
  console.log("╚════════════════════════════════════════════════════════════╝\n");

  const result = await httpGet<User>(
    "https://jsonplaceholder.typicode.com/users/1",
    UserSchema
  );

  if (result.ok) {
    console.log("✓ Success! User:", result.value.name);
    console.log("  Email:", result.value.email);
  } else {
    console.error("✗ Failed:", result.error.type);
  }
}

// ============================================================================
// Example 2: Retry with Exponential Backoff
// ============================================================================

async function example2_Retry() {
  console.log("\n╔════════════════════════════════════════════════════════════╗");
  console.log("║  Example 2: Retry with Exponential Backoff                ║");
  console.log("╚════════════════════════════════════════════════════════════╝\n");

  let attempts = 0;

  const result = await withRetry(
    async () => {
      attempts++;
      console.log(`  Attempt ${attempts}...`);
      return await httpGet<User>(
        "https://jsonplaceholder.typicode.com/users/1",
        UserSchema,
        { timeoutMs: 5000 }
      );
    },
    {
      maxAttempts: 3,
      initialDelayMs: 100,
      backoffMultiplier: 2,
      shouldRetry: (err) => {
        console.log(`  Error: ${err.type}, retrying...`);
        return (
          err.type === "timeout" ||
          err.type === "connection_refused" ||
          (err.type === "http_error" && err.status >= 500)
        );
      },
    }
  );

  if (result.ok) {
    console.log(`✓ Success after ${attempts} attempt(s)!`);
    console.log("  User:", result.value.name);
  } else {
    console.error(`✗ Failed after ${attempts} attempts:`, result.error.type);
  }
}

// ============================================================================
// Example 3: Circuit Breaker
// ============================================================================

async function example3_CircuitBreaker() {
  console.log("\n╔════════════════════════════════════════════════════════════╗");
  console.log("║  Example 3: Circuit Breaker                                ║");
  console.log("╚════════════════════════════════════════════════════════════╝\n");

  const breaker = createCircuitBreaker({
    failureThreshold: 3,
    successThreshold: 2,
    timeoutMs: 5000,
  });

  // Make 3 successful calls
  for (let i = 1; i <= 3; i++) {
    const result = await breaker.execute(() =>
      httpGet<User>(
        `https://jsonplaceholder.typicode.com/users/${i}`,
        UserSchema
      )
    );

    console.log(`Call ${i}: State=${breaker.getState()}, Success=${result.ok}`);
    if (result.ok) {
      console.log(`  User: ${result.value.name}`);
    }
  }
}

// ============================================================================
// Example 4: Fallback Pattern
// ============================================================================

async function example4_Fallback() {
  console.log("\n╔════════════════════════════════════════════════════════════╗");
  console.log("║  Example 4: Fallback to Cached Data                       ║");
  console.log("╚════════════════════════════════════════════════════════════╝\n");

  const cachedUser: User = {
    id: 999,
    name: "Cached User",
    email: "cached@example.com",
  };

  const result = await withFallback(
    httpGet<User>(
      "https://jsonplaceholder.typicode.com/users/1",
      UserSchema
    ),
    Promise.resolve(Result.ok(cachedUser))
  );

  if (result.ok) {
    console.log("✓ User:", result.value.name);
    if (result.value.id === cachedUser.id) {
      console.log("  (Served from cache)");
    } else {
      console.log("  (Served from remote)");
    }
  }
}

// ============================================================================
// Example 5: Timeout Wrapper
// ============================================================================

async function example5_Timeout() {
  console.log("\n╔════════════════════════════════════════════════════════════╗");
  console.log("║  Example 5: Custom Timeout                                 ║");
  console.log("╚════════════════════════════════════════════════════════════╝\n");

  const result = await withTimeout(
    httpGet<User>(
      "https://jsonplaceholder.typicode.com/users/1",
      UserSchema
    ),
    3000, // 3 second timeout
    "user-service"
  );

  if (result.ok) {
    console.log("✓ Request completed within timeout");
    console.log("  User:", result.value.name);
  } else {
    if (result.error.type === "timeout") {
      console.error("✗ Request exceeded 3s timeout");
    } else {
      console.error("✗ Request failed:", result.error.type);
    }
  }
}

// ============================================================================
// Example 6: Composed Resilience
// ============================================================================

async function example6_ComposedResilience() {
  console.log("\n╔════════════════════════════════════════════════════════════╗");
  console.log("║  Example 6: All Patterns Combined                         ║");
  console.log("╚════════════════════════════════════════════════════════════╝\n");

  const breaker = createCircuitBreaker({
    failureThreshold: 5,
    timeoutMs: 30000,
  });

  const cachedUser: User = {
    id: 999,
    name: "Fallback User",
    email: "fallback@example.com",
  };

  // Compose: Retry -> Fallback -> Circuit Breaker -> HTTP with Timeout
  const result = await withRetry(
    () =>
      withFallback(
        breaker.execute(() =>
          httpGet<User>(
            "https://jsonplaceholder.typicode.com/users/1",
            UserSchema,
            { timeoutMs: 2000 }
          )
        ),
        Promise.resolve(Result.ok(cachedUser))
      ),
    {
      maxAttempts: 2,
      initialDelayMs: 50,
      shouldRetry: (err) => err.type === "timeout",
    }
  );

  console.log("✓ Result:", result.ok ? result.value.name : "Failed");
  console.log("  Circuit breaker state:", breaker.getState());
}

// ============================================================================
// Example 7: Port Pattern (Location Transparency)
// ============================================================================

async function example7_PortPattern() {
  console.log("\n╔════════════════════════════════════════════════════════════╗");
  console.log("║  Example 7: Port Pattern (Location Transparency)          ║");
  console.log("╚════════════════════════════════════════════════════════════╝\n");

  // Create service adapter - could swap for mock, local, etc.
  const userService = createUserServiceAdapter(
    "https://jsonplaceholder.typicode.com"
  );

  // Business logic depends on port interface, not transport
  const result = await processUser(userService, 1);

  if (result.ok) {
    console.log("✓", result.value);
  } else {
    console.error("✗ Failed:", result.error.type);
  }
}

// ============================================================================
// Example 8: Real-World Workflow (Simulated)
// ============================================================================

async function example8_OrderWorkflow() {
  console.log("\n╔════════════════════════════════════════════════════════════╗");
  console.log("║  Example 8: Order Processing Workflow (Simulated)         ║");
  console.log("╚════════════════════════════════════════════════════════════╝");

  const orderRequest: CreateOrderRequest = {
    userId: 1,
    items: [
      { productId: 101, quantity: 2, price: 29.99 },
      { productId: 102, quantity: 1, price: 49.99 },
    ],
  };

  console.log("\nNote: This workflow uses real API endpoints where available.");
  console.log("Some steps may fail gracefully due to API limitations.\n");

  const result = await processOrderWorkflow(
    "https://jsonplaceholder.typicode.com",
    orderRequest
  );

  if (result.ok) {
    console.log("\n✓ Order completed! Order ID:", result.value.id);
  } else {
    console.log("\n✗ Order workflow failed");
    if ("type" in result.error) {
      console.log("  Error type:", result.error.type);
    }
  }
}

// ============================================================================
// Main Entry Point
// ============================================================================

async function main() {
  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║  LFTS Distributed Execution - Examples                    ║");
  console.log("║  v0.9.0 - Composable Primitives Over Frameworks           ║");
  console.log("╚════════════════════════════════════════════════════════════╝");

  try {
    await example1_BasicHTTP();
    await example2_Retry();
    await example3_CircuitBreaker();
    await example4_Fallback();
    await example5_Timeout();
    await example6_ComposedResilience();
    await example7_PortPattern();
    await example8_OrderWorkflow();

    console.log("\n" + "=".repeat(60));
    console.log("✓ All examples completed successfully!");
    console.log("=".repeat(60) + "\n");
  } catch (error) {
    console.error("\n✗ Example execution failed:", error);
  }
}

// Run if executed directly
if (import.meta.main) {
  main();
}
