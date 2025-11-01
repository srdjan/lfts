// packages/lfts-codegen/mock-data_test.ts
// Tests for mock data generator

import { assertEquals } from "jsr:@std/assert@1";
import { enc } from "../lfts-type-spec/src/mod.ts";
import { validate } from "../lfts-type-runtime/mod.ts";
import { generateMockData } from "./mock-data.ts";

Deno.test("generateMockData: string primitive", () => {
  const schema = enc.str();
  const result = generateMockData(schema, { seed: 12345 });
  assertEquals(typeof result, "string");
});

Deno.test("generateMockData: number primitive", () => {
  const schema = enc.num();
  const result = generateMockData(schema, { seed: 12345 });
  assertEquals(typeof result, "number");
});

Deno.test("generateMockData: boolean primitive", () => {
  const schema = enc.bool();
  const result = generateMockData(schema, { seed: 12345 });
  assertEquals(typeof result, "boolean");
});

Deno.test("generateMockData: literal", () => {
  const schema = enc.lit("hello");
  const result = generateMockData(schema);
  assertEquals(result, "hello");
});

Deno.test("generateMockData: array", () => {
  const schema = enc.arr(enc.str());
  const result = generateMockData(schema, { seed: 12345, minArrayLength: 2, maxArrayLength: 2 });
  assertEquals(Array.isArray(result), true);
  assertEquals((result as unknown[]).length, 2);
});

Deno.test("generateMockData: tuple", () => {
  const schema = enc.tup(enc.str(), enc.num(), enc.bool());
  const result = generateMockData(schema, { seed: 12345 }) as unknown[];
  assertEquals(Array.isArray(result), true);
  assertEquals(result.length, 3);
  assertEquals(typeof result[0], "string");
  assertEquals(typeof result[1], "number");
  assertEquals(typeof result[2], "boolean");
});

Deno.test("generateMockData: simple object", () => {
  const schema = enc.obj([
    { name: "id", type: enc.num(), optional: false },
    { name: "name", type: enc.str(), optional: false },
  ]);
  const result = generateMockData(schema, { seed: 12345 }) as Record<string, unknown>;

  assertEquals(typeof result.id, "number");
  assertEquals(typeof result.name, "string");
});

Deno.test("generateMockData: optional fields", () => {
  const schema = enc.obj([
    { name: "required", type: enc.str(), optional: false },
    { name: "optional", type: enc.str(), optional: true },
  ]);
  const result = generateMockData(schema, { seed: 12345, optionalProbability: 1.0 }) as Record<string, unknown>;

  assertEquals("required" in result, true);
  assertEquals("optional" in result, true);
});

Deno.test("generateMockData: union picks one alternative", () => {
  const schema = enc.union(enc.lit("a"), enc.lit("b"), enc.lit("c"));
  const result = generateMockData(schema, { seed: 12345 });
  assertEquals(["a", "b", "c"].includes(result as string), true);
});

Deno.test("generateMockData: discriminated union", () => {
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
  const result = generateMockData(schema, { seed: 12345 }) as Record<string, unknown>;

  assertEquals(["success", "error"].includes(result.type as string), true);
});

Deno.test("generateMockData: brand is transparent", () => {
  const schema = enc.brand(enc.str(), "UserId");
  const result = generateMockData(schema, { seed: 12345 });
  assertEquals(typeof result, "string");
});

Deno.test("generateMockData: readonly is transparent", () => {
  const schema = enc.ro(enc.str());
  const result = generateMockData(schema, { seed: 12345 });
  assertEquals(typeof result, "string");
});

Deno.test("generateMockData: refinement with constraints", () => {
  const schema = enc.refine.min(enc.refine.max(enc.num(), 100), 50);
  const result = generateMockData(schema, { seed: 12345 }) as number;

  assertEquals(result >= 50 && result <= 100, true);
});

Deno.test("generateMockData: email refinement", () => {
  const schema = enc.refine.email(enc.str());
  const result = generateMockData(schema, { seed: 12345 }) as string;

  assertEquals(result.includes("@"), true);
  assertEquals(result.includes(".com"), true);
});

Deno.test("generateMockData: url refinement", () => {
  const schema = enc.refine.url(enc.str());
  const result = generateMockData(schema, { seed: 12345 }) as string;

  assertEquals(result.startsWith("https://"), true);
});

Deno.test("generateMockData: minLength constraint", () => {
  const schema = enc.refine.minLength(enc.str(), 10);
  const result = generateMockData(schema, { seed: 12345 }) as string;

  assertEquals(result.length >= 10, true);
});

Deno.test("generateMockData: maxLength constraint", () => {
  const schema = enc.refine.maxLength(enc.str(), 5);
  const result = generateMockData(schema, { seed: 12345 }) as string;

  assertEquals(result.length <= 5, true);
});

Deno.test("generateMockData: deterministic with same seed", () => {
  const schema = enc.obj([
    { name: "name", type: enc.str(), optional: false },
    { name: "age", type: enc.num(), optional: false },
  ]);

  const result1 = generateMockData(schema, { seed: 12345 });
  const result2 = generateMockData(schema, { seed: 12345 });

  assertEquals(result1, result2);
});

Deno.test("generateMockData: validates against original schema", () => {
  const schema = enc.obj([
    { name: "id", type: enc.num(), optional: false },
    { name: "name", type: enc.str(), optional: false },
    { name: "email", type: enc.refine.email(enc.str()), optional: false },
    { name: "age", type: enc.refine.min(enc.refine.max(enc.num(), 120), 0), optional: true },
  ]);

  const mockData = generateMockData(schema, { seed: 12345, optionalProbability: 1.0 });

  // Should validate successfully
  const validated = validate(schema, mockData);
  assertEquals(typeof validated, "object");
});

Deno.test("generateMockData: complex nested object", () => {
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
    { name: "tags", type: enc.arr(enc.str()), optional: false },
  ]);

  const result = generateMockData(schema, { seed: 12345 }) as Record<string, unknown>;

  assertEquals(typeof result.id, "number");
  assertEquals(typeof result.profile, "object");
  assertEquals(Array.isArray(result.tags), true);

  const profile = result.profile as Record<string, unknown>;
  assertEquals(typeof profile.name, "string");
  assertEquals(typeof profile.email, "string");
  assertEquals((profile.email as string).includes("@"), true);
});

Deno.test("generateMockData: Result type", () => {
  const schema = enc.result.ok(enc.str());
  const result = generateMockData(schema, { seed: 12345 }) as Record<string, unknown>;

  assertEquals(result.ok, true);
  assertEquals(typeof result.value, "string");
});

Deno.test("generateMockData: Option type (Some)", () => {
  const schema = enc.option.some(enc.str());
  const result = generateMockData(schema, { seed: 12345 });

  // Could be string or null (50/50)
  assertEquals(typeof result === "string" || result === null, true);
});
