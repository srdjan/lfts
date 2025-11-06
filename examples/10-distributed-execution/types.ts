// examples/10-distributed-execution/types.ts
// Domain types for distributed execution example

export type User = {
  readonly id: number;
  readonly name: string;
  readonly email: string;
};

export type Product = {
  readonly id: number;
  readonly name: string;
  readonly price: number;
  readonly stock: number;
};

export type OrderItem = {
  readonly productId: number;
  readonly quantity: number;
  readonly price: number;
};

export type Order = {
  readonly id: number;
  readonly userId: number;
  readonly items: readonly OrderItem[];
  readonly total: number;
  readonly status: "pending" | "confirmed" | "shipped" | "delivered";
};

export type CreateOrderRequest = {
  readonly userId: number;
  readonly items: readonly OrderItem[];
};

export type PaymentRequest = {
  readonly orderId: number;
  readonly amount: number;
  readonly method: "card" | "paypal";
};

export type PaymentResponse = {
  readonly success: boolean;
  readonly transactionId?: string;
};
