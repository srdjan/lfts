// examples/01-basic-validation/src/types.schema.ts
// Schema roots for the basic validation example.
// The compiler automatically generates bytecode constants for each exported type alias.

import type { Product, User } from "./types.ts";

export type UserSchema = User;
export type ProductSchema = Product;
