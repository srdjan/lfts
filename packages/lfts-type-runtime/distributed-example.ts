// packages/lfts-type-runtime/distributed-example.ts
// Comprehensive examples demonstrating distributed execution patterns in LFTS

import {
  createCircuitBreaker,
  httpDelete,
  httpGet,
  httpPost,
  httpPut,
  type NetworkError,
  withFallback,
  withRetry,
  withTimeout,
} from "./distributed.ts";
import { Result } from "./mod.ts";
import { enc } from "../lfts-type-spec/src/mod.ts";

// ============================================================================
// Example Domain: E-commerce Order Processing
// ============================================================================

// Type Definitions
type User = {
  readonly id: number;
  readonly name: string;
  readonly email: string;
};

type Product = {
  readonly id: number;
  readonly name: string;
  readonly price: number;
  readonly stock: number;
};

type Order = {
  readonly id: number;
  readonly userId: number;
  readonly items: readonly OrderItem[];
  readonly total: number;
  readonly status: "pending" | "confirmed" | "shipped" | "delivered";
};

type OrderItem = {
  readonly productId: number;
  readonly quantity: number;
  readonly price: number;
};

type CreateOrderRequest = {
  readonly userId: number;
  readonly items: readonly OrderItem[];
};

type PaymentRequest = {
  readonly orderId: number;
  readonly amount: number;
  readonly method: "card" | "paypal";
};

type ShippingRequest = {
  readonly orderId: number;
  readonly address: string;
};

// Schemas
const UserSchema = enc.obj([
  { name: "id", type: enc.num() },
  { name: "name", type: enc.str() },
  { name: "email", type: enc.str() },
]);

const ProductSchema = enc.obj([
  { name: "id", type: enc.num() },
  { name: "name", type: enc.str() },
  { name: "price", type: enc.num() },
  { name: "stock", type: enc.num() },
]);

const OrderItemSchema = enc.obj([
  { name: "productId", type: enc.num() },
  { name: "quantity", type: enc.num() },
  { name: "price", type: enc.num() },
]);

const OrderSchema = enc.obj([
  { name: "id", type: enc.num() },
  { name: "userId", type: enc.num() },
  { name: "items", type: enc.arr(OrderItemSchema) },
  { name: "total", type: enc.num() },
  { name: "status", type: enc.union([enc.lit("pending"), enc.lit("confirmed"), enc.lit("shipped"), enc.lit("delivered")]) },
]);

const CreateOrderRequestSchema = enc.obj([
  { name: "userId", type: enc.num() },
  { name: "items", type: enc.arr(OrderItemSchema) },
]);

const PaymentRequestSchema = enc.obj([
  { name: "orderId", type: enc.num() },
  { name: "amount", type: enc.num() },
  { name: "method", type: enc.union([enc.lit("card"), enc.lit("paypal")]) },
]);

const ShippingRequestSchema = enc.obj([
  { name: "orderId", type: enc.num() },
  { name: "address", type: enc.str() },
]);

// ============================================================================
// Example 1: Basic HTTP Operations
// ============================================================================

async function example1_BasicHTTP() {
  console.log("\n=== Example 1: Basic HTTP Operations ===\n");

  // GET request with validation
  const userResult = await httpGet<User>(
    "https://jsonplaceholder.typicode.com/users/1",
    UserSchema
  );

  if (userResult.ok) {
    console.log("✓ User fetched:", userResult.value.name);
  } else {
    console.error("✗ Failed to fetch user:", userResult.error);
  }

  // POST request
  const newUser: User = {
    id: 0,
    name: "Alice Smith",
    email: "alice@example.com",
  };

  const createResult = await httpPost<User, User>(
    "https://jsonplaceholder.typicode.com/users",
    newUser,
    UserSchema,
    UserSchema
  );

  if (createResult.ok) {
    console.log("✓ User created with ID:", createResult.value.id);
  } else {
    console.error("✗ Failed to create user:", createResult.error);
  }
}

// ============================================================================
// Example 2: Retry Pattern
// ============================================================================

async function example2_RetryPattern() {
  console.log("\n=== Example 2: Retry with Exponential Backoff ===\n");

  // Retry transient failures (timeouts, connection issues)
  const result = await withRetry(
    () =>
      httpGet<User>(
        "https://jsonplaceholder.typicode.com/users/1",
        UserSchema,
        { timeoutMs: 5000 }
      ),
    {
      maxAttempts: 3,
      initialDelayMs: 100,
      backoffMultiplier: 2,
      shouldRetry: (error) => {
        // Only retry transient errors
        return (
          error.type === "timeout" ||
          error.type === "connection_refused" ||
          (error.type === "http_error" && error.status >= 500)
        );
      },
    }
  );

  if (result.ok) {
    console.log("✓ Request succeeded (possibly after retries):", result.value.name);
  } else {
    console.error("✗ Request failed after all retries:", result.error);
  }
}

