// packages/lfts-type-runtime/error-aggregation.test.ts
import {
  assert,
  assertEquals,
} from "jsr:@std/assert";
import { enc } from "../lfts-type-spec/src/mod.ts";
import { validateAll } from "./mod.ts";

const userSchema = enc.obj([
  { name: "name", type: enc.str() },
  { name: "age", type: enc.num() },
  { name: "email", type: enc.str() },
]);

Deno.test("validateAll reports missing required properties", () => {
  const result = validateAll(userSchema, { name: "Alice" });
  assert(!result.ok);
  if (!result.ok) {
    const sorted = result.errors.map((e) => e.path).sort();
    assertEquals(sorted, ["age", "email"]);
  }
});

Deno.test("validateAll reports nested object issues", () => {
  const schema = enc.obj([
    {
      name: "user",
      type: enc.obj([
        { name: "name", type: enc.str() },
        { name: "age", type: enc.num() },
      ]),
    },
    { name: "active", type: enc.bool() },
  ]);

  const result = validateAll(schema, {
    user: { name: 123, age: "not-a-number" },
    active: "yes",
  });

  assert(!result.ok);
  if (!result.ok) {
    assertEquals(result.errors.length, 3);
    const messages = result.errors.map((e) => e.message);
    assert(messages.some((m) => m.includes("boolean")));
    assert(messages.some((m) => m.includes("number")));
    assert(messages.some((m) => m.includes("string")));
  }
});

Deno.test("validateAll reports errors for array elements", () => {
  const schema = enc.arr(enc.num());
  const result = validateAll(schema, [1, "two", 3, "four"]);
  assert(!result.ok);
  if (!result.ok) {
    assertEquals(result.errors.length, 2);
    const paths = result.errors.map((e) => e.path).sort();
    assertEquals(paths, ["[1]", "[3]"]);
  }
});

Deno.test("validateAll handles array of objects with multiple errors", () => {
  const person = enc.obj([
    { name: "name", type: enc.str() },
    { name: "age", type: enc.num() },
  ]);
  const people = enc.arr(person);
  const result = validateAll(people, [
    { name: "Alice", age: 30 },
    { name: 123, age: "twenty" },
    { name: "Charlie" },
  ]);

  assert(!result.ok);
  if (!result.ok) {
    assertEquals(result.errors.length, 3);
    const sorted = result.errors.map((e) => e.path).sort();
    assertEquals(sorted, ["[1].age", "[1].name", "[2].age"]);
  }
});

Deno.test("validateAll reports tuple element mismatches", () => {
  const schema = enc.tup(enc.str(), enc.num(), enc.bool());
  const result = validateAll(schema, [123, "not-number", "not-boolean"]);
  assert(!result.ok);
  if (!result.ok) {
    const messages = result.errors.map((e) => e.message);
    assert(messages.some((m) => m.includes("string")));
    assert(messages.some((m) => m.includes("number")));
    assert(messages.some((m) => m.includes("boolean")));
  }
});

Deno.test("validateAll enforces strict object mode", () => {
  const schema = enc.obj([
    { name: "name", type: enc.str() },
    { name: "age", type: enc.num() },
  ], true);

  const result = validateAll(schema, {
    name: 123,
    age: 25,
    extra: "nope",
  });

  assert(!result.ok);
  if (!result.ok) {
    const messages = result.errors.map((e) => e.message);
    assert(messages.some((m) => m.includes("expected string")));
    assert(messages.some((m) => m.includes("excess property")));
  }
});

Deno.test("validateAll respects maxErrors limit", () => {
  const schema = enc.arr(enc.str());
  const result = validateAll(schema, [1, 2, 3, 4], 2);
  assert(!result.ok);
  if (!result.ok) {
    assertEquals(result.errors.length, 2);
  }
});

Deno.test("validateAll succeeds for valid data", () => {
  const validUser = {
    name: "Bob",
    age: 25,
    email: "bob@example.com",
  };
  const result = validateAll<typeof validUser>(userSchema, validUser);
  assert(result.ok);
  if (result.ok) {
    assertEquals(result.value.name, "Bob");
  }
});

Deno.test("validateAll reports deep nested errors", () => {
  const schema = enc.obj([
    {
      name: "users",
      type: enc.arr(enc.obj([
        { name: "id", type: enc.num() },
        {
          name: "profile",
          type: enc.obj([
            { name: "name", type: enc.str() },
            { name: "tags", type: enc.arr(enc.str()) },
          ]),
        },
      ])),
    },
    { name: "count", type: enc.num() },
  ]);

  const data = {
    users: [
      { id: 1, profile: { name: "Alice", tags: ["admin", 123] } },
      { id: "two", profile: { name: 456, tags: ["user"] } },
      { id: 3 },
    ],
    count: "not-a-number",
  };

  const result = validateAll(schema, data);
  assert(!result.ok);
  if (!result.ok) {
    assertEquals(result.errors.length, 5);
    const paths = result.errors.map((e) => e.path);
    assert(paths.includes("count"));
    assert(paths.includes("users[0].profile.tags[1]"));
    assert(paths.includes("users[1].id"));
    assert(paths.includes("users[1].profile.name"));
    assert(paths.includes("users[2].profile"));
  }
});
