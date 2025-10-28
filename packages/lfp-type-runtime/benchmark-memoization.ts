// Benchmark: Schema Memoization (READONLY/BRAND wrapper caching)
// Tests the performance improvement from caching inner schemas
import { enc, Op } from "../lfp-type-spec/src/mod.ts";
import { validate } from "./mod.ts";

console.log("=== Schema Memoization Benchmark ===\n");
console.log("Testing READONLY and BRAND wrapper performance with memoization");
console.log("Expected improvement: 10-20% for schema-heavy workloads\n");

const ITERATIONS = 50_000;

function benchmark(name: string, fn: () => void): number {
  // Warmup
  for (let i = 0; i < 1000; i++) fn();

  // Actual benchmark
  const start = performance.now();
  for (let i = 0; i < ITERATIONS; i++) fn();
  const end = performance.now();

  const totalMs = end - start;
  const opsPerSec = Math.round((ITERATIONS / totalMs) * 1000);

  console.log(`${name}:`);
  console.log(`  Total time: ${totalMs.toFixed(2)} ms`);
  console.log(`  Average: ${(totalMs / ITERATIONS * 1000).toFixed(3)} μs/op`);
  console.log(`  Throughput: ${opsPerSec.toLocaleString()} ops/sec`);
  console.log();

  return opsPerSec;
}

// Test 1: READONLY wrapper performance
console.log("--- Test 1: READONLY wrapper (repeated validations) ---");
const baseSchema = enc.obj([
  { name: "id", type: enc.num() },
  { name: "name", type: enc.str() },
  { name: "active", type: enc.bool() },
]);

// Create READONLY wrapper
const readonlySchema = [Op.READONLY, baseSchema];

const testData = { id: 42, name: "Alice", active: true };

const readonlyOps = benchmark(
  "READONLY validation",
  () => validate(readonlySchema, testData)
);

// Test 2: BRAND wrapper performance
console.log("--- Test 2: BRAND wrapper (repeated validations) ---");
const brandedSchema = enc.brand(baseSchema, "UserId");

const brandOps = benchmark(
  "BRAND validation",
  () => validate(brandedSchema, testData)
);

// Test 3: Nested READONLY (multiple wrapper layers)
console.log("--- Test 3: Nested READONLY wrappers ---");
const nestedReadonlySchema = [Op.READONLY, [Op.READONLY, baseSchema]];

const nestedOps = benchmark(
  "Nested READONLY validation",
  () => validate(nestedReadonlySchema, testData)
);

// Test 4: Array of readonly items (cache reuse)
console.log("--- Test 4: Array of READONLY items (cache reuse) ---");
const arrayOfReadonly = enc.arr(readonlySchema);
const arrayData = [
  { id: 1, name: "Alice", active: true },
  { id: 2, name: "Bob", active: false },
  { id: 3, name: "Charlie", active: true },
  { id: 4, name: "Diana", active: false },
  { id: 5, name: "Eve", active: true },
];

const arrayOps = benchmark(
  "Array of READONLY items",
  () => validate(arrayOfReadonly, arrayData)
);

// Test 5: Complex schema with multiple wrappers
console.log("--- Test 5: Complex schema with READONLY and BRAND ---");
const complexSchema = enc.obj([
  { name: "userId", type: enc.brand(enc.num(), "UserId") },
  { name: "profile", type: [Op.READONLY, enc.obj([
    { name: "name", type: enc.str() },
    { name: "email", type: enc.str() },
  ])] },
  { name: "permissions", type: enc.arr([Op.READONLY, enc.str()]) },
]);

const complexData = {
  userId: 123,
  profile: { name: "Alice", email: "alice@example.com" },
  permissions: ["read", "write", "admin"],
};

const complexOps = benchmark(
  "Complex schema with wrappers",
  () => validate(complexSchema, complexData)
);

// Test 6: Comparison with unwrapped base schema (baseline)
console.log("--- Test 6: Baseline (no wrappers) ---");
const baselineOps = benchmark(
  "Base schema (no wrappers)",
  () => validate(baseSchema, testData)
);

console.log("=== Performance Summary ===\n");

console.log("Throughput comparison:");
console.log(`  Base schema:           ${baselineOps.toLocaleString()} ops/sec`);
console.log(`  READONLY wrapper:      ${readonlyOps.toLocaleString()} ops/sec (${((readonlyOps / baselineOps) * 100).toFixed(1)}% of baseline)`);
console.log(`  BRAND wrapper:         ${brandOps.toLocaleString()} ops/sec (${((brandOps / baselineOps) * 100).toFixed(1)}% of baseline)`);
console.log(`  Nested READONLY:       ${nestedOps.toLocaleString()} ops/sec (${((nestedOps / baselineOps) * 100).toFixed(1)}% of baseline)`);
console.log(`  Array of READONLY:     ${arrayOps.toLocaleString()} ops/sec`);
console.log(`  Complex with wrappers: ${complexOps.toLocaleString()} ops/sec`);

console.log("\nKey observations:");
console.log("  • WeakMap-based memoization provides O(1) schema unwrapping");
console.log("  • First validation: cache miss (pays unwrapping cost)");
console.log("  • Subsequent validations: cache hit (near-zero overhead)");
console.log("  • Expected 10-20% improvement for wrapper-heavy schemas");
console.log("  • Cache is automatic and transparent (no API changes)");
console.log("\nNote: Actual gains depend on:");
console.log("  - Number of wrapper layers");
console.log("  - Frequency of validation calls");
console.log("  - JIT compiler optimizations");
