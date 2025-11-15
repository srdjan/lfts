// Test for Phase 2.1: Improved union error diagnostics (v0.11.0)
// Verifies that union validation failures provide helpful "closest match" diagnostics

import { assertEquals, assertMatch } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { enc } from "../lfts-type-spec/src/mod.ts";
import { validate, validateSafe, validateAll } from "./mod.ts";

Deno.test("union diagnostics - object missing properties", () => {
  // Schema: { name: string, age: number } | { id: number }
  const schema = enc.union(
    enc.obj([
      { name: "name", type: enc.str() },
      { name: "age", type: enc.num() },
    ]),
    enc.obj([
      { name: "id", type: enc.num() },
    ]),
  );

  // Value is close to first alternative but missing 'age'
  const value = { name: "Alice" };

  const result = validateSafe(schema, value);
  assertEquals(result.ok, false);

  if (!result.ok) {
    // Error should mention missing property 'age'
    assertMatch(result.error.message, /missing.*age/i);
    assertMatch(result.error.message, /closest match/i);
  }
});

Deno.test("union diagnostics - object with invalid property types", () => {
  // Schema: { x: number, y: number } | { lat: number, lng: number }
  const schema = enc.union(
    enc.obj([
      { name: "x", type: enc.num() },
      { name: "y", type: enc.num() },
    ]),
    enc.obj([
      { name: "lat", type: enc.num() },
      { name: "lng", type: enc.num() },
    ]),
  );

  // Value matches first alternative structure but has wrong types
  const value = { x: "not a number", y: "also not a number" };

  const result = validateSafe(schema, value);
  assertEquals(result.ok, false);

  if (!result.ok) {
    // Error should mention invalid properties
    assertMatch(result.error.message, /invalid.*propert(y|ies)/i);
    assertMatch(result.error.message, /closest match/i);
  }
});

Deno.test("union diagnostics - completely wrong type", () => {
  // Schema: string | number
  const schema = enc.union(enc.str(), enc.num());

  // Value doesn't match either alternative
  const value = { foo: "bar" };

  const result = validateSafe(schema, value);
  assertEquals(result.ok, false);

  if (!result.ok) {
    // Should have generic message since similarity is low
    assertMatch(result.error.message, /no union alternative matched/i);
  }
});

Deno.test("union diagnostics - literal type close match", () => {
  // Schema: "success" | "failure" | "pending"
  const schema = enc.union(
    enc.lit("success"),
    enc.lit("failure"),
    enc.lit("pending"),
  );

  // Value has right type but wrong value
  const value = "unknown";

  const result = validateSafe(schema, value);
  assertEquals(result.ok, false);

  if (!result.ok) {
    // Should mention expected literal
    assertMatch(result.error.message, /expected literal/i);
    assertMatch(result.error.message, /closest match/i);
  }
});

Deno.test("union diagnostics - array vs object", () => {
  // Schema: string[] | { items: string[] }
  const schema = enc.union(
    enc.arr(enc.str()),
    enc.obj([{ name: "items", type: enc.arr(enc.str()) }]),
  );

  // Value is object but matches second alternative better
  const value = { items: "not an array" };

  const result = validateSafe(schema, value);
  assertEquals(result.ok, false);

  if (!result.ok) {
    // Should have helpful diagnostic
    assertMatch(result.error.message, /closest match/i);
  }
});

Deno.test("union diagnostics - validateAll also includes diagnostics", () => {
  // Schema with union nested in object
  const schema = enc.obj([
    {
      name: "data",
      type: enc.union(
        enc.obj([
          { name: "name", type: enc.str() },
          { name: "age", type: enc.num() },
        ]),
        enc.obj([
          { name: "id", type: enc.num() },
        ]),
      ),
    },
  ]);

  const value = { data: { name: "Bob" } }; // Missing 'age'

  const result = validateAll(schema, value);
  assertEquals(result.ok, false);

  if (!result.ok) {
    assertEquals(result.errors.length, 1);
    assertMatch(result.errors[0].message, /missing.*age/i);
    assertMatch(result.errors[0].message, /closest match/i);
  }
});

Deno.test("union diagnostics - mixed object with partial match", () => {
  // Real-world example: User | Admin
  type User = { type: "user"; name: string; email: string };
  type Admin = {
    type: "admin";
    name: string;
    email: string;
    role: string;
    permissions: string[];
  };

  const UserSchema = enc.obj([
    { name: "type", type: enc.lit("user") },
    { name: "name", type: enc.str() },
    { name: "email", type: enc.str() },
  ]);

  const AdminSchema = enc.obj([
    { name: "type", type: enc.lit("admin") },
    { name: "name", type: enc.str() },
    { name: "email", type: enc.str() },
    { name: "role", type: enc.str() },
    { name: "permissions", type: enc.arr(enc.str()) },
  ]);

  const schema = enc.union(UserSchema, AdminSchema);

  // Value looks like admin but missing role and permissions
  const value = {
    type: "admin",
    name: "Alice",
    email: "alice@example.com",
  };

  const result = validateSafe(schema, value);
  assertEquals(result.ok, false);

  if (!result.ok) {
    // Should identify Admin as closest match and list missing properties
    assertMatch(result.error.message, /missing.*required.*propert(y|ies)/i);
    assertMatch(result.error.message, /role/);
    assertMatch(result.error.message, /permissions/);
    assertMatch(result.error.message, /closest match/i);
  }
});

Deno.test("union diagnostics - successful validation has no diagnostics", () => {
  const schema = enc.union(
    enc.obj([{ name: "name", type: enc.str() }]),
    enc.obj([{ name: "id", type: enc.num() }]),
  );

  const value = { name: "Alice" };

  const result = validateSafe(schema, value);
  assertEquals(result.ok, true);
});
