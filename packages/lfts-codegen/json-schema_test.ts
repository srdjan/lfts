// packages/lfts-codegen/json-schema_test.ts
// Tests for JSON Schema generator

import { assertEquals } from "jsr:@std/assert@1";
import { enc } from "../lfts-type-spec/src/mod.ts";
import { generateJsonSchema } from "./json-schema.ts";

Deno.test("generateJsonSchema: primitive string", () => {
  const schema = enc.str();
  const result = generateJsonSchema(schema, { includeSchema: false });
  assertEquals(result, { type: "string" });
});

Deno.test("generateJsonSchema: primitive number", () => {
  const schema = enc.num();
  const result = generateJsonSchema(schema, { includeSchema: false });
  assertEquals(result, { type: "number" });
});

Deno.test("generateJsonSchema: primitive boolean", () => {
  const schema = enc.bool();
  const result = generateJsonSchema(schema, { includeSchema: false });
  assertEquals(result, { type: "boolean" });
});

Deno.test("generateJsonSchema: literal string", () => {
  const schema = enc.lit("hello");
  const result = generateJsonSchema(schema, { includeSchema: false });
  assertEquals(result, { const: "hello" });
});

Deno.test("generateJsonSchema: literal number", () => {
  const schema = enc.lit(42);
  const result = generateJsonSchema(schema, { includeSchema: false });
  assertEquals(result, { const: 42 });
});

Deno.test("generateJsonSchema: array", () => {
  const schema = enc.arr(enc.str());
  const result = generateJsonSchema(schema, { includeSchema: false });
  assertEquals(result, {
    type: "array",
    items: { type: "string" },
  });
});

Deno.test("generateJsonSchema: tuple", () => {
  const schema = enc.tup(enc.str(), enc.num(), enc.bool());
  const result = generateJsonSchema(schema, { includeSchema: false });
  assertEquals(result, {
    type: "array",
    prefixItems: [
      { type: "string" },
      { type: "number" },
      { type: "boolean" },
    ],
    minItems: 3,
    maxItems: 3,
  });
});

Deno.test("generateJsonSchema: simple object", () => {
  const schema = enc.obj([
    { name: "id", type: enc.num(), optional: false },
    { name: "name", type: enc.str(), optional: false },
  ]);
  const result = generateJsonSchema(schema, { includeSchema: false });
  assertEquals(result, {
    type: "object",
    properties: {
      id: { type: "number" },
      name: { type: "string" },
    },
    required: ["id", "name"],
  });
});

Deno.test("generateJsonSchema: object with optional properties", () => {
  const schema = enc.obj([
    { name: "id", type: enc.num(), optional: false },
    { name: "name", type: enc.str(), optional: true },
  ]);
  const result = generateJsonSchema(schema, { includeSchema: false });
  assertEquals(result, {
    type: "object",
    properties: {
      id: { type: "number" },
      name: { type: "string" },
    },
    required: ["id"],
  });
});

Deno.test("generateJsonSchema: object with strict mode", () => {
  const schema = enc.obj([
    { name: "id", type: enc.num(), optional: false },
  ]);
  const result = generateJsonSchema(schema, { includeSchema: false, strict: true });
  assertEquals(result, {
    type: "object",
    properties: {
      id: { type: "number" },
    },
    required: ["id"],
    additionalProperties: false,
  });
});

Deno.test("generateJsonSchema: union type", () => {
  const schema = enc.union(enc.str(), enc.num());
  const result = generateJsonSchema(schema, { includeSchema: false });
  assertEquals(result, {
    anyOf: [
      { type: "string" },
      { type: "number" },
    ],
  });
});

Deno.test("generateJsonSchema: discriminated union", () => {
  const schema = enc.dunion("type", [
    {
      tag: "success",
      schema: enc.obj([
        { name: "type", type: enc.lit("success"), optional: false },
        { name: "value", type: enc.str(), optional: false },
      ]),
    },
    {
      tag: "error",
      schema: enc.obj([
        { name: "type", type: enc.lit("error"), optional: false },
        { name: "message", type: enc.str(), optional: false },
      ]),
    },
  ]);
  const result = generateJsonSchema(schema, { includeSchema: false });
  assertEquals(result, {
    oneOf: [
      {
        title: "success",
        type: "object",
        properties: {
          type: { const: "success" },
          value: { type: "string" },
        },
        required: ["type", "value"],
      },
      {
        title: "error",
        type: "object",
        properties: {
          type: { const: "error" },
          message: { type: "string" },
        },
        required: ["type", "message"],
      },
    ],
    discriminator: {
      propertyName: "type",
    },
  });
});

