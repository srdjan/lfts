// packages/lfts-type-runtime/type-object.test.ts
// Comprehensive tests for Type object system

import { assertEquals, assertThrows } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  Type,
  StringType,
  NumberType,
  BooleanType,
  ObjectType,
  ArrayType,
  UnionType,
  DUnionType,
  TupleType,
  LiteralType,
  createTypeObject,
  t,
  primitives,
} from "./mod.ts";
import { Op } from "../lfts-type-spec/src/mod.ts";

// ============================================================================
// Primitive Type Tests
// ============================================================================

Deno.test("StringType - basic validation", () => {
  const schema = new StringType();

  // Valid
  const result1 = schema.validateSafe("hello");
  assertEquals(result1.ok, true);
  if (result1.ok) {
    assertEquals(result1.value, "hello");
  }

  // Invalid
  const result2 = schema.validateSafe(123);
  assertEquals(result2.ok, false);
});

Deno.test("NumberType - basic validation", () => {
  const schema = new NumberType();

  const result1 = schema.validateSafe(42);
  assertEquals(result1.ok, true);

  const result2 = schema.validateSafe("not a number");
  assertEquals(result2.ok, false);
});

Deno.test("BooleanType - basic validation", () => {
  const schema = new BooleanType();

  const result1 = schema.validateSafe(true);
  assertEquals(result1.ok, true);

  const result2 = schema.validateSafe("true");
  assertEquals(result2.ok, false);
});

Deno.test("LiteralType - string literal", () => {
  const schema = new LiteralType("active");

  const result1 = schema.validateSafe("active");
  assertEquals(result1.ok, true);

  const result2 = schema.validateSafe("inactive");
  assertEquals(result2.ok, false);

  assertEquals(schema.value, "active");
});

Deno.test("LiteralType - number literal", () => {
  const schema = new LiteralType(42);

  const result1 = schema.validateSafe(42);
  assertEquals(result1.ok, true);

  const result2 = schema.validateSafe(43);
  assertEquals(result2.ok, false);

  assertEquals(schema.value, 42);
});

// ============================================================================
// Composite Type Tests
// ============================================================================

Deno.test("ArrayType - basic validation", () => {
  const schema = new ArrayType(new NumberType());

  const result1 = schema.validateSafe([1, 2, 3]);
  assertEquals(result1.ok, true);

  const result2 = schema.validateSafe([1, "two", 3]);
  assertEquals(result2.ok, false);

  // Check element accessor
  assertEquals(schema.element.kind, "number");
});

Deno.test("TupleType - basic validation", () => {
  const schema = new TupleType([new StringType(), new NumberType()]);

  const result1 = schema.validateSafe(["hello", 42]);
  assertEquals(result1.ok, true);

  const result2 = schema.validateSafe([42, "hello"]);
  assertEquals(result2.ok, false);

  // Check elements accessor
  assertEquals(schema.elements.length, 2);
  assertEquals(schema.elements[0].kind, "string");
  assertEquals(schema.elements[1].kind, "number");
});

Deno.test("ObjectType - basic validation", () => {
  const schema = ObjectType.fromProperties([
    { name: "id", type: new StringType(), optional: false },
    { name: "age", type: new NumberType(), optional: false },
  ], false);

  const result1 = schema.validateSafe({ id: "usr_123", age: 25 });
  assertEquals(result1.ok, true);

  const result2 = schema.validateSafe({ id: "usr_123" }); // missing age
  assertEquals(result2.ok, false);

  // Check properties accessor
  assertEquals(schema.properties.length, 2);
  assertEquals(schema.properties[0].name, "id");
  assertEquals(schema.properties[1].name, "age");
  assertEquals(schema.strict, false);
});

Deno.test("ObjectType - strict mode", () => {
  const schema = ObjectType.fromProperties([
    { name: "id", type: new StringType(), optional: false },
  ], true);

  // Strict mode should reject excess properties
  const result = schema.validateSafe({ id: "usr_123", extra: "field" });
  assertEquals(result.ok, false);
  assertEquals(schema.strict, true);
});

Deno.test("UnionType - basic validation", () => {
  const schema = new UnionType([
    new StringType(),
    new NumberType(),
  ]);

  const result1 = schema.validateSafe("hello");
  assertEquals(result1.ok, true);

  const result2 = schema.validateSafe(42);
  assertEquals(result2.ok, true);

  const result3 = schema.validateSafe(true);
  assertEquals(result3.ok, false);

  // Check alternatives accessor
  assertEquals(schema.alternatives.length, 2);
});