// ============================================================================
// Example 3: Circuit Breaker Pattern
// ============================================================================

async function example3_CircuitBreaker() {
  console.log("\n=== Example 3: Circuit Breaker ===\n");

  // Create circuit breaker for payment service
  const paymentBreaker = createCircuitBreaker<{ success: boolean }, NetworkError>({
    failureThreshold: 5, // Open after 5 failures
    successThreshold: 2, // Close after 2 successes in half-open
    timeoutMs: 60000, // Wait 60s before trying half-open
  });

  // Simulate multiple calls
  for (let i = 0; i < 3; i++) {
    const result = await paymentBreaker.execute(() =>
      httpGet<{ success: boolean }>(
        "https://jsonplaceholder.typicode.com/users/1",
        enc.obj([{ name: "success", type: enc.bool() }])
      )
    );

    console.log(`Call ${i + 1}: State=${paymentBreaker.getState()}, Success=${result.ok}`);

    if (!result.ok) {
      const error = result.error as NetworkError | { type: "circuit_open"; message: string };
      if (error.type === "circuit_open") {
        console.log("  ⚡ Circuit is open, request rejected immediately");
      }
    }
  }
}

// ============================================================================
// Example 4: Fallback Pattern
// ============================================================================

async function example4_FallbackPattern() {
  console.log("\n=== Example 4: Fallback to Cache ===\n");

  // Cached data as fallback
  const cachedUser: User = {
    id: 1,
    name: "Cached User",
    email: "cached@example.com",
  };

  const result = await withFallback(
    httpGet<User>(
      "https://jsonplaceholder.typicode.com/users/1",
      UserSchema,
      { timeoutMs: 2000 }
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

async function example5_TimeoutWrapper() {
  console.log("\n=== Example 5: Custom Timeout ===\n");

  // Add aggressive timeout to slow service
  const result = await withTimeout(
    httpGet<User>(
      "https://jsonplaceholder.typicode.com/users/1",
      UserSchema
    ),
    1000, // 1 second timeout
    "user-service"
  );

  if (result.ok) {
    console.log("✓ Request completed within timeout:", result.value.name);
  } else {
    if (result.error.type === "timeout") {
      console.error("✗ Request exceeded 1s timeout");
    } else {
      console.error("✗ Request failed:", result.error);
    }
  }
}

// ============================================================================
// Example 6: Composed Resilience (Retry + Circuit Breaker + Fallback)
// ============================================================================

async function example6_ComposedResilience() {
  console.log("\n=== Example 6: Composed Resilience Patterns ===\n");

  // Circuit breaker for inventory service
  const inventoryBreaker = createCircuitBreaker({
    failureThreshold: 3,
    successThreshold: 2,
    timeoutMs: 30000,
  });

  // Default inventory data
  const defaultProduct: Product = {
    id: 0,
    name: "Default Product",
    price: 0,
    stock: 0,
  };

  // Combine: Retry -> Circuit Breaker -> Fallback
  const result = await withRetry(
    () =>
      withFallback(
        inventoryBreaker.execute(() =>
          httpGet<Product>(
            "https://jsonplaceholder.typicode.com/users/1",
            ProductSchema
          )
        ),
        Promise.resolve(Result.ok(defaultProduct))
      ),
    {
      maxAttempts: 2,
      initialDelayMs: 50,
      shouldRetry: (error) => error.type === "timeout",
    }
  );

  if (result.ok) {
    console.log("✓ Product retrieved:", result.value.name);
    console.log(`  Circuit breaker state: ${inventoryBreaker.getState()}`);
  }
}

// ============================================================================
// Example 7: Real-World Workflow (Order Processing)
// ============================================================================

type OrderWorkflowError =
  | NetworkError
  | { type: "circuit_open"; message: string }
  | { type: "insufficient_stock"; productId: number }
  | { type: "payment_failed"; reason: string };

async function example7_OrderWorkflow() {
  console.log("\n=== Example 7: Complete Order Processing Workflow ===\n");

  const orderRequest: CreateOrderRequest = {
    userId: 1,
    items: [
      { productId: 101, quantity: 2, price: 29.99 },
      { productId: 102, quantity: 1, price: 49.99 },
    ],
  };

  // Step 1: Validate user exists (with retry)
  console.log("Step 1: Validating user...");
  const userResult = await withRetry(
    () =>
      httpGet<User>(
        `https://jsonplaceholder.typicode.com/users/${orderRequest.userId}`,
        UserSchema
      ),
    { maxAttempts: 3, initialDelayMs: 100 }
  );

  if (!userResult.ok) {
    console.error("✗ User validation failed:", userResult.error);
    return;
  }
  console.log("✓ User validated:", userResult.value.email);

  // Step 2: Create order (with timeout)
  console.log("\nStep 2: Creating order...");
  const orderResult = await withTimeout(
    httpPost<CreateOrderRequest, Order>(
      "https://jsonplaceholder.typicode.com/posts",
      orderRequest,
      CreateOrderRequestSchema,
      OrderSchema
    ),
    5000,
    "order-service"
  );

  if (!orderResult.ok) {
    console.error("✗ Order creation failed:", orderResult.error);
    return;
  }
  console.log("✓ Order created with ID:", orderResult.value.id);

  // Step 3: Process payment (with circuit breaker)
  console.log("\nStep 3: Processing payment...");
  const paymentBreaker = createCircuitBreaker({ failureThreshold: 3 });

  const paymentRequest: PaymentRequest = {
    orderId: orderResult.value.id,
    amount: orderResult.value.total,
    method: "card",
  };

  const paymentResult = await paymentBreaker.execute(() =>
    httpPost<PaymentRequest, { success: boolean }>(
      "https://jsonplaceholder.typicode.com/posts",
      paymentRequest,
      PaymentRequestSchema,
      enc.obj([{ name: "success", type: enc.bool() }])
    )
  );

  if (!paymentResult.ok) {
    console.error("✗ Payment failed:", paymentResult.error);
    // Compensating action: cancel order
    console.log("  Cancelling order...");
    await httpDelete(
      `https://jsonplaceholder.typicode.com/posts/${orderResult.value.id}`
    );
    return;
  }
  console.log("✓ Payment processed");

  // Step 4: Schedule shipping (with fallback to manual processing)
  console.log("\nStep 4: Scheduling shipping...");
  const shippingRequest: ShippingRequest = {
    orderId: orderResult.value.id,
    address: "123 Main St",
  };

  const shippingResult = await withFallback(
    httpPost<ShippingRequest, { scheduled: boolean }>(
      "https://jsonplaceholder.typicode.com/posts",
      shippingRequest,
      ShippingRequestSchema,
      enc.obj([{ name: "scheduled", type: enc.bool() }])
    ),
    Promise.resolve(Result.ok({ scheduled: false })) // Fallback to manual
  );

  if (shippingResult.ok) {
    if (shippingResult.value.scheduled) {
      console.log("✓ Shipping scheduled automatically");
    } else {
      console.log("⚠ Shipping requires manual processing");
    }
  }

  console.log("\n✓ Order workflow completed successfully!");
}

// ============================================================================
// Example 8: Port-Based Architecture (Dependency Injection)
// ============================================================================

// Define port interfaces
interface UserServicePort {
  getUser(id: number): Promise<Result<User, NetworkError>>;
  createUser(user: Omit<User, "id">): Promise<Result<User, NetworkError>>;
}

interface OrderServicePort {
  createOrder(request: CreateOrderRequest): Promise<Result<Order, OrderWorkflowError>>;
  getOrder(id: number): Promise<Result<Order, NetworkError>>;
}

// HTTP adapter implementation
function createUserServiceAdapter(baseUrl: string): UserServicePort {
  const breaker = createCircuitBreaker({ failureThreshold: 5 });

  return {
    getUser: (id: number) =>
      withRetry(
        () =>
          breaker.execute(() =>
            httpGet<User>(`${baseUrl}/users/${id}`, UserSchema)
          ),
        { maxAttempts: 3, initialDelayMs: 100 }
      ),

    createUser: (user: Omit<User, "id">) =>
      httpPost<Omit<User, "id">, User>(
        `${baseUrl}/users`,
        user,
        enc.obj([
          { name: "name", type: enc.str() },
          { name: "email", type: enc.str() },
        ]),
        UserSchema
      ),
  };
}

async function example8_PortPattern() {
  console.log("\n=== Example 8: Port Pattern (Location Transparency) ===\n");

  // Create service adapter (could swap for mock, local, etc.)
  const userService = createUserServiceAdapter("https://jsonplaceholder.typicode.com");

  // Business logic depends on port interface, not transport
  const result = await userService.getUser(1);

  if (result.ok) {
    console.log("✓ User service call succeeded:", result.value.name);
    console.log("  (Transport details abstracted by port)");
  } else {
    console.error("✗ User service call failed:", result.error);
  }
}

// ============================================================================
// Run All Examples
// ============================================================================

async function runAllExamples() {
  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║  LFTS Distributed Execution Patterns - Examples           ║");
  console.log("╚════════════════════════════════════════════════════════════╝");

  try {
    await example1_BasicHTTP();
    await example2_RetryPattern();
    await example3_CircuitBreaker();
    await example4_FallbackPattern();
    await example5_TimeoutWrapper();
    await example6_ComposedResilience();
    await example7_OrderWorkflow();
    await example8_PortPattern();

    console.log("\n" + "=".repeat(60));
    console.log("✓ All examples completed");
    console.log("=".repeat(60) + "\n");
  } catch (error) {
    console.error("\n✗ Example execution failed:", error);
  }
}

// Run if executed directly
if (import.meta.main) {
  runAllExamples();
}
