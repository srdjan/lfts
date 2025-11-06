// examples/10-distributed-execution/schemas.ts
// Runtime schemas for validation

import { enc } from "../../packages/lfts-type-spec/src/mod.ts";

export const UserSchema = enc.obj([
  { name: "id", type: enc.num() },
  { name: "name", type: enc.str() },
  { name: "email", type: enc.str() },
]);

export const ProductSchema = enc.obj([
  { name: "id", type: enc.num() },
  { name: "name", type: enc.str() },
  { name: "price", type: enc.num() },
  { name: "stock", type: enc.num() },
]);

export const OrderItemSchema = enc.obj([
  { name: "productId", type: enc.num() },
  { name: "quantity", type: enc.num() },
  { name: "price", type: enc.num() },
]);

export const OrderSchema = enc.obj([
  { name: "id", type: enc.num() },
  { name: "userId", type: enc.num() },
  { name: "items", type: enc.arr(OrderItemSchema) },
  { name: "total", type: enc.num() },
  {
    name: "status",
    type: enc.union([
      enc.lit("pending"),
      enc.lit("confirmed"),
      enc.lit("shipped"),
      enc.lit("delivered"),
    ]),
  },
]);

export const CreateOrderRequestSchema = enc.obj([
  { name: "userId", type: enc.num() },
  { name: "items", type: enc.arr(OrderItemSchema) },
]);

export const PaymentRequestSchema = enc.obj([
  { name: "orderId", type: enc.num() },
  { name: "amount", type: enc.num() },
  { name: "method", type: enc.union([enc.lit("card"), enc.lit("paypal")]) },
]);

export const PaymentResponseSchema = enc.obj([
  { name: "success", type: enc.bool() },
  { name: "transactionId", type: enc.str(), optional: true },
]);