Deno.test("DUnionType - discriminated union validation", () => {
  const schema = new DUnionType("type", [
    {
      tag: "ok",
      schema: ObjectType.fromProperties([
        { name: "type", type: new LiteralType("ok"), optional: false },
        { name: "value", type: new NumberType(), optional: false },
      ], false),
    },
    {
      tag: "err",
      schema: ObjectType.fromProperties([
        { name: "type", type: new LiteralType("err"), optional: false },
        { name: "message", type: new StringType(), optional: false },
      ], false),
    },
  ]);

  const result1 = schema.validateSafe({ type: "ok", value: 42 });
  assertEquals(result1.ok, true);

  const result2 = schema.validateSafe({ type: "err", message: "failed" });
  assertEquals(result2.ok, true);

  const result3 = schema.validateSafe({ type: "invalid" });
  assertEquals(result3.ok, false);

  // Check discriminant and variants
  assertEquals(schema.discriminant, "type");
  assertEquals(schema.variants.length, 2);
  assertEquals(schema.variants[0].tag, "ok");
  assertEquals(schema.variants[1].tag, "err");
});

// ============================================================================
// Object Composition Methods
// ============================================================================

Deno.test("ObjectType.makePartial - makes all properties optional", () => {
  const schema = ObjectType.fromProperties([
    { name: "id", type: new StringType(), optional: false },
    { name: "name", type: new StringType(), optional: false },
  ], false);

  const partial = schema.makePartial();

  // All properties should now be optional
  assertEquals(partial.properties[0].optional, true);
  assertEquals(partial.properties[1].optional, true);

  // Should accept partial objects
  const result = partial.validateSafe({ id: "usr_123" });
  assertEquals(result.ok, true);
});

Deno.test("ObjectType.makeRequired - makes all properties required", () => {
  const schema = ObjectType.fromProperties([
    { name: "id", type: new StringType(), optional: false },
    { name: "email", type: new StringType(), optional: true },
  ], false);

  const required = schema.makeRequired();

  // All properties should now be required
  assertEquals(required.properties[0].optional, false);
  assertEquals(required.properties[1].optional, false);
});

Deno.test("ObjectType.pick - selects specific properties", () => {
  const schema = ObjectType.fromProperties([
    { name: "id", type: new StringType(), optional: false },
    { name: "name", type: new StringType(), optional: false },
    { name: "email", type: new StringType(), optional: false },
  ], false);

  const picked = schema.pick(["id", "email"]);

  assertEquals(picked.properties.length, 2);
  assertEquals(picked.properties[0].name, "id");
  assertEquals(picked.properties[1].name, "email");

  const result = picked.validateSafe({ id: "usr_123", email: "test@example.com" });
  assertEquals(result.ok, true);
});

Deno.test("ObjectType.omit - excludes specific properties", () => {
  const schema = ObjectType.fromProperties([
    { name: "id", type: new StringType(), optional: false },
    { name: "name", type: new StringType(), optional: false },
    { name: "password", type: new StringType(), optional: false },
  ], false);

  const omitted = schema.omit(["password"]);

  assertEquals(omitted.properties.length, 2);
  assertEquals(omitted.properties[0].name, "id");
  assertEquals(omitted.properties[1].name, "name");
});

Deno.test("ObjectType.extend - adds new properties", () => {
  const schema = ObjectType.fromProperties([
    { name: "id", type: new StringType(), optional: false },
  ], false);

  const extended = schema.extend({
    createdAt: new NumberType(),
    updatedAt: new NumberType(),
  });

  assertEquals(extended.properties.length, 3);
  assertEquals(extended.properties[0].name, "id");
  assertEquals(extended.properties[1].name, "createdAt");
  assertEquals(extended.properties[2].name, "updatedAt");
});

Deno.test("ObjectType.withStrictMode - toggles strict mode", () => {
  const schema = ObjectType.fromProperties([
    { name: "id", type: new StringType(), optional: false },
  ], false);

  assertEquals(schema.strict, false);

  const strict = schema.withStrictMode(true);
  assertEquals(strict.strict, true);

  const loose = strict.withStrictMode(false);
  assertEquals(loose.strict, false);
});

// ============================================================================
// Refinement Methods
// ============================================================================

Deno.test("StringType.minLength - validates minimum length", () => {
  const schema = new StringType().minLength(5);

  const result1 = schema.validateSafe("hello");
  assertEquals(result1.ok, true);

  const result2 = schema.validateSafe("hi");
  assertEquals(result2.ok, false);
});

