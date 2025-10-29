// Test file for refinement validation features
import { validate, validateAll, validateSafe } from "./mod.ts";
import { enc, Op } from "../lfts-type-spec/src/mod.ts";

console.log("\n=== Refinement Validation Tests ===\n");

// Test 1: Number min refinement
console.log("Test 1: Number min refinement");
const ageSchema = enc.refine.min(enc.num(), 18);

try {
  validate(ageSchema, 25);
  console.log("  ✓ Valid: 25 >= 18");
} catch (e: unknown) {
  console.log(`  ✗ Unexpected error: ${(e as Error).message}`);
}

try {
  validate(ageSchema, 16);
  console.log("  ✗ Should have rejected 16 < 18");
} catch (e: unknown) {
  console.log(`  ✓ Rejected: ${(e as Error).message}`);
}

// Test 2: Number max refinement
console.log("\nTest 2: Number max refinement");
const percentSchema = enc.refine.max(enc.num(), 100);

try {
  validate(percentSchema, 75);
  console.log("  ✓ Valid: 75 <= 100");
} catch (e: unknown) {
  console.log(`  ✗ Unexpected error: ${(e as Error).message}`);
}

try {
  validate(percentSchema, 150);
  console.log("  ✗ Should have rejected 150 > 100");
} catch (e: unknown) {
  console.log(`  ✓ Rejected: ${(e as Error).message}`);
}

// Test 3: Number min and max combined
console.log("\nTest 3: Number min and max combined");
const scoreSchema = enc.refine.min(enc.refine.max(enc.num(), 100), 0);

try {
  validate(scoreSchema, 50);
  console.log("  ✓ Valid: 0 <= 50 <= 100");
} catch (e: unknown) {
  console.log(`  ✗ Unexpected error: ${(e as Error).message}`);
}

try {
  validate(scoreSchema, -10);
  console.log("  ✗ Should have rejected -10 < 0");
} catch (e: unknown) {
  console.log(`  ✓ Rejected min: ${(e as Error).message}`);
}

try {
  validate(scoreSchema, 110);
  console.log("  ✗ Should have rejected 110 > 100");
} catch (e: unknown) {
  console.log(`  ✓ Rejected max: ${(e as Error).message}`);
}

// Test 4: Integer refinement
console.log("\nTest 4: Integer refinement");
const countSchema = enc.refine.integer(enc.num());

try {
  validate(countSchema, 42);
  console.log("  ✓ Valid: 42 is integer");
} catch (e: unknown) {
  console.log(`  ✗ Unexpected error: ${(e as Error).message}`);
}

try {
  validate(countSchema, 3.14);
  console.log("  ✗ Should have rejected 3.14 (not integer)");
} catch (e: unknown) {
  console.log(`  ✓ Rejected: ${(e as Error).message}`);
}

try {
  validate(countSchema, 0);
  console.log("  ✓ Valid: 0 is integer");
} catch (e: unknown) {
  console.log(`  ✗ Unexpected error: ${(e as Error).message}`);
}

// Test 5: String minLength refinement
console.log("\nTest 5: String minLength refinement");
const usernameSchema = enc.refine.minLength(enc.str(), 3);

try {
  validate(usernameSchema, "alice");
  console.log("  ✓ Valid: 'alice' length >= 3");
} catch (e: unknown) {
  console.log(`  ✗ Unexpected error: ${(e as Error).message}`);
}

try {
  validate(usernameSchema, "ab");
  console.log("  ✗ Should have rejected 'ab' (length 2 < 3)");
} catch (e: unknown) {
  console.log(`  ✓ Rejected: ${(e as Error).message}`);
}

// Test 6: String maxLength refinement
console.log("\nTest 6: String maxLength refinement");
const shortCodeSchema = enc.refine.maxLength(enc.str(), 10);

try {
  validate(shortCodeSchema, "ABC123");
  console.log("  ✓ Valid: 'ABC123' length <= 10");
} catch (e: unknown) {
  console.log(`  ✗ Unexpected error: ${(e as Error).message}`);
}

try {
  validate(shortCodeSchema, "VERYLONGCODE123");
  console.log("  ✗ Should have rejected 'VERYLONGCODE123' (length > 10)");
} catch (e: unknown) {
  console.log(`  ✓ Rejected: ${(e as Error).message}`);
}

