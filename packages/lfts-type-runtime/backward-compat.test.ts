// packages/lfts-type-runtime/backward-compat.test.ts
// Backward compatibility tests: Ensure raw bytecode arrays still work

import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  validate,
  validateSafe,
  validateAll,
  serialize,
  match,
  introspect,
  Type,
  createTypeObject,
} from "./mod.ts";
import { Op } from "../lfts-type-spec/src/mod.ts";

// ============================================================================
// Raw Bytecode Array Validation (Pre-v0.10.0 Style)
// ============================================================================

Deno.test("Backward compat - validate() with raw bytecode array", () => {
  const schema = [Op.STRING];
  const result = validate(schema, "hello");
  assertEquals(result, "hello");
});

Deno.test("Backward compat - validateSafe() with raw bytecode array", () => {
  const schema = [Op.NUMBER];
  const result = validateSafe(schema, 42);
  assertEquals(result.ok, true);
  if (result.ok) {
    assertEquals(result.value, 42);
  }
});

Deno.test("Backward compat - validateSafe() rejects invalid value", () => {
  const schema = [Op.NUMBER];
  const result = validateSafe(schema, "not a number");
  assertEquals(result.ok, false);
});

Deno.test("Backward compat - complex object schema", () => {
  const schema = [
    Op.OBJECT,
    2,
    0,
    Op.PROPERTY, "id", 0, [Op.STRING],
    Op.PROPERTY, "age", 0, [Op.NUMBER],
  ];

  const valid = { id: "usr_123", age: 25 };
  const result = validateSafe(schema, valid);
  assertEquals(result.ok, true);
});

Deno.test("Backward compat - array schema", () => {
  const schema = [Op.ARRAY, [Op.NUMBER]];
  const result = validateSafe(schema, [1, 2, 3]);
  assertEquals(result.ok, true);
});

Deno.test("Backward compat - union schema", () => {
  const schema = [Op.UNION, 2, [Op.STRING], [Op.NUMBER]];

  const result1 = validateSafe(schema, "hello");
  assertEquals(result1.ok, true);

  const result2 = validateSafe(schema, 42);
  assertEquals(result2.ok, true);

  const result3 = validateSafe(schema, true);
  assertEquals(result3.ok, false);
});

Deno.test("Backward compat - discriminated union (DUNION)", () => {
  const schema = [
    Op.DUNION,
    "type",
    2,
    "ok",
    [Op.OBJECT, 2, 0, Op.PROPERTY, "type", 0, [Op.LITERAL, "ok"], Op.PROPERTY, "value", 0, [Op.NUMBER]],
    "err",
    [Op.OBJECT, 2, 0, Op.PROPERTY, "type", 0, [Op.LITERAL, "err"], Op.PROPERTY, "message", 0, [Op.STRING]],
  ];

  const ok = { type: "ok", value: 42 };
  const result1 = validateSafe(schema, ok);
  assertEquals(result1.ok, true);

  const err = { type: "err", message: "failed" };
  const result2 = validateSafe(schema, err);
  assertEquals(result2.ok, true);
});

// ============================================================================
// Introspection with Raw Bytecode
// ============================================================================

Deno.test("Backward compat - introspect() with raw bytecode", () => {
  const schema = [Op.STRING];
  const info = introspect(schema);
  assertEquals(info.kind, "primitive");
  if (info.kind === "primitive") {
    assertEquals(info.type, "string");
  }
});

Deno.test("Backward compat - introspect object schema", () => {
  const schema = [
    Op.OBJECT,
    2,
    0,
    Op.PROPERTY, "id", 0, [Op.STRING],
    Op.PROPERTY, "age", 1, [Op.NUMBER],
  ];

  const info = introspect(schema);
  assertEquals(info.kind, "object");
  if (info.kind === "object") {
    assertEquals(info.properties.length, 2);
    assertEquals(info.properties[0].name, "id");
    assertEquals(info.properties[0].optional, false);
    assertEquals(info.properties[1].name, "age");
    assertEquals(info.properties[1].optional, true);
  }
});

// ============================================================================
// Pattern Matching with Raw Bytecode
// ============================================================================

Deno.test("Backward compat - match() with ADT", () => {
  const value = { type: "ok", value: 42 } as
    | { type: "ok"; value: number }
    | { type: "err"; message: string };

  const result = match(value, {
    ok: (v) => `Success: ${v.value}`,
    err: (e) => `Error: ${e.message}`,
  });

  assertEquals(result, "Success: 42");
});

// ============================================================================
// Serialize with Raw Bytecode
// ============================================================================

Deno.test("Backward compat - serialize() with raw bytecode", () => {
  const schema = [Op.NUMBER];
  const result = serialize(schema, 42);
  assertEquals(result, 42);
});

// ============================================================================
// Mixed: Type Objects and Raw Bytecode
// ============================================================================

Deno.test("Backward compat - Type.bytecode exposes raw array", () => {
  const typeObj = createTypeObject([Op.STRING]);
  assertEquals(Array.isArray(typeObj.bytecode), true);
  assertEquals(typeObj.bytecode[0], Op.STRING);
});

