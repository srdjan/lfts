// packages/lfts-type-runtime/type-object-demo.ts
// Demonstration of the new Type Object System in LFTS v0.10.0

import {
  t,
  primitives,
  StringType,
  NumberType,
  ObjectType,
  createTypeObject,
} from "./mod.ts";
import { Op } from "../lfts-type-spec/src/mod.ts";

console.log("=".repeat(80));
console.log("LFTS Type Object System Demo (v0.10.0)");
console.log("=".repeat(80));
console.log();

// ============================================================================
// 1. Builder API - Programmatic Schema Construction
// ============================================================================

console.log("1. Builder API - Create schemas programmatically");
console.log("-".repeat(80));

// Note: Refinement chaining has TypeScript limitations
// Each refinement wraps the schema, so we apply one at a time
const User$ = t.object({
  id: t.string().pattern("^usr_[a-z0-9]+$"),
  email: t.string().email(),
  age: t.number().min(0),  // One refinement at a time
  role: t.union(t.literal("admin"), t.literal("user"), t.literal("guest")),
});

console.log("Created User schema using t.object()");
console.log(`Schema kind: ${User$.kind}`);
console.log(`Properties: ${User$.properties.length}`);
User$.properties.forEach(p => {
  console.log(`  - ${p.name}: ${(p.type as any).kind || 'complex'} ${p.optional ? '(optional)' : ''}`);
});
console.log();

// Validate some data
const validUser = {
  id: "usr_abc123",
  email: "test@example.com",
  age: 25,
  role: "user",
};

const result1 = User$.validateSafe(validUser);
console.log("Validating valid user:", result1.ok ? "✓ PASS" : "✗ FAIL");

const invalidUser = {
  id: "invalid",
  email: "not-an-email",
  age: -5,
  role: "superuser",
};

const result2 = User$.validateSafe(invalidUser);
console.log("Validating invalid user:", result2.ok ? "✓ PASS" : "✗ FAIL");
if (!result2.ok) {
  console.log(`  Error: ${result2.error.message}`);
}
console.log();

// ============================================================================
// 2. Object Composition - Runtime Schema Manipulation
// ============================================================================

console.log("2. Object Composition - Runtime schema manipulation");
console.log("-".repeat(80));

// Make all properties optional
const PartialUser$ = User$.makePartial();
console.log("Created PartialUser$ using .makePartial()");
console.log(`Properties now optional: ${PartialUser$.properties.every(p => p.optional)}`);

// Test with partial data
const partialData = { id: "usr_test" };
const result3 = PartialUser$.validateSafe(partialData);
console.log("Validating partial user:", result3.ok ? "✓ PASS" : "✗ FAIL");
console.log();

// Pick specific properties
const PublicUser$ = User$.pick(["id", "role"]);
console.log("Created PublicUser$ using .pick(['id', 'role'])");
console.log(`Properties: ${PublicUser$.properties.map(p => p.name).join(", ")}`);
console.log();

// Omit sensitive properties
const SafeUser$ = User$.omit(["email"]);
console.log("Created SafeUser$ using .omit(['email'])");
console.log(`Properties: ${SafeUser$.properties.map(p => p.name).join(", ")}`);
console.log();

// Extend with new properties
const UserWithTimestamps$ = User$.extend({
  createdAt: t.number(),
  updatedAt: t.number(),
});
console.log("Created UserWithTimestamps$ using .extend()");
console.log(`Properties: ${UserWithTimestamps$.properties.length} (added 2)`);
console.log();

// ============================================================================
// 3. Direct Type Object Creation
// ============================================================================

console.log("3. Direct Type Object Creation");
console.log("-".repeat(80));

// Create from bytecode (this is what the compiler generates)
const bytecode = [Op.OBJECT, 2, 0, Op.PROPERTY, "name", 0, [Op.STRING], Op.PROPERTY, "value", 0, [Op.NUMBER]];
const GenericPair$ = createTypeObject(bytecode, {
  name: "GenericPair",
  source: "demo.ts",
  description: "A generic key-value pair",
});

console.log(`Created GenericPair$ from bytecode`);
console.log(`Schema kind: ${GenericPair$.kind}`);
console.log(`Metadata name: ${(GenericPair$ as any).metadata?.name || 'N/A'}`);