// Test 7: String minLength and maxLength combined
console.log("\nTest 7: String minLength and maxLength combined");
const passwordSchema = enc.refine.minLength(
  enc.refine.maxLength(enc.str(), 20),
  8,
);

try {
  validate(passwordSchema, "secure123");
  console.log("  ✓ Valid: 'secure123' 8 <= length <= 20");
} catch (e: unknown) {
  console.log(`  ✗ Unexpected error: ${(e as Error).message}`);
}

try {
  validate(passwordSchema, "short");
  console.log("  ✗ Should have rejected 'short' (length < 8)");
} catch (e: unknown) {
  console.log(`  ✓ Rejected min: ${(e as Error).message}`);
}

try {
  validate(passwordSchema, "verylongpasswordthatexceedsmaximum");
  console.log("  ✗ Should have rejected long string (length > 20)");
} catch (e: unknown) {
  console.log(`  ✓ Rejected max: ${(e as Error).message}`);
}

// Test 8: Array minItems refinement
console.log("\nTest 8: Array minItems refinement");
const tagsSchema = enc.refine.minItems(enc.arr(enc.str()), 2);

try {
  validate(tagsSchema, ["tag1", "tag2", "tag3"]);
  console.log("  ✓ Valid: array length >= 2");
} catch (e: unknown) {
  console.log(`  ✗ Unexpected error: ${(e as Error).message}`);
}

try {
  validate(tagsSchema, ["tag1"]);
  console.log("  ✗ Should have rejected single item array");
} catch (e: unknown) {
  console.log(`  ✓ Rejected: ${(e as Error).message}`);
}

// Test 9: Array maxItems refinement
console.log("\nTest 9: Array maxItems refinement");
const topScoresSchema = enc.refine.maxItems(enc.arr(enc.num()), 5);

try {
  validate(topScoresSchema, [100, 95, 90, 85, 80]);
  console.log("  ✓ Valid: array length <= 5");
} catch (e: unknown) {
  console.log(`  ✗ Unexpected error: ${(e as Error).message}`);
}

try {
  validate(topScoresSchema, [100, 95, 90, 85, 80, 75]);
  console.log("  ✗ Should have rejected 6 items array");
} catch (e: unknown) {
  console.log(`  ✓ Rejected: ${(e as Error).message}`);
}

// Test 10: Array minItems and maxItems combined
console.log("\nTest 10: Array minItems and maxItems combined");
const teamSchema = enc.refine.minItems(
  enc.refine.maxItems(enc.arr(enc.str()), 10),
  3,
);

try {
  validate(teamSchema, ["Alice", "Bob", "Charlie", "Dave"]);
  console.log("  ✓ Valid: 3 <= array length <= 10");
} catch (e: unknown) {
  console.log(`  ✗ Unexpected error: ${(e as Error).message}`);
}

try {
  validate(teamSchema, ["Alice", "Bob"]);
  console.log("  ✗ Should have rejected 2 items (< 3)");
} catch (e: unknown) {
  console.log(`  ✓ Rejected min: ${(e as Error).message}`);
}

