// Test: Nominal annotation for compile-time branding
import { typeOf, type Nominal } from "../../../../../../lfts-type-runtime/mod.ts";

// Direct inline test - this WILL be encoded by the compiler
export const UserSchema = typeOf<{
  readonly id: string & Nominal;
  readonly email: string & Nominal;
  readonly age: number;
}>();

export const ProductSchema = typeOf<{
  readonly id: number & Nominal;
  readonly name: string;
  readonly price: number;
}>();