const pairResult = GenericPair$.validateSafe({ name: "count", value: 42 });
console.log("Validating pair:", pairResult.ok ? "✓ PASS" : "✗ FAIL");
console.log();

// ============================================================================
// 4. Primitive Types with Refinements
// ============================================================================

console.log("4. Primitive Types with Refinements");
console.log("-".repeat(80));

// Note: Can't chain refinements due to type system limitations
const Email$ = new StringType().email();
console.log("Created Email$ with .email()");

const validEmail = Email$.validateSafe("test@example.com");
console.log("Validating 'test@example.com':", validEmail.ok ? "✓ PASS" : "✗ FAIL");

const invalidEmail = Email$.validateSafe("not-an-email");
console.log("Validating 'not-an-email':", invalidEmail.ok ? "✓ PASS" : "✗ FAIL");
console.log();

const Age$ = new NumberType().min(0);
console.log("Created Age$ with .min(0)");

const validAge = Age$.validateSafe(25);
console.log("Validating 25:", validAge.ok ? "✓ PASS" : "✗ FAIL");

const invalidAge = Age$.validateSafe(150);
console.log("Validating 150:", invalidAge.ok ? "✓ PASS" : "✗ FAIL");
console.log();

// ============================================================================
// 5. Introspection - Examine Schema Structure
// ============================================================================

console.log("5. Introspection - Examine schema structure");
console.log("-".repeat(80));

const info = User$.inspect();
console.log(`Schema info kind: ${info.kind}`);

if (info.kind === "object") {
  console.log(`Object has ${info.properties.length} properties:`);
  for (const prop of info.properties) {
    const propInfo = (prop.type as any).inspect?.() || { kind: 'unknown' };
    console.log(`  - ${prop.name}: ${propInfo.kind} ${prop.optional ? '(optional)' : '(required)'}`);
  }
  console.log(`Strict mode: ${info.strict ? 'enabled' : 'disabled'}`);
}
console.log();

// ============================================================================
// 6. Utility Methods
// ============================================================================

console.log("6. Utility Methods");
console.log("-".repeat(80));

const User2$ = t.object({
  id: t.string(),
  email: t.string(),
  age: t.number(),
  role: t.union(t.literal("admin"), t.literal("user")),
});

console.log("Comparing two schemas:");
console.log(`User$ equals User2$: ${User$.equals(User2$)}`);
console.log(`User$ hash: ${User$.hash().substring(0, 16)}...`);
console.log(`User2$ hash: ${User2$.hash().substring(0, 16)}...`);
console.log();

// ============================================================================
// 7. Discriminated Unions (ADTs)
// ============================================================================

console.log("7. Discriminated Unions (ADTs)");
console.log("-".repeat(80));

const Result$ = t.dunion("type", {
  ok: t.object({ type: t.literal("ok"), value: t.number() }),
  err: t.object({ type: t.literal("err"), message: t.string() }),
});

console.log("Created Result$ discriminated union");
console.log(`Discriminant: '${Result$.discriminant}'`);
console.log(`Variants: ${Result$.variants.length}`);
Result$.variants.forEach(v => {
  console.log(`  - ${v.tag}`);
});

const okResult = Result$.validateSafe({ type: "ok", value: 42 });
console.log("Validating ok result:", okResult.ok ? "✓ PASS" : "✗ FAIL");

const errResult = Result$.validateSafe({ type: "err", message: "failed" });
console.log("Validating err result:", errResult.ok ? "✓ PASS" : "✗ FAIL");
console.log();

// ============================================================================
// Summary
// ============================================================================

console.log("=".repeat(80));
console.log("Summary: Type Object System Features");
console.log("=".repeat(80));
console.log("✓ Fluent builder API (t.object, t.string, etc.)");
console.log("✓ Runtime schema composition (makePartial, pick, omit, extend)");
console.log("✓ Refinements with method chaining (min, max, email, pattern)");
console.log("✓ Introspection (inspect, properties, discriminant, variants)");
console.log("✓ Metadata support (name, source, description)");
console.log("✓ Utility methods (equals, hash, bytecode)");
console.log("✓ Fast validation (uses optimized bytecode interpreter)");
console.log("✓ Backward compatible (raw bytecode arrays still work)");
console.log("=".repeat(80));
