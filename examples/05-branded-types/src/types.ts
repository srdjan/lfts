// examples/05-branded-types/src/types.ts
// Demonstrates nominal branding using structural type intersections.

export type UserId = string & { readonly __brand: "UserId" };
export type Email = string & { readonly __brand: "Email" };

export type User = {
  readonly id: UserId;
  readonly email: Email;
  readonly displayName: string;
};
