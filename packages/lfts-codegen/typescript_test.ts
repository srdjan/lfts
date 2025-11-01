// packages/lfts-codegen/typescript_test.ts
// Tests for TypeScript type generator

import { assertEquals } from "jsr:@std/assert@1";
import { enc } from "../lfts-type-spec/src/mod.ts";
import { generateTypeScript } from "./typescript.ts";

Deno.test("generateTypeScript: primitive string", () => {
  const schema = enc.str();
  const result = generateTypeScript("MyString", schema, { exportTypes: false });
  assertEquals(result, "type MyString = string;");
});

Deno.test("generateTypeScript: primitive number", () => {
  const schema = enc.num();
  const result = generateTypeScript("MyNumber", schema, { exportTypes: false });
  assertEquals(result, "type MyNumber = number;");
});

Deno.test("generateTypeScript: literal string", () => {
  const schema = enc.lit("hello");
  const result = generateTypeScript("Greeting", schema, { exportTypes: false });
  assertEquals(result, 'type Greeting = "hello";');
});

Deno.test("generateTypeScript: literal number", () => {
  const schema = enc.lit(42);
  const result = generateTypeScript("Answer", schema, { exportTypes: false });
  assertEquals(result, "type Answer = 42;");
});

Deno.test("generateTypeScript: array", () => {
  const schema = enc.arr(enc.str());
  const result = generateTypeScript("StringArray", schema, { exportTypes: false });
  assertEquals(result, "type StringArray = string[];");
});

Deno.test("generateTypeScript: tuple", () => {
  const schema = enc.tup(enc.str(), enc.num(), enc.bool());
  const result = generateTypeScript("MyTuple", schema, { exportTypes: false });
  assertEquals(result, "type MyTuple = [string, number, boolean];");
});

Deno.test("generateTypeScript: simple object", () => {
  const schema = enc.obj([
    { name: "id", type: enc.num(), optional: false },
    { name: "name", type: enc.str(), optional: false },
  ]);
  const result = generateTypeScript("User", schema, { exportTypes: false });
  assertEquals(result, `type User = {
  id: number;
  name: string;
};`);
});

Deno.test("generateTypeScript: object with optional properties", () => {
  const schema = enc.obj([
    { name: "id", type: enc.num(), optional: false },
    { name: "name", type: enc.str(), optional: true },
  ]);
  const result = generateTypeScript("User", schema, { exportTypes: false });
  assertEquals(result, `type User = {
  id: number;
  name?: string;
};`);
});

Deno.test("generateTypeScript: object with readonly option", () => {
  const schema = enc.obj([
    { name: "id", type: enc.num(), optional: false },
    { name: "name", type: enc.str(), optional: false },
  ]);
  const result = generateTypeScript("User", schema, { exportTypes: false, readonly: true });
  assertEquals(result, `type User = {
  readonly id: number;
  readonly name: string;
};`);
});

Deno.test("generateTypeScript: union type", () => {
  const schema = enc.union(enc.str(), enc.num());
  const result = generateTypeScript("StringOrNumber", schema, { exportTypes: false });
  assertEquals(result, "type StringOrNumber = string | number;");
});

Deno.test("generateTypeScript: discriminated union", () => {
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
  const result = generateTypeScript("Result", schema, { exportTypes: false });
  assertEquals(result, `type Result = {
  type: "success";
  value: string;
} | {
  type: "error";
  message: string;
};`);
});

Deno.test("generateTypeScript: brand type", () => {
  const schema = enc.brand(enc.str(), "UserId");
  const result = generateTypeScript("UserId", schema, { exportTypes: false });
  assertEquals(result, 'type UserId = string & { readonly __brand: "UserId" };');
});

Deno.test("generateTypeScript: readonly wrapper", () => {
  const schema = enc.ro(enc.obj([
    { name: "id", type: enc.num(), optional: false },
  ]));
  const result = generateTypeScript("User", schema, { exportTypes: false });
  assertEquals(result, `type User = Readonly<{
  id: number;
}>;`);
});

Deno.test("generateTypeScript: refinement (transparent)", () => {
  const schema = enc.refine.min(enc.refine.max(enc.num(), 100), 0);
  const result = generateTypeScript("Age", schema, { exportTypes: false });
  assertEquals(result, "type Age = number;");
});

Deno.test("generateTypeScript: exported type", () => {
  const schema = enc.str();
  const result = generateTypeScript("MyString", schema, { exportTypes: true });
  assertEquals(result, "export type MyString = string;");
});

Deno.test("generateTypeScript: nested object", () => {
  const schema = enc.obj([
    { name: "id", type: enc.num(), optional: false },
    {
      name: "profile",
      type: enc.obj([
        { name: "name", type: enc.str(), optional: false },
        { name: "email", type: enc.str(), optional: false },
      ]),
      optional: false,
    },
  ]);
  const result = generateTypeScript("User", schema, { exportTypes: false });
  assertEquals(result, `type User = {
  id: number;
  profile: {
    name: string;
    email: string;
  };
};`);
});

Deno.test("generateTypeScript: complex union with objects", () => {
  const schema = enc.union(
    enc.obj([{ name: "value", type: enc.str(), optional: false }]),
    enc.obj([{ name: "error", type: enc.str(), optional: false }]),
  );
  const result = generateTypeScript("Result", schema, { exportTypes: false });
  assertEquals(result, `type Result = {
  value: string;
} | {
  error: string;
};`);
});

Deno.test("generateTypeScript: port interface", () => {
  const schema = enc.port("StoragePort", [
    { name: "load", params: [enc.str()], returnType: enc.obj([]) },
    { name: "save", params: [enc.str(), enc.obj([])], returnType: enc.obj([]) },
  ]);
  const result = generateTypeScript("StoragePort", schema, { exportTypes: false });
  assertEquals(result, `type StoragePort = {
  load(arg0: string): {};
  save(arg0: string, arg1: {}): {};
};`);
});

Deno.test("generateTypeScript: option type", () => {
  const schema = enc.option.some(enc.str());
  const result = generateTypeScript("MaybeString", schema, { exportTypes: false });
  assertEquals(result, "type MaybeString = string | null;");
});

Deno.test("generateTypeScript: complex user schema", () => {
  const UserIdSchema = enc.brand(enc.str(), "UserId");
  const EmailSchema = enc.refine.email(enc.str());

  const UserSchema = enc.obj([
    { name: "id", type: UserIdSchema, optional: false },
    { name: "name", type: enc.str(), optional: false },
    { name: "email", type: EmailSchema, optional: false },
    { name: "age", type: enc.num(), optional: true },
    { name: "tags", type: enc.arr(enc.str()), optional: false },
  ]);

  const result = generateTypeScript("User", UserSchema, { exportTypes: true });
  assertEquals(result, `export type User = {
  id: string & { readonly __brand: "UserId" };
  name: string;
  email: string;
  age?: number;
  tags: string[];
};`);
});
