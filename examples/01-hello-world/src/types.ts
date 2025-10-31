// examples/01-hello-world/src/types.ts

// A simple brand type for UserId
export type UserId = string & { readonly __brand: "UserId" };

// The User type
export type User = Readonly<{
  id: UserId;
  name: string;
  email: string;
  age?: number; // Optional field
}>;
