// packages/lfp-type-runtime/test-strict.ts
// Test excess-property policy (strict mode)

import { enc } from "../lfp-type-spec/src/mod.ts";
import { validate, validateSafe } from "./mod.ts";

console.log("\n=== Excess Property Policy Tests ===\n");

// Test 1: Loose mode (default - allows extra properties)
console.log("Test 1: Loose mode (default)");
const looseSchema = enc.obj([
  { name: "name", type: enc.str() },
  { name: "age", type: enc.num() }
]);

const validLoose = { name: "Alice", age: 30 };
const excessLoose = { name: "Bob", age: 25, extra: "ignored" };

try {
  validate(looseSchema, validLoose);
  console.log("  ✓ Valid object accepted");
} catch (e) {
  console.log("  ✗ FAILED:", e.message);
}

try {
  validate(looseSchema, excessLoose);
  console.log("  ✓ Excess properties allowed (default behavior)");
} catch (e) {
  console.log("  ✗ FAILED:", e.message);
}

// Test 2: Strict mode (rejects extra properties)
console.log("\nTest 2: Strict mode");
const strictSchema = enc.obj([
  { name: "name", type: enc.str() },
  { name: "age", type: enc.num() }
], true); // strict = true

try {
  validate(strictSchema, validLoose);
  console.log("  ✓ Valid object accepted");
} catch (e) {
  console.log("  ✗ FAILED:", e.message);
}

try {
  validate(strictSchema, excessLoose);
  console.log("  ✗ FAILED: Should have rejected excess property");
} catch (e) {
  console.log("  ✓ Excess property rejected:", e.message);
}

// Test 3: Strict mode with multiple excess properties
console.log("\nTest 3: Multiple excess properties");
const multiExcess = { name: "Charlie", age: 35, extra1: "bad", extra2: "bad" };

const result = validateSafe(strictSchema, multiExcess);
if (!result.ok) {
  console.log("  ✓ Rejected:", result.error.message);
  console.log("    Path:", result.error.path);
} else {
  console.log("  ✗ FAILED: Should have rejected");
}

// Test 4: Strict mode with nested objects
console.log("\nTest 4: Nested objects with strict mode");
const nestedStrictSchema = enc.obj([
  { name: "user", type: enc.obj([
    { name: "name", type: enc.str() },
    { name: "email", type: enc.str() }
  ], true) } // Inner object is strict
]);

const validNested = { user: { name: "Dave", email: "dave@example.com" } };
const excessNested = { user: { name: "Eve", email: "eve@example.com", phone: "123" } };

try {
  validate(nestedStrictSchema, validNested);
  console.log("  ✓ Valid nested object accepted");
} catch (e) {
  console.log("  ✗ FAILED:", e.message);
}

const nestedResult = validateSafe(nestedStrictSchema, excessNested);
if (!nestedResult.ok) {
  console.log("  ✓ Nested excess property rejected:", nestedResult.error.message);
  console.log("    Path:", nestedResult.error.path);
} else {
  console.log("  ✗ FAILED: Should have rejected");
}

console.log("\n=== All Tests Complete ===\n");
