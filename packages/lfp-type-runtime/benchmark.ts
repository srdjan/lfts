// packages/lfp-type-runtime/benchmark.ts
// Benchmark suite for LFP runtime validator performance

import { Op, enc } from "../lfp-type-spec/src/mod.ts";
import { validate } from "./mod.ts";

// Benchmark configuration
const ITERATIONS = 10_000;
const WARMUP = 1_000;

// Benchmark result type
type BenchResult = {
  name: string;
  iterations: number;
  totalMs: number;
  avgMs: number;
  opsPerSec: number;
};

function benchmark(name: string, fn: () => void, iterations = ITERATIONS): BenchResult {
  // Warmup
  for (let i = 0; i < WARMUP; i++) {
    fn();
  }

  // Actual benchmark
  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    fn();
  }
  const end = performance.now();

  const totalMs = end - start;
  const avgMs = totalMs / iterations;
  const opsPerSec = Math.round(1000 / avgMs);

  return { name, iterations, totalMs, avgMs, opsPerSec };
}

function printResult(result: BenchResult) {
  console.log(`\n${result.name}`);
  console.log(`  Iterations: ${result.iterations.toLocaleString()}`);
  console.log(`  Total time: ${result.totalMs.toFixed(2)} ms`);
  console.log(`  Average: ${(result.avgMs * 1000).toFixed(3)} μs/op`);
  console.log(`  Throughput: ${result.opsPerSec.toLocaleString()} ops/sec`);
}

function printComparison(baseline: BenchResult, optimized: BenchResult) {
  const speedup = baseline.avgMs / optimized.avgMs;
  const improvement = ((speedup - 1) * 100).toFixed(1);

  console.log(`\n📊 Comparison:`);
  console.log(`  ${optimized.name} is ${speedup.toFixed(2)}x faster (${improvement}% improvement)`);
  console.log(`  ${baseline.opsPerSec.toLocaleString()} → ${optimized.opsPerSec.toLocaleString()} ops/sec`);
}

// ===========================================================================
// Benchmark 1: DUNION vs UNION validation (various variant counts)
// ===========================================================================

console.log("\n" + "=".repeat(70));
console.log("Benchmark 1: DUNION vs UNION validation");
console.log("=".repeat(70));

// Test with 2, 5, 10, 20 variants
for (const variantCount of [2, 5, 10, 20]) {
  console.log(`\n--- ${variantCount} variants ---`);

  // Generate DUNION schema
  const dunionVariants = Array.from({ length: variantCount }, (_, i) => ({
    tag: `variant${i}`,
    schema: enc.obj([
      { name: "type", type: enc.lit(`variant${i}`) },
      { name: "value", type: enc.num() }
    ])
  }));
  const dunionSchema = enc.dunion("type", dunionVariants);

  // Generate equivalent UNION schema (same structure, different encoding)
  const unionAlts = Array.from({ length: variantCount }, (_, i) =>
    enc.obj([
      { name: "type", type: enc.lit(`variant${i}`) },
      { name: "value", type: enc.num() }
    ])
  );
  const unionSchema = enc.union(...unionAlts);

  // Test data: always match the last variant (worst case for UNION linear search)
  const testValue = {
    type: `variant${variantCount - 1}`,
    value: 42
  };

  const unionResult = benchmark(
    `UNION (${variantCount} variants)`,
    () => validate(unionSchema, testValue)
  );
  printResult(unionResult);

  const dunionResult = benchmark(
    `DUNION (${variantCount} variants)`,
    () => validate(dunionSchema, testValue)
  );
  printResult(dunionResult);

  printComparison(unionResult, dunionResult);
}

// ===========================================================================
// Benchmark 2: Array of ADTs validation
// ===========================================================================

console.log("\n" + "=".repeat(70));
console.log("Benchmark 2: Array of ADTs validation");
console.log("=".repeat(70));

// Array of ADT elements
const adtArraySchema = enc.arr(
  enc.dunion("type", [
    { tag: "success", schema: enc.obj([
      { name: "type", type: enc.lit("success") },
      { name: "value", type: enc.num() }
    ])},
    { tag: "error", schema: enc.obj([
      { name: "type", type: enc.lit("error") },
      { name: "message", type: enc.str() }
    ])},
    { tag: "pending", schema: enc.obj([
      { name: "type", type: enc.lit("pending") }
    ])}
  ])
);

