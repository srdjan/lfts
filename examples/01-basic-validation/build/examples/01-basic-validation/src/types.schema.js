// examples/01-basic-validation/src/types.schema.ts
// Schema roots for the basic validation example.
// The compiler transforms typeOf<T>() calls into concrete bytecode arrays.
import { typeOf } from "../../../packages/lfts-type-runtime/mod.js";
export const User$ = [8, 3, 0, 9, "id", 0, 0, 9, "name", 0, 0, 9, "age", 0, 1];
export const Product$ = [8, 3, 0, 9, "sku", 0, 0, 9, "title", 0, 0, 9, "price", 0, 1];