Deno.test("generateJsonSchema: brand type (transparent)", () => {
  const schema = enc.brand(enc.str(), "UserId");
  const result = generateJsonSchema(schema, { includeSchema: false });
  assertEquals(result, { type: "string" });
});

Deno.test("generateJsonSchema: readonly type (transparent)", () => {
  const schema = enc.ro(enc.str());
  const result = generateJsonSchema(schema, { includeSchema: false });
  assertEquals(result, { type: "string" });
});

Deno.test("generateJsonSchema: refinement - min/max number", () => {
  const schema = enc.refine.min(enc.refine.max(enc.num(), 100), 0);
  const result = generateJsonSchema(schema, { includeSchema: false });
  assertEquals(result, {
    type: "number",
    minimum: 0,
    maximum: 100,
  });
});

Deno.test("generateJsonSchema: refinement - email", () => {
  const schema = enc.refine.email(enc.str());
  const result = generateJsonSchema(schema, { includeSchema: false });
  assertEquals(result, {
    type: "string",
    format: "email",
  });
});

Deno.test("generateJsonSchema: refinement - url", () => {
  const schema = enc.refine.url(enc.str());
  const result = generateJsonSchema(schema, { includeSchema: false });
  assertEquals(result, {
    type: "string",
    format: "uri",
  });
});

Deno.test("generateJsonSchema: refinement - pattern", () => {
  const schema = enc.refine.pattern(enc.str(), "^[A-Z]+$");
  const result = generateJsonSchema(schema, { includeSchema: false });
  assertEquals(result, {
    type: "string",
    pattern: "^[A-Z]+$",
  });
});

Deno.test("generateJsonSchema: refinement - minLength/maxLength", () => {
  const schema = enc.refine.minLength(enc.refine.maxLength(enc.str(), 100), 3);
  const result = generateJsonSchema(schema, { includeSchema: false });
  assertEquals(result, {
    type: "string",
    minLength: 3,
    maxLength: 100,
  });
});

Deno.test("generateJsonSchema: refinement - integer", () => {
  const schema = enc.refine.integer(enc.num());
  const result = generateJsonSchema(schema, { includeSchema: false });
  assertEquals(result, {
    type: "number",
    multipleOf: 1,
  });
});

Deno.test("generateJsonSchema: metadata with title", () => {
  const schema = enc.metadata(enc.str(), { name: "UserName" });
  const result = generateJsonSchema(schema, { includeSchema: false });
  assertEquals(result, {
    type: "string",
    title: "UserName",
  });
});

Deno.test("generateJsonSchema: nested object", () => {
  const schema = enc.obj([
    { name: "id", type: enc.num(), optional: false },
    {
      name: "profile",
      type: enc.obj([
        { name: "name", type: enc.str(), optional: false },
        { name: "email", type: enc.refine.email(enc.str()), optional: false },
      ]),
      optional: false,
    },
  ]);
  const result = generateJsonSchema(schema, { includeSchema: false });
  assertEquals(result, {
    type: "object",
    properties: {
      id: { type: "number" },
      profile: {
        type: "object",
        properties: {
          name: { type: "string" },
          email: {
            type: "string",
            format: "email",
          },
        },
        required: ["name", "email"],
      },
    },
    required: ["id", "profile"],
  });
});

Deno.test("generateJsonSchema: includes $schema by default", () => {
  const schema = enc.str();
  const result = generateJsonSchema(schema);
  assertEquals(result.$schema, "https://json-schema.org/draft/2020-12/schema");
});

Deno.test("generateJsonSchema: draft version option", () => {
  const schema = enc.str();
  const result = generateJsonSchema(schema, { draft: "07" });
  assertEquals(result.$schema, "http://json-schema.org/draft-07/schema#");
});

Deno.test("generateJsonSchema: complex user schema", () => {
  const UserIdSchema = enc.brand(enc.str(), "UserId");
  const EmailSchema = enc.refine.email(enc.str());
  const AgeSchema = enc.refine.min(enc.refine.max(enc.num(), 120), 0);

  const UserSchema = enc.obj([
    { name: "id", type: UserIdSchema, optional: false },
    { name: "name", type: enc.str(), optional: false },
    { name: "email", type: EmailSchema, optional: false },
    { name: "age", type: AgeSchema, optional: true },
    { name: "tags", type: enc.arr(enc.str()), optional: false },
  ]);

  const result = generateJsonSchema(UserSchema, { includeSchema: false });

  assertEquals(result, {
    type: "object",
    properties: {
      id: { type: "string" },
      name: { type: "string" },
      email: {
        type: "string",
        format: "email",
      },
      age: {
        type: "number",
        minimum: 0,
        maximum: 120,
      },
      tags: {
        type: "array",
        items: { type: "string" },
      },
    },
    required: ["id", "name", "email", "tags"],
  });
});
