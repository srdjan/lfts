// examples/01-basic-validation/src/types.ts
// Domain types for the "Basic Validation" tutorial example.
// These are plain TypeScript type aliases – the single source of truth.

export type User = {
  readonly id: string;
  readonly name: string;
  readonly age: number;
};

export type Product = {
  readonly sku: string;
  readonly title: string;
  readonly price: number;
};
