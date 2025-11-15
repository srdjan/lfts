#!/usr/bin/env -S deno run -A
// scripts/perf-ci.ts
// Performance regression tests for CI
// Fails if performance degrades >10% from baseline

import { enc, Op } from "../packages/lfts-type-spec/src/mod.ts";
import { validate, validateSafe } from "../packages/lfts-type-runtime/mod.ts";

// Configuration
const ITERATIONS = 10_000;
const WARMUP = 1_000;
const MAX_REGRESSION = 0.10; // 10% allowed regression

// Baseline performance targets (in ops/sec)
// These are conservative estimates suitable for CI environments
const BASELINES = {
  primitiveValidation: 1_500_000,    // 1.5M ops/sec (production often sees 2-4M)
  objectValidation: 500_000,          // 500K ops/sec (production often sees 700-900K)
  dunionValidation: 400_000,          // 400K ops/sec (production often sees 500-800K)
};

type BenchResult = {
  name: string;
  opsPerSec: number;
  avgMs: number;
};

function benchmark(name: string, fn: () => void, iterations = ITERATIONS): BenchResult {
  // Warmup
  for (let i = 0; i < WARMUP; i++) fn();

  // Actual benchmark
  const start = performance.now();
  for (let i = 0; i < iterations; i++) fn();
  const end = performance.now();

  const totalMs = end - start;
  const avgMs = totalMs / iterations;
  const opsPerSec = Math.round(1000 / avgMs);

  return { name, opsPerSec, avgMs };
}

function checkRegression(result: BenchResult, baseline: number): boolean {
  const regression = (baseline - result.opsPerSec) / baseline;
  const passed = regression <= MAX_REGRESSION;

  console.log(`\n${result.name}:`);
  console.log(`  Baseline: ${baseline.toLocaleString()} ops/sec`);
  console.log(`  Actual:   ${result.opsPerSec.toLocaleString()} ops/sec`);

  if (regression > 0) {
    const pct = (regression * 100).toFixed(1);
    if (passed) {
      console.log(`  ✅ Performance within tolerance (${pct}% slower, max ${MAX_REGRESSION * 100}%)`);
    } else {
      console.log(`  ❌ REGRESSION: ${pct}% slower than baseline (max ${MAX_REGRESSION * 100}%)`);
    }
  } else {
    const improvement = (Math.abs(regression) * 100).toFixed(1);
    console.log(`  ✅ Improved by ${improvement}%!`);
  }

  return passed;
}

console.log("=".repeat(70));
console.log("LFTS Performance Regression Tests");
console.log("=".repeat(70));

let allPassed = true;

// Test 1: Primitive Validation (string)
const stringSchema = [Op.STRING];
const testString = "hello";
const result1 = benchmark("Primitive Validation (string)", () => {
  validate(stringSchema, testString);
});
allPassed = checkRegression(result1, BASELINES.primitiveValidation) && allPassed;

// Test 2: Object Validation
const userSchema = [
  Op.OBJECT,
  3,
  0, // strict = false
  Op.PROPERTY, "id", 0, [Op.STRING],
  Op.PROPERTY, "email", 0, [Op.STRING],
  Op.PROPERTY, "age", 0, [Op.NUMBER],
];
const testUser = { id: "usr_123", email: "test@example.com", age: 25 };
const result2 = benchmark("Object Validation (3 properties)", () => {
  validate(userSchema, testUser);
});
allPassed = checkRegression(result2, BASELINES.objectValidation) && allPassed;

// Test 3: Discriminated Union (DUNION) Validation
const dunionSchema = enc.dunion("type", [
  { tag: "add", schema: enc.obj([
    { name: "type", type: enc.lit("add") },
    { name: "x", type: [Op.NUMBER] },
    { name: "y", type: [Op.NUMBER] }
  ]) },
  { tag: "mul", schema: enc.obj([
    { name: "type", type: enc.lit("mul") },
    { name: "x", type: [Op.NUMBER] },
    { name: "y", type: [Op.NUMBER] }
  ]) },
]);
const testExpr = { type: "add", x: 1, y: 2 };
const result3 = benchmark("DUNION Validation (2 variants)", () => {
  validate(dunionSchema, testExpr);
});
allPassed = checkRegression(result3, BASELINES.dunionValidation) && allPassed;

// Summary
console.log("\n" + "=".repeat(70));
if (allPassed) {
  console.log("✅ All performance tests PASSED");
  console.log("=".repeat(70));
  Deno.exit(0);
} else {
  console.log("❌ Performance regression detected!");
  console.log("=".repeat(70));
  Deno.exit(1);
}
