// Test: All prebuilt refinement annotations
import {
  typeOf,
  type Email,
  type Url,
  type Pattern,
  type MinLength,
  type MaxLength,
  type Min,
  type Max,
  type Range
} from "../../../../../../lfts-type-runtime/mod.ts";

// Email validation
export const EmailSchema = typeOf<string & Email>();

// URL validation
export const UrlSchema = typeOf<string & Url>();

// Pattern validation (phone number)
export const PhoneSchema = typeOf<string & Pattern<"^\\+?[1-9]\\d{1,14}$">>();

// String length constraints
export const UsernameSchema = typeOf<string & MinLength<3> & MaxLength<20>>();

// Numeric constraints
export const AgeSchema = typeOf<number & Min<0> & Max<120>>();

// Range constraint
export const PercentageSchema = typeOf<number & Range<0, 100>>();

// Combined in an object
export const UserSchema = typeOf<{
  readonly email: string & Email;
  readonly website: string & Url;
  readonly username: string & MinLength<3> & MaxLength<20>;
  readonly age: number & Min<0> & Max<120>;
  readonly score: number & Range<0, 100>;
}>();
