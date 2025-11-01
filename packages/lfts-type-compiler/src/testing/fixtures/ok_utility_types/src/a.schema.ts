// Test utility types support (v0.8.0)

type User = {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly age: number;
};

// Partial<T>: All properties optional
export type PartialUserSchema = Partial<User>;

// Required<T>: All properties required (on a type with optionals)
type PartialData = {
  id?: string;
  name?: string;
};
export type RequiredDataSchema = Required<PartialData>;

// Pick<T, K>: Select subset of properties
export type UserIdNameSchema = Pick<User, "id" | "name">;

// Omit<T, K>: Exclude properties
export type UserWithoutAgeSchema = Omit<User, "age">;

// Record<K, V>: Uniform property types
export type StatusMapSchema = Record<"pending" | "active" | "completed", boolean>;

// Readonly<T>: Make all properties readonly (should work with object literals)
export type ReadonlyUserSchema = Readonly<User>;

// Compose utility types
export type PartialPickSchema = Partial<Pick<User, "name" | "email">>;
