// examples/02-optional-readonly/src/types.ts
// Demonstrates optional properties and readonly collection types.

export type Address = {
  readonly street: string;
  readonly city: string;
  readonly country?: string;
};

export type UserProfile = {
  readonly username: string;
  readonly bio?: string;
  readonly tags: readonly string[];
  readonly address?: Address;
};
