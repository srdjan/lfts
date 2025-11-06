// examples/10-distributed-execution/order-workflow.ts
// Complete order processing workflow with resilience

import { Result } from "../../packages/lfts-type-runtime/mod.ts";
import {
  createCircuitBreaker,
  httpDelete,
  httpGet,
  httpPost,
  type NetworkError,
  withTimeout,
} from "../../packages/lfts-type-runtime/distributed.ts";
import type {
  CreateOrderRequest,
  Order,
  PaymentRequest,
  PaymentResponse,
  User,
} from "./types.ts";
import {
  CreateOrderRequestSchema,
  OrderSchema,
  PaymentRequestSchema,
  PaymentResponseSchema,
  UserSchema,
} from "./schemas.ts";

type OrderWorkflowError =
  | NetworkError
  | { type: "circuit_open"; message: string }
  | { type: "payment_failed"; reason: string };

/**
 * Complete order processing workflow demonstrating:
 * 1. Validation step (user exists)
 * 2. Order creation with timeout
 * 3. Payment processing with circuit breaker
 * 4. Compensating action (cancel order on payment failure)
 */
export async function processOrderWorkflow(
  baseUrl: string,
  request: CreateOrderRequest
): Promise<Result<Order, OrderWorkflowError>> {
  console.log("\n=== Order Processing Workflow ===\n");

  // Step 1: Validate user exists
  console.log("Step 1: Validating user...");
  const userResult = await httpGet<User>(
    `${baseUrl}/users/${request.userId}`,
    UserSchema,
    { timeoutMs: 5000 }
  );

  if (!userResult.ok) {
    console.error("✗ User validation failed:", userResult.error.type);
    return userResult;
  }
  console.log("✓ User validated:", userResult.value.email);

  // Step 2: Create order with timeout
  console.log("\nStep 2: Creating order...");
  const orderResult = await withTimeout(
    httpPost<CreateOrderRequest, Order>(
      `${baseUrl}/orders`,
      request,
      CreateOrderRequestSchema,
      OrderSchema
    ),
    5000,
    "order-service"
  );

  if (!orderResult.ok) {
    console.error("✗ Order creation failed:", orderResult.error.type);
    return orderResult;
  }
  const order = orderResult.value;
  console.log("✓ Order created with ID:", order.id);

  // Step 3: Process payment with circuit breaker
  console.log("\nStep 3: Processing payment...");
  const paymentBreaker = createCircuitBreaker({
    failureThreshold: 3,
    successThreshold: 2,
    timeoutMs: 30000,
  });

  const paymentRequest: PaymentRequest = {
    orderId: order.id,
    amount: order.total,
    method: "card",
  };

  const paymentResult = await paymentBreaker.execute(() =>
    httpPost<PaymentRequest, PaymentResponse>(
      `${baseUrl}/payments`,
      paymentRequest,
      PaymentRequestSchema,
      PaymentResponseSchema
    )
  );

  if (!paymentResult.ok) {
    console.error("✗ Payment failed:", paymentResult.error);

    // Compensating action: cancel the order
    console.log("\nCompensating action: Cancelling order...");
    await httpDelete(`${baseUrl}/orders/${order.id}`);
    console.log("✓ Order cancelled");

    return paymentResult;
  }

  const payment = paymentResult.value;
  if (!payment.success) {
    console.error("✗ Payment rejected by payment provider");

    // Cancel order
    await httpDelete(`${baseUrl}/orders/${order.id}`);

    return Result.err({
      type: "payment_failed",
      reason: "Payment provider rejected transaction",
    });
  }

  console.log("✓ Payment processed, transaction ID:", payment.transactionId);
  console.log("\n✓ Order workflow completed successfully!");

  return Result.ok(order);
}
