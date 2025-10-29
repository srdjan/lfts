// packages/lfts-type-runtime/introspection-example.ts
// Example usage of Phase 1.2 Runtime Introspection Hooks

import { enc } from "../lfts-type-spec/src/mod.ts";
import { inspect, withMetadata } from "./mod.ts";

// Example: Debugging validation failures

type User = {
  id: string;
  email: string;
  age: number;
};

// Create schema with metadata
const UserSchema = withMetadata(
  enc.obj([
    { name: "id", type: enc.str() },
    { name: "email", type: enc.refine.email(enc.str()) },
    { name: "age", type: enc.refine.min(enc.num(), 0) },
  ]),
  {
    name: "User",
    source: "src/types/user.schema.ts",
  },
);

// Create inspectable wrapper with hooks
const InspectedUserSchema = inspect<User>(UserSchema, (ctx) => {
  console.log(`\n📋 Schema: ${ctx.schemaName} (${ctx.schemaSource})\n`);

  ctx.onSuccess((value) => {
    console.log("✅ Validation succeeded!");
    console.log("   Value:", JSON.stringify(value, null, 2));
  });

  ctx.onFailure((error) => {
    console.log("❌ Validation failed!");
    console.log(`   Path: ${error.path || "(root)"}`);
    console.log(`   Error: ${error.message}`);
  });
});

// Test cases
console.log("=== Runtime Introspection Hooks Demo ===\n");

console.log("--- Test 1: Valid user data ---");
const result1 = InspectedUserSchema.validate({
  id: "user-123",
  email: "alice@example.com",
  age: 25,
});

console.log("\n--- Test 2: Invalid email ---");
const result2 = InspectedUserSchema.validate({
  id: "user-456",
  email: "not-an-email",
  age: 30,
});

console.log("\n--- Test 3: Negative age ---");
const result3 = InspectedUserSchema.validate({
  id: "user-789",
  email: "bob@example.com",
  age: -5,
});

console.log("\n--- Test 4: Missing required field ---");
const result4 = InspectedUserSchema.validate({
  id: "user-999",
  email: "charlie@example.com",
  // age is missing
});

// Example: Collecting validation metrics
console.log("\n\n=== Validation Metrics Example ===\n");

const metrics = {
  successes: 0,
  failures: 0,
  errors: [] as Array<{ path: string; message: string }>,
};

const MetricsUserSchema = inspect<User>(UserSchema, (ctx) => {
  ctx.onSuccess(() => {
    metrics.successes++;
  });

  ctx.onFailure((error) => {
    metrics.failures++;
    metrics.errors.push(error);
  });
});

// Validate multiple users
const users = [
  { id: "1", email: "valid@example.com", age: 25 },
  { id: "2", email: "invalid", age: 30 },
  { id: "3", email: "another@example.com", age: -10 },
  { id: "4", email: "good@example.com", age: 40 },
];

users.forEach((user) => MetricsUserSchema.validate(user));

console.log("Validation Metrics:");
console.log(`  Total validations: ${users.length}`);
console.log(`  Successes: ${metrics.successes}`);
console.log(`  Failures: ${metrics.failures}`);
console.log(`  Errors collected: ${metrics.errors.length}`);
metrics.errors.forEach((err, i) => {
  console.log(`    ${i + 1}. ${err.path}: ${err.message}`);
});
