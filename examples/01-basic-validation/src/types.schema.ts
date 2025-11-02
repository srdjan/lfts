// examples/01-basic-validation/src/types.schema.ts
// Schema roots for the basic validation example.
// The compiler transforms typeOf<T>() calls into concrete bytecode arrays.

import { typeOf } from "../../../packages/lfts-type-runtime/mod.ts";
import type { Product, User } from "./types.ts";

export const User$ = typeOf<User>();
export const Product$ = typeOf<Product>();