try {
  validate(teamSchema, ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K"]);
  console.log("  ✗ Should have rejected 11 items (> 10)");
} catch (e: unknown) {
  console.log(`  ✓ Rejected max: ${(e as Error).message}`);
}

// Test 11: Complex nested refinements in objects
console.log("\nTest 11: Complex nested refinements in objects");
const userSchema = enc.obj([
  {
    name: "username",
    type: enc.refine.minLength(enc.refine.maxLength(enc.str(), 20), 3),
  },
  { name: "age", type: enc.refine.min(enc.refine.integer(enc.num()), 18) },
  { name: "score", type: enc.refine.min(enc.refine.max(enc.num(), 100), 0) },
]);

try {
  validate(userSchema, { username: "alice", age: 25, score: 85 });
  console.log("  ✓ Valid: all refinements satisfied");
} catch (e: unknown) {
  console.log(`  ✗ Unexpected error: ${(e as Error).message}`);
}

try {
  validate(userSchema, { username: "al", age: 25, score: 85 });
  console.log("  ✗ Should have rejected short username");
} catch (e: unknown) {
  console.log(`  ✓ Rejected username: ${(e as Error).message}`);
}

try {
  validate(userSchema, { username: "alice", age: 17, score: 85 });
  console.log("  ✗ Should have rejected age < 18");
} catch (e: unknown) {
  console.log(`  ✓ Rejected age: ${(e as Error).message}`);
}

try {
  validate(userSchema, { username: "alice", age: 25.5, score: 85 });
  console.log("  ✗ Should have rejected non-integer age");
} catch (e: unknown) {
  console.log(`  ✓ Rejected age (not integer): ${(e as Error).message}`);
}

// Test 12: Error aggregation with refinements
console.log("\nTest 12: Error aggregation with refinements");
const strictUserSchema = enc.obj([
  { name: "username", type: enc.refine.minLength(enc.str(), 3) },
  { name: "age", type: enc.refine.min(enc.num(), 18) },
  { name: "tags", type: enc.refine.minItems(enc.arr(enc.str()), 2) },
]);

const invalidUser = { username: "ab", age: 16, tags: ["single"] };

const result = validateAll(strictUserSchema, invalidUser);
if (!result.ok) {
  console.log(`  ✓ Found ${result.errors.length} errors (should be 3):`);
  result.errors.forEach((err) =>
    console.log(`    - ${err.path}: ${err.message}`)
  );
} else {
  console.log("  ✗ Should have found multiple validation errors");
}

// Test 13: validateSafe with refinements
console.log("\nTest 13: validateSafe with refinements");
const priceSchema = enc.refine.min(enc.num(), 0);

const result1 = validateSafe(priceSchema, 99.99);
if (result1.ok) {
  console.log(`  ✓ Valid price: ${result1.value}`);
} else {
  console.log(`  ✗ Unexpected error: ${result1.error.message}`);
}

const result2 = validateSafe(priceSchema, -10);
if (!result2.ok) {
  console.log(`  ✓ Invalid price rejected: ${result2.error.message}`);
} else {
  console.log("  ✗ Should have rejected negative price");
}

// Test 14: Refinements with READONLY and BRAND wrappers
console.log("\nTest 14: Refinements with READONLY and BRAND wrappers");
const positiveIntSchema = enc.brand(
  enc.refine.min(enc.refine.integer(enc.num()), 1),
  "PositiveInt",
);
const readonlyAgeSchema = enc.ro(enc.refine.min(enc.num(), 0));

try {
  validate(positiveIntSchema, 42);
  console.log("  ✓ Valid: 42 is positive integer with brand");
} catch (e: unknown) {
  console.log(`  ✗ Unexpected error: ${(e as Error).message}`);
}

try {
  validate(positiveIntSchema, 0);
  console.log("  ✗ Should have rejected 0 (not positive)");
} catch (e: unknown) {
  console.log(`  ✓ Rejected zero: ${(e as Error).message}`);
}

try {
  validate(readonlyAgeSchema, 25);
  console.log("  ✓ Valid: 25 with readonly wrapper");
} catch (e: unknown) {
  console.log(`  ✗ Unexpected error: ${(e as Error).message}`);
}

// Test 15: Edge cases
console.log("\nTest 15: Edge cases");

// Empty string with minLength
const nonEmptySchema = enc.refine.minLength(enc.str(), 1);
try {
  validate(nonEmptySchema, "");
  console.log("  ✗ Should have rejected empty string");
} catch (e: unknown) {
  console.log(`  ✓ Rejected empty string: ${(e as Error).message}`);
}

// Empty array with minItems
const nonEmptyArraySchema = enc.refine.minItems(enc.arr(enc.num()), 1);
try {
  validate(nonEmptyArraySchema, []);
  console.log("  ✗ Should have rejected empty array");
} catch (e: unknown) {
  console.log(`  ✓ Rejected empty array: ${(e as Error).message}`);
}

// Zero with min refinement (boundary)
const positiveSchema = enc.refine.min(enc.num(), 0);
try {
  validate(positiveSchema, 0);
  console.log("  ✓ Valid: 0 >= 0 (boundary case)");
} catch (e: unknown) {
  console.log(`  ✗ Unexpected error: ${(e as Error).message}`);
}

// Negative zero (special case)
try {
  validate(positiveSchema, -0);
  console.log("  ✓ Valid: -0 >= 0 (JavaScript quirk)");
} catch (e: unknown) {
  console.log(`  ✗ Unexpected error: ${(e as Error).message}`);
}

console.log("\n=== All refinement tests completed ===\n");