const adtArrayValue = [
  { type: "success", value: 42 },
  { type: "error", message: "Something went wrong" },
  { type: "pending" },
  { type: "success", value: 100 },
  { type: "error", message: "Another error" }
];

const arrayAdtResult = benchmark(
  "Array of 5 ADT elements",
  () => validate(adtArraySchema, adtArrayValue),
  5000 // Fewer iterations for array validation
);
printResult(arrayAdtResult);

// ===========================================================================
// Benchmark 3: Deep object trees
// ===========================================================================

console.log("\n" + "=".repeat(70));
console.log("Benchmark 3: Deep object tree validation");
console.log("=".repeat(70));

// Create a deeply nested object schema (10 levels)
let deepSchema: any = enc.num();
for (let i = 0; i < 10; i++) {
  deepSchema = enc.obj([{ name: `level${i}`, type: deepSchema }]);
}

// Create matching data
let deepValue: any = 42;
for (let i = 0; i < 10; i++) {
  deepValue = { [`level${i}`]: deepValue };
}

const deepResult = benchmark(
  "Deep object (10 levels)",
  () => validate(deepSchema, deepValue),
  5000
);
printResult(deepResult);

// ===========================================================================
// Benchmark 4: Large batch validation
// ===========================================================================

console.log("\n" + "=".repeat(70));
console.log("Benchmark 4: Large batch validation");
console.log("=".repeat(70));

const userSchema = enc.obj([
  { name: "id", type: enc.num() },
  { name: "name", type: enc.str() },
  { name: "email", type: enc.str() },
  { name: "age", type: enc.num() },
  { name: "active", type: enc.bool() }
]);

const users = Array.from({ length: 100 }, (_, i) => ({
  id: i,
  name: `User${i}`,
  email: `user${i}@example.com`,
  age: 20 + (i % 50),
  active: i % 2 === 0
}));

const batchResult = benchmark(
  "Batch: 100 users",
  () => {
    for (const user of users) {
      validate(userSchema, user);
    }
  },
  100 // Fewer iterations since we're validating 100 objects per iteration
);
printResult(batchResult);
console.log(`  Total validations: ${batchResult.iterations * 100}`);

// ===========================================================================
// Benchmark 5: Hot path - repeated validation of same schema
// ===========================================================================

console.log("\n" + "=".repeat(70));
console.log("Benchmark 5: Hot path (repeated validation)");
console.log("=".repeat(70));

const hotpathDunion = enc.dunion("status", [
  { tag: "pending", schema: enc.obj([
    { name: "status", type: enc.lit("pending") },
    { name: "created", type: enc.num() }
  ])},
  { tag: "processing", schema: enc.obj([
    { name: "status", type: enc.lit("processing") },
    { name: "progress", type: enc.num() }
  ])},
  { tag: "complete", schema: enc.obj([
    { name: "status", type: enc.lit("complete") },
    { name: "result", type: enc.str() }
  ])}
]);

const hotpathValues = [
  { status: "pending", created: Date.now() },
  { status: "processing", progress: 0.5 },
  { status: "complete", result: "success" }
];

const hotpathResult = benchmark(
  "Hot path: 3 variants × many iterations",
  () => {
    for (const val of hotpathValues) {
      validate(hotpathDunion, val);
    }
  }
);
printResult(hotpathResult);
console.log(`  DUNION cache should provide O(1) lookup after first validation`);

// ===========================================================================
// Summary
// ===========================================================================

console.log("\n" + "=".repeat(70));
console.log("📈 Performance Summary");
console.log("=".repeat(70));
console.log("\nKey optimizations implemented:");
console.log("  ✅ DUNION tag map caching (WeakMap-based O(1) lookup)");
console.log("  ✅ Lazy path construction (build paths only on error)");
console.log("\nExpected gains:");
console.log("  • DUNION with 5+ variants: 10-100x faster than UNION");
console.log("  • Path construction overhead: 5-15% reduction");
console.log("  • Hot path scenarios: Significant improvement from caching");
console.log("\nNote: Actual performance depends on workload characteristics.");
console.log("      ADT-heavy workloads benefit most from DUNION optimization.");
console.log("=".repeat(70) + "\n");