Deno.test("Backward compat - validate() accepts Type objects", () => {
  const typeObj = createTypeObject([Op.NUMBER]);
  const result = validate(typeObj, 42);
  assertEquals(result, 42);
});

Deno.test("Backward compat - validateSafe() accepts Type objects", () => {
  const typeObj = createTypeObject([Op.STRING]);
  const result = validateSafe(typeObj, "hello");
  assertEquals(result.ok, true);
});

Deno.test("Backward compat - introspect() accepts Type objects", () => {
  const typeObj = createTypeObject([Op.BOOLEAN]);
  const info = introspect(typeObj);
  assertEquals(info.kind, "primitive");
  if (info.kind === "primitive") {
    assertEquals(info.type, "boolean");
  }
});

// ============================================================================
// Refinements with Raw Bytecode
// ============================================================================

Deno.test("Backward compat - refinement bytecode", () => {
  const schema = [Op.REFINE_MIN, 0, [Op.NUMBER]];

  const result1 = validateSafe(schema, 5);
  assertEquals(result1.ok, true);

  const result2 = validateSafe(schema, -1);
  assertEquals(result2.ok, false);
});

Deno.test("Backward compat - email refinement", () => {
  const schema = [Op.REFINE_EMAIL, [Op.STRING]];

  const result1 = validateSafe(schema, "test@example.com");
  assertEquals(result1.ok, true);

  const result2 = validateSafe(schema, "not-an-email");
  assertEquals(result2.ok, false);
});

Deno.test("Backward compat - nested refinements", () => {
  const schema = [Op.REFINE_MIN, 0, [Op.REFINE_MAX, 100, [Op.NUMBER]]];

  const result1 = validateSafe(schema, 50);
  assertEquals(result1.ok, true);

  const result2 = validateSafe(schema, -1);
  assertEquals(result2.ok, false);

  const result3 = validateSafe(schema, 150);
  assertEquals(result3.ok, false);
});

// ============================================================================
// Branded Types with Raw Bytecode
// ============================================================================

Deno.test("Backward compat - brand bytecode", () => {
  const schema = [Op.BRAND, "UserId", [Op.STRING]];
  const result = validateSafe(schema, "usr_123");
  assertEquals(result.ok, true);
});

// ============================================================================
// Readonly with Raw Bytecode
// ============================================================================

Deno.test("Backward compat - readonly bytecode", () => {
  const schema = [Op.READONLY, [Op.NUMBER]];
  const result = validateSafe(schema, 42);
  assertEquals(result.ok, true);
});

// ============================================================================
// Metadata with Raw Bytecode
// ============================================================================

Deno.test("Backward compat - metadata bytecode", () => {
  const schema = [
    Op.METADATA,
    { name: "User", source: "user.ts" },
    [Op.STRING],
  ];
  const result = validateSafe(schema, "hello");
  assertEquals(result.ok, true);
});

// ============================================================================
// validateAll with Raw Bytecode
// ============================================================================

Deno.test("Backward compat - validateAll() with raw bytecode", () => {
  const schema = [Op.NUMBER];
  const result = validateAll(schema, "not a number");
  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.errors.length > 0, true);
  }
});

// ============================================================================
// Edge Cases
// ============================================================================

Deno.test("Backward compat - tuple bytecode", () => {
  const schema = [Op.TUPLE, 2, [Op.STRING], [Op.NUMBER]];

  const result1 = validateSafe(schema, ["hello", 42]);
  assertEquals(result1.ok, true);

  const result2 = validateSafe(schema, [42, "hello"]);
  assertEquals(result2.ok, false);
});

Deno.test("Backward compat - literal bytecode", () => {
  const schema = [Op.LITERAL, "active"];

  const result1 = validateSafe(schema, "active");
  assertEquals(result1.ok, true);

  const result2 = validateSafe(schema, "inactive");
  assertEquals(result2.ok, false);
});

Deno.test("Backward compat - null and undefined bytecode", () => {
  const nullSchema = [Op.NULL];
  const result1 = validateSafe(nullSchema, null);
  assertEquals(result1.ok, true);

  const undefinedSchema = [Op.UNDEFINED];
  const result2 = validateSafe(undefinedSchema, undefined);
  assertEquals(result2.ok, true);
});

Deno.test("Backward compat - strict object mode", () => {
  const schema = [
    Op.OBJECT,
    1,
    1, // strict = true
    Op.PROPERTY, "id", 0, [Op.STRING],
  ];

  // Should reject excess properties in strict mode
  const result = validateSafe(schema, { id: "usr_123", extra: "field" });
  assertEquals(result.ok, false);
});

Deno.test("Backward compat - loose object mode", () => {
  const schema = [
    Op.OBJECT,
    1,
    0, // strict = false
    Op.PROPERTY, "id", 0, [Op.STRING],
  ];

  // Should accept excess properties in loose mode
  const result = validateSafe(schema, { id: "usr_123", extra: "field" });
  assertEquals(result.ok, true);
});
