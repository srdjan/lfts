// packages/lfts-codegen/form-config_test.ts
// Tests for form config generator

import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import { enc } from "../lfts-type-spec/src/mod.ts";
import { generateFormConfig } from "./form-config.ts";

Deno.test("generateFormConfig: simple object", () => {
  const schema = enc.obj([
    { name: "name", type: enc.str(), optional: false },
    { name: "age", type: enc.num(), optional: false },
  ]);
  const result = generateFormConfig(schema);

  assertEquals(result.fields.length, 2);
  assertEquals(result.fields[0], {
    name: "name",
    label: "Name",
    type: "text",
    required: true,
  });
  assertEquals(result.fields[1], {
    name: "age",
    label: "Age",
    type: "number",
    required: true,
  });
});

Deno.test("generateFormConfig: optional fields", () => {
  const schema = enc.obj([
    { name: "name", type: enc.str(), optional: false },
    { name: "nickname", type: enc.str(), optional: true },
  ]);
  const result = generateFormConfig(schema);

  assertEquals(result.fields[0].required, true);
  assertEquals(result.fields[1].required, false);
});

Deno.test("generateFormConfig: with refinements", () => {
  const schema = enc.obj([
    {
      name: "email",
      type: enc.refine.email(enc.str()),
      optional: false,
    },
    {
      name: "website",
      type: enc.refine.url(enc.str()),
      optional: false,
    },
    {
      name: "age",
      type: enc.refine.min(enc.refine.max(enc.num(), 120), 0),
      optional: false,
    },
  ]);
  const result = generateFormConfig(schema);

  assertEquals(result.fields[0].type, "email");
  assertEquals(result.fields[0].validation, { email: true });

  assertEquals(result.fields[1].type, "url");
  assertEquals(result.fields[1].validation, { url: true });

  assertEquals(result.fields[2].type, "number");
  assertEquals(result.fields[2].validation, { min: 0, max: 120 });
});

Deno.test("generateFormConfig: with length constraints", () => {
  const schema = enc.obj([
    {
      name: "username",
      type: enc.refine.minLength(enc.refine.maxLength(enc.str(), 20), 3),
      optional: false,
    },
  ]);
  const result = generateFormConfig(schema);

  assertEquals(result.fields[0].validation, {
    minLength: 3,
    maxLength: 20,
  });
});

Deno.test("generateFormConfig: with pattern", () => {
  const schema = enc.obj([
    {
      name: "zipcode",
      type: enc.refine.pattern(enc.str(), "^\\d{5}$"),
      optional: false,
    },
  ]);
  const result = generateFormConfig(schema);

  assertEquals(result.fields[0].validation, {
    pattern: "^\\d{5}$",
  });
});

Deno.test("generateFormConfig: boolean as checkbox", () => {
  const schema = enc.obj([
    { name: "subscribe", type: enc.bool(), optional: false },
  ]);
  const result = generateFormConfig(schema);

  assertEquals(result.fields[0].type, "checkbox");
});

Deno.test("generateFormConfig: union of literals as select", () => {
  const schema = enc.obj([
    {
      name: "role",
      type: enc.union(enc.lit("admin"), enc.lit("user"), enc.lit("guest")),
      optional: false,
    },
  ]);
  const result = generateFormConfig(schema);

  assertEquals(result.fields[0].type, "select");
  assertEquals(result.fields[0].options, ["admin", "user", "guest"]);
});

Deno.test("generateFormConfig: discriminated union as select", () => {
  const schema = enc.obj([
    {
      name: "status",
      type: enc.dunion("type", [
        { tag: "active", schema: enc.obj([]) },
        { tag: "inactive", schema: enc.obj([]) },
      ]),
      optional: false,
    },
  ]);
  const result = generateFormConfig(schema);

  assertEquals(result.fields[0].type, "select");
  assertEquals(result.fields[0].options, ["active", "inactive"]);
});

Deno.test("generateFormConfig: array as textarea", () => {
  const schema = enc.obj([
    { name: "tags", type: enc.arr(enc.str()), optional: false },
  ]);
  const result = generateFormConfig(schema);

  assertEquals(result.fields[0].type, "textarea");
  assertEquals(result.fields[0].helpText, "Enter comma-separated values");
});

Deno.test("generateFormConfig: with title and description", () => {
  const schema = enc.obj([
    { name: "name", type: enc.str(), optional: false },
  ]);
  const result = generateFormConfig(schema, {
    title: "User Form",
    description: "Please fill in your details",
  });

  assertEquals(result.title, "User Form");
  assertEquals(result.description, "Please fill in your details");
});

Deno.test("generateFormConfig: with metadata", () => {
  const schema = enc.metadata(
    enc.obj([{ name: "name", type: enc.str(), optional: false }]),
    { name: "User", source: "types.ts" },
  );
  const result = generateFormConfig(schema);

  assertEquals(result.title, "User");
  assertEquals(result.description, "From: types.ts");
});

Deno.test("generateFormConfig: throws on non-object schema", () => {
  const schema = enc.str();
  assertThrows(
    () => generateFormConfig(schema),
    Error,
    "Form config can only be generated from object schemas",
  );
});

Deno.test("generateFormConfig: brand types are transparent", () => {
  const schema = enc.obj([
    { name: "id", type: enc.brand(enc.str(), "UserId"), optional: false },
  ]);
  const result = generateFormConfig(schema);

  assertEquals(result.fields[0].type, "text");
});

Deno.test("generateFormConfig: complex user form", () => {
  const schema = enc.obj([
    { name: "name", type: enc.str(), optional: false },
    {
      name: "email",
      type: enc.refine.email(enc.str()),
      optional: false,
    },
    {
      name: "age",
      type: enc.refine.min(enc.refine.max(enc.num(), 120), 18),
      optional: true,
    },
    {
      name: "role",
      type: enc.union(enc.lit("admin"), enc.lit("user")),
      optional: false,
    },
    { name: "subscribe", type: enc.bool(), optional: false },
  ]);

  const result = generateFormConfig(schema, {
    title: "User Registration",
  });

  assertEquals(result.title, "User Registration");
  assertEquals(result.fields.length, 5);

  assertEquals(result.fields[0].name, "name");
  assertEquals(result.fields[0].type, "text");
  assertEquals(result.fields[0].required, true);

  assertEquals(result.fields[1].name, "email");
  assertEquals(result.fields[1].type, "email");

  assertEquals(result.fields[2].name, "age");
  assertEquals(result.fields[2].type, "number");
  assertEquals(result.fields[2].required, false);
  assertEquals(result.fields[2].validation, { min: 18, max: 120 });

  assertEquals(result.fields[3].name, "role");
  assertEquals(result.fields[3].type, "select");
  assertEquals(result.fields[3].options, ["admin", "user"]);

  assertEquals(result.fields[4].name, "subscribe");
  assertEquals(result.fields[4].type, "checkbox");
});
