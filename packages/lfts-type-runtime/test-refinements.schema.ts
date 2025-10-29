// Test refinement annotations at runtime
import { validate, type Email, type Url, type Min, type Max, type MinLength, type MaxLength, type Pattern, typeOf } from "./mod.ts";

console.log("=== Testing Refinement Annotations ===\n");

// Email validation
const EmailSchema = typeOf<string & Email>();
console.log("Email validation:");
console.log("  ✓ valid:", validate(EmailSchema, "user@example.com").ok);
console.log("  ✗ invalid:", validate(EmailSchema, "not-an-email").ok);
console.log("  ✗ not string:", validate(EmailSchema, 123).ok);

// URL validation
const UrlSchema = typeOf<string & Url>();
console.log("\nURL validation:");
console.log("  ✓ valid:", validate(UrlSchema, "https://example.com").ok);
console.log("  ✗ invalid:", validate(UrlSchema, "not a url").ok);

// Pattern validation (digits only)
const DigitsSchema = typeOf<string & Pattern<"^\\d+$">>();
console.log("\nPattern validation (digits only):");
console.log("  ✓ valid:", validate(DigitsSchema, "12345").ok);
console.log("  ✗ invalid:", validate(DigitsSchema, "abc123").ok);

// MinLength/MaxLength
const UsernameSchema = typeOf<string & MinLength<3> & MaxLength<10>>();
console.log("\nString length validation (3-10 chars):");
console.log("  ✓ valid:", validate(UsernameSchema, "alice").ok);
console.log("  ✗ too short:", validate(UsernameSchema, "ab").ok);
console.log("  ✗ too long:", validate(UsernameSchema, "verylongusername").ok);

// Min/Max numeric
const AgeSchema = typeOf<number & Min<0> & Max<120>>();
console.log("\nNumeric range validation (0-120):");
console.log("  ✓ valid:", validate(AgeSchema, 25).ok);
console.log("  ✗ too small:", validate(AgeSchema, -5).ok);
console.log("  ✗ too large:", validate(AgeSchema, 150).ok);

// Combined in object
const UserSchema = typeOf<{
  readonly email: string & Email;
  readonly age: number & Min<0> & Max<120>;
  readonly username: string & MinLength<3> & MaxLength<20>;
}>();

console.log("\nCombined object validation:");
const validUser = {
  email: "alice@example.com",
  age: 30,
  username: "alice123"
};
console.log("  ✓ valid user:", validate(UserSchema, validUser).ok);

const invalidUser = {
  email: "not-an-email",
  age: -5,
  username: "ab"
};
const result = validate(UserSchema, invalidUser);
console.log("  ✗ invalid user:", result.ok);
if (!result.ok) {
  console.log("    Error:", result.error.message);
}

console.log("\n=== All tests completed ===");
