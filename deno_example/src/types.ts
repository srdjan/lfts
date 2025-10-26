/** @port */
export interface ClockPort {
  now(): number;
}

export type UserId = string & { readonly __brand: "UserId" };
export type User = Readonly<{
  id: UserId;
  name: string;
  // email?: string;
}>;

// Transform replaces this with bytecode literal in dist/types.js