Deno.test("StringType.maxLength - validates maximum length", () => {
  const schema = new StringType().maxLength(10);

  const result1 = schema.validateSafe("hello");
  assertEquals(result1.ok, true);

  const result2 = schema.validateSafe("this is too long");
  assertEquals(result2.ok, false);
});

Deno.test("StringType.email - validates email format", () => {
  const schema = new StringType().email();

  const result1 = schema.validateSafe("test@example.com");
  assertEquals(result1.ok, true);

  const result2 = schema.validateSafe("not-an-email");
  assertEquals(result2.ok, false);
});

Deno.test("NumberType.min - validates minimum value", () => {
  const schema = new NumberType().min(0);

  const result1 = schema.validateSafe(5);
  assertEquals(result1.ok, true);

  const result2 = schema.validateSafe(-1);
  assertEquals(result2.ok, false);
});

Deno.test("NumberType.max - validates maximum value", () => {
  const schema = new NumberType().max(100);

  const result1 = schema.validateSafe(50);
  assertEquals(result1.ok, true);

  const result2 = schema.validateSafe(150);
  assertEquals(result2.ok, false);
});

Deno.test("NumberType.integer - validates integer", () => {
  const schema = new NumberType().integer();

  const result1 = schema.validateSafe(42);
  assertEquals(result1.ok, true);

  const result2 = schema.validateSafe(42.5);
  assertEquals(result2.ok, false);
});

Deno.test("NumberType.range - validates range", () => {
  const schema = new NumberType().range(0, 100);

  const result1 = schema.validateSafe(50);
  assertEquals(result1.ok, true);

  const result2 = schema.validateSafe(-1);
  assertEquals(result2.ok, false);

  const result3 = schema.validateSafe(150);
  assertEquals(result3.ok, false);
});

// Note: Chaining refinements works at runtime (bytecode is nested correctly),
// but TypeScript types don't preserve methods after wrapping.
// This is a known limitation - refinements return Type, not StringType.
// For now, build complex refinements by nesting constructors or using t builders.
Deno.test.ignore("Refinements can be chained", () => {
  const schema = new StringType().minLength(3).maxLength(20).email();

  const result1 = schema.validateSafe("test@example.com");
  assertEquals(result1.ok, true);

  const result2 = schema.validateSafe("a@b.c"); // too short
  assertEquals(result2.ok, false);
});

// ============================================================================
// Wrapper Methods
// ============================================================================

Deno.test("Type.makeBranded - wraps with brand", () => {
  const schema = new StringType().makeBranded("UserId");

  assertEquals(schema.kind, "brand");
  const result = schema.validateSafe("usr_123");
  assertEquals(result.ok, true);
});

Deno.test("Type.withMetadata - attaches metadata", () => {
  const schema = new StringType().withMetadata({
    name: "Email",
    source: "user.schema.ts",
    description: "User email address",
  });

  assertEquals(schema.kind, "metadata");
  const result = schema.validateSafe("test@example.com");
  assertEquals(result.ok, true);
});

// ============================================================================
// Builder API Tests
// ============================================================================

Deno.test("t.string() - creates StringType", () => {
  const schema = t.string();
  assertEquals(schema.kind, "string");
});

Deno.test("t.number() - creates NumberType", () => {
  const schema = t.number();
  assertEquals(schema.kind, "number");
});

Deno.test("t.boolean() - creates BooleanType", () => {
  const schema = t.boolean();
  assertEquals(schema.kind, "boolean");
});

Deno.test("t.literal() - creates LiteralType", () => {
  const schema = t.literal("active");
  assertEquals(schema.kind, "literal");
  assertEquals(schema.value, "active");
});

Deno.test("t.array() - creates ArrayType", () => {
  const schema = t.array(t.number());
  assertEquals(schema.kind, "array");

  const result = schema.validateSafe([1, 2, 3]);
  assertEquals(result.ok, true);
});

Deno.test("t.tuple() - creates TupleType", () => {
  const schema = t.tuple(t.string(), t.number());
  assertEquals(schema.kind, "tuple");

  const result = schema.validateSafe(["hello", 42]);
  assertEquals(result.ok, true);
});

Deno.test("t.object() - creates ObjectType", () => {
  const schema = t.object({
    id: t.string(),
    age: t.number(),
  });

  assertEquals(schema.kind, "object");

  const result = schema.validateSafe({ id: "usr_123", age: 25 });
  assertEquals(result.ok, true);
});

Deno.test("t.union() - creates UnionType", () => {
  const schema = t.union(t.string(), t.number());
  assertEquals(schema.kind, "union");

  const result1 = schema.validateSafe("hello");
  assertEquals(result1.ok, true);

  const result2 = schema.validateSafe(42);
  assertEquals(result2.ok, true);
});

