// packages/lfts-type-runtime/strict.test.ts
import {
  assert,
  assertEquals,
  assertThrows,
} from "jsr:@std/assert";
import { enc } from "../lfts-type-spec/src/mod.ts";
import { validate, validateSafe } from "./mod.ts";

const looseSchema = enc.obj([
  { name: "name", type: enc.str() },
  { name: "age", type: enc.num() },
]);

const strictSchema = enc.obj([
  { name: "name", type: enc.str() },
  { name: "age", type: enc.num() },
], true);

const nestedStrictSchema = enc.obj([
  {
    name: "user",
    type: enc.obj([
      { name: "name", type: enc.str() },
      { name: "email", type: enc.str() },
    ], true),
  },
]);

Deno.test("loose mode allows excess properties", () => {
  const validLoose = { name: "Alice", age: 30 };
  const excessLoose = { name: "Bob", age: 25, extra: "ignored" };

  assertEquals(validate(looseSchema, validLoose), validLoose);
  assertEquals(validate(looseSchema, excessLoose), excessLoose);
});

Deno.test("strict mode rejects excess properties", () => {
  const valid = { name: "Alice", age: 30 };
  const excess = { name: "Bob", age: 25, extra: "ignored" };

  assertEquals(validate(strictSchema, valid), valid);

  assertThrows(
    () => validate(strictSchema, excess),
    Error,
    "excess property (not in schema)",
  );

  const result = validateSafe(strictSchema, {
    name: "Charlie",
    age: 35,
    extra1: "bad",
    extra2: "also bad",
  });
  assert(!result.ok);
  if (!result.ok) {
    assertEquals(result.error.message, "excess property (not in schema)");
    assertEquals(result.error.path, "extra1");
  }
});

Deno.test("strict mode nested object rejects extra properties", () => {
  const validNested = { user: { name: "Dave", email: "dave@example.com" } };
  const excessNested = {
    user: { name: "Eve", email: "eve@example.com", phone: "123" },
  };

  assertEquals(validate(nestedStrictSchema, validNested), validNested);

  const result = validateSafe(nestedStrictSchema, excessNested);
  assert(!result.ok);
  if (!result.ok) {
    assertEquals(result.error.message, "excess property (not in schema)");
    assertEquals(result.error.path, "user.phone");
  }
});