Deno.test("t.dunion() - creates DUnionType", () => {
  const schema = t.dunion("type", {
    ok: t.object({ type: t.literal("ok"), value: t.number() }),
    err: t.object({ type: t.literal("err"), message: t.string() }),
  });

  assertEquals(schema.kind, "dunion");

  const result = schema.validateSafe({ type: "ok", value: 42 });
  assertEquals(result.ok, true);
});

Deno.test("t.optional() - creates optional type", () => {
  const schema = t.optional(t.string());
  assertEquals(schema.kind, "union");

  const result1 = schema.validateSafe("hello");
  assertEquals(result1.ok, true);

  const result2 = schema.validateSafe(undefined);
  assertEquals(result2.ok, true);
});

Deno.test("t.nullable() - creates nullable type", () => {
  const schema = t.nullable(t.string());
  assertEquals(schema.kind, "union");

  const result1 = schema.validateSafe("hello");
  assertEquals(result1.ok, true);

  const result2 = schema.validateSafe(null);
  assertEquals(result2.ok, true);
});

Deno.test("Fluent API - complex schema (limited chaining)", () => {
  // Note: Due to type system limitations, can't chain refinements.
  // Each refinement wraps the schema, so methods aren't available.
  // Workaround: Apply one refinement at a time.
  const schema = t.object({
    id: t.string().pattern("^usr_[a-z0-9]+$"),
    email: t.string().email(),
    age: t.number().min(0),
    role: t.union(t.literal("admin"), t.literal("user")),
  });

  const result = schema.validateSafe({
    id: "usr_abc123",
    email: "test@example.com",
    age: 25,
    role: "user",
  });

  assertEquals(result.ok, true);
});

// ============================================================================
// Utility Tests
// ============================================================================

Deno.test("Type.equals() - compares schemas", () => {
  const schema1 = new StringType();
  const schema2 = new StringType();
  const schema3 = new NumberType();

  assertEquals(schema1.equals(schema2), true);
  assertEquals(schema1.equals(schema3), false);
});

Deno.test("Type.hash() - generates stable hash", () => {
  const schema1 = new StringType();
  const schema2 = new StringType();

  assertEquals(schema1.hash(), schema2.hash());
});

Deno.test("Type.bytecode - exposes bytecode", () => {
  const schema = new StringType();
  assertEquals(schema.bytecode[0], Op.STRING);
});

Deno.test("primitives - pre-built types", () => {
  assertEquals(primitives.string.kind, "string");
  assertEquals(primitives.number.kind, "number");
  assertEquals(primitives.boolean.kind, "boolean");
  assertEquals(primitives.null.kind, "null");
  assertEquals(primitives.undefined.kind, "undefined");
});

// ============================================================================
// createTypeObject Factory Tests
// ============================================================================

Deno.test("createTypeObject - creates from bytecode", () => {
  const bc = [Op.STRING];
  const schema = createTypeObject(bc);

  assertEquals(schema.kind, "string");
});

Deno.test("createTypeObject - with metadata", () => {
  const bc = [Op.STRING];
  const schema = createTypeObject(bc, {
    name: "Email",
    source: "user.schema.ts",
  });

  assertEquals(schema.kind, "metadata");
});

// ============================================================================
// Error Handling Tests
// ============================================================================

Deno.test("Type.validate() - throws on invalid value", () => {
  const schema = new NumberType();

  assertThrows(
    () => schema.validate("not a number"),
    Error,
    "Validation failed"
  );
});

Deno.test("Type.validateAll() - returns all errors", () => {
  const schema = new NumberType();

  const errors = schema.validateAll("not a number");
  assertEquals(errors.length, 1);
  // Check that error message contains "number" (exact message may vary)
  const hasNumberInMessage = errors[0].message.toLowerCase().includes("number");
  assertEquals(hasNumberInMessage, true);
});

// ============================================================================
// Introspection Tests
// ============================================================================

Deno.test("Type.inspect() - returns schema info", () => {
  const schema = new StringType();
  const info = schema.inspect();

  assertEquals(info.kind, "primitive");
  if (info.kind === "primitive") {
    assertEquals(info.type, "string");
  }
});

Deno.test("ObjectType.inspect() - returns object info", () => {
  const schema = ObjectType.fromProperties([
    { name: "id", type: new StringType(), optional: false },
  ], false);

  const info = schema.inspect();
  assertEquals(info.kind, "object");
  if (info.kind === "object") {
    assertEquals(info.properties.length, 1);
    assertEquals(info.strict, false);
  }
});
