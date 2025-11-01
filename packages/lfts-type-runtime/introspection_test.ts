// packages/lfts-type-runtime/introspection_test.ts
// Comprehensive tests for the introspection API

import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import { enc } from "../lfts-type-spec/src/mod.ts";
import {
  getKind,
  getProperties,
  getRefinements,
  getVariants,
  hashSchema,
  introspect,
  schemasEqual,
  traverse,
  unwrapAll,
  unwrapBrand,
  unwrapReadonly,
} from "./introspection.ts";

// ============================================================================
// Primitive Types
// ============================================================================

Deno.test("introspect: string primitive", () => {
  const schema = enc.str();
  const info = introspect(schema);
  assertEquals(info, { kind: "primitive", type: "string" });
});

Deno.test("introspect: number primitive", () => {
  const schema = enc.num();
  const info = introspect(schema);
  assertEquals(info, { kind: "primitive", type: "number" });
});

Deno.test("introspect: boolean primitive", () => {
  const schema = enc.bool();
  const info = introspect(schema);
  assertEquals(info, { kind: "primitive", type: "boolean" });
});

Deno.test("introspect: null primitive", () => {
  const schema = enc.nul();
  const info = introspect(schema);
  assertEquals(info, { kind: "primitive", type: "null" });
});

Deno.test("introspect: undefined primitive", () => {
  const schema = enc.und();
  const info = introspect(schema);
  assertEquals(info, { kind: "primitive", type: "undefined" });
});

// ============================================================================
// Literal Types
// ============================================================================

Deno.test("introspect: string literal", () => {
  const schema = enc.lit("hello");
  const info = introspect(schema);
  assertEquals(info, { kind: "literal", value: "hello" });
});

Deno.test("introspect: number literal", () => {
  const schema = enc.lit(42);
  const info = introspect(schema);
  assertEquals(info, { kind: "literal", value: 42 });
});

Deno.test("introspect: boolean literal", () => {
  const schema = enc.lit(true);
  const info = introspect(schema);
  assertEquals(info, { kind: "literal", value: true });
});

// ============================================================================
// Composite Types
// ============================================================================

Deno.test("introspect: array type", () => {
  const schema = enc.arr(enc.str());
  const info = introspect(schema);
  assertEquals(info.kind, "array");
  if (info.kind === "array") {
    assertEquals(info.element, enc.str());
  }
});

Deno.test("introspect: tuple type", () => {
  const schema = enc.tup(enc.str(), enc.num(), enc.bool());
  const info = introspect(schema);
  assertEquals(info.kind, "tuple");
  if (info.kind === "tuple") {
    assertEquals(info.elements.length, 3);
    assertEquals(info.elements[0], enc.str());
    assertEquals(info.elements[1], enc.num());
    assertEquals(info.elements[2], enc.bool());
  }
});

Deno.test("introspect: object type with properties", () => {
  const schema = enc.obj([
    { name: "name", type: enc.str(), optional: false },
    { name: "age", type: enc.num(), optional: true },
  ]);
  const info = introspect(schema);
  assertEquals(info.kind, "object");
  if (info.kind === "object") {
    assertEquals(info.properties.length, 2);
    assertEquals(info.properties[0].name, "name");
    assertEquals(info.properties[0].optional, false);
    assertEquals(info.properties[1].name, "age");
    assertEquals(info.properties[1].optional, true);
    assertEquals(info.strict, false);
  }
});

Deno.test("introspect: strict object type", () => {
  const schema = enc.obj([
    { name: "id", type: enc.num(), optional: false },
  ], true);
  const info = introspect(schema);
  assertEquals(info.kind, "object");
  if (info.kind === "object") {
    assertEquals(info.strict, true);
  }
});

Deno.test("introspect: union type", () => {
  const schema = enc.union(enc.str(), enc.num(), enc.bool());
  const info = introspect(schema);
  assertEquals(info.kind, "union");
  if (info.kind === "union") {
    assertEquals(info.alternatives.length, 3);
    assertEquals(info.alternatives[0], enc.str());
    assertEquals(info.alternatives[1], enc.num());
    assertEquals(info.alternatives[2], enc.bool());
  }
});

Deno.test("introspect: discriminated union", () => {
  const schema = enc.dunion("type", [
    { tag: "success", schema: enc.obj([{ name: "value", type: enc.str(), optional: false }]) },
    { tag: "error", schema: enc.obj([{ name: "message", type: enc.str(), optional: false }]) },
  ]);
  const info = introspect(schema);
  assertEquals(info.kind, "dunion");
  if (info.kind === "dunion") {
    assertEquals(info.discriminant, "type");
    assertEquals(info.variants.length, 2);
    assertEquals(info.variants[0].tag, "success");
    assertEquals(info.variants[1].tag, "error");
  }
});

// ============================================================================
// Wrapper Types
// ============================================================================

Deno.test("introspect: readonly wrapper", () => {
  const schema = enc.ro(enc.str());
  const info = introspect(schema);
  assertEquals(info.kind, "readonly");
  if (info.kind === "readonly") {
    assertEquals(info.inner, enc.str());
  }
});

Deno.test("introspect: brand wrapper", () => {
  const schema = enc.brand(enc.str(), "UserId");
  const info = introspect(schema);
  assertEquals(info.kind, "brand");
  if (info.kind === "brand") {
    assertEquals(info.tag, "UserId");
    assertEquals(info.inner, enc.str());
  }
});

// ============================================================================
// Refinements
// ============================================================================

Deno.test("introspect: single refinement (min)", () => {
  const schema = enc.refine.min(enc.num(), 0);
  const info = introspect(schema);
  assertEquals(info.kind, "refinement");
  if (info.kind === "refinement") {
    assertEquals(info.refinements.length, 1);
    assertEquals(info.refinements[0], { kind: "min", value: 0 });
    assertEquals(info.inner, enc.num());
  }
});

Deno.test("introspect: multiple refinements", () => {
  const schema = enc.refine.min(enc.refine.max(enc.num(), 100), 0);
  const info = introspect(schema);
  assertEquals(info.kind, "refinement");
  if (info.kind === "refinement") {
    assertEquals(info.refinements.length, 2);
    assertEquals(info.refinements[0], { kind: "min", value: 0 });
    assertEquals(info.refinements[1], { kind: "max", value: 100 });
    assertEquals(info.inner, enc.num());
  }
});

Deno.test("introspect: string refinements", () => {
  const schema = enc.refine.minLength(
    enc.refine.maxLength(enc.refine.email(enc.str()), 100),
    3,
  );
  const info = introspect(schema);
  assertEquals(info.kind, "refinement");
  if (info.kind === "refinement") {
    assertEquals(info.refinements.length, 3);
    assertEquals(info.refinements[0], { kind: "minLength", value: 3 });
    assertEquals(info.refinements[1], { kind: "maxLength", value: 100 });
    assertEquals(info.refinements[2], { kind: "email" });
    assertEquals(info.inner, enc.str());
  }
});

Deno.test("introspect: pattern refinement", () => {
  const schema = enc.refine.pattern(enc.str(), "^[A-Z]+$");
  const info = introspect(schema);
  assertEquals(info.kind, "refinement");
  if (info.kind === "refinement") {
    assertEquals(info.refinements.length, 1);
    assertEquals(info.refinements[0], { kind: "pattern", pattern: "^[A-Z]+$" });
  }
});

// ============================================================================
// Result and Option Types
// ============================================================================

Deno.test("introspect: Result.ok", () => {
  const schema = enc.result.ok(enc.str());
  const info = introspect(schema);
  assertEquals(info.kind, "result");
  if (info.kind === "result") {
    assertEquals(info.valueType, enc.str());
    assertEquals(info.errorType, null);
  }
});

Deno.test("introspect: Result.err", () => {
  const schema = enc.result.err(enc.str());
  const info = introspect(schema);
  assertEquals(info.kind, "result");
  if (info.kind === "result") {
    assertEquals(info.errorType, enc.str());
  }
});

Deno.test("introspect: Option.some", () => {
  const schema = enc.option.some(enc.num());
  const info = introspect(schema);
  assertEquals(info.kind, "option");
  if (info.kind === "option") {
    assertEquals(info.valueType, enc.num());
  }
});

Deno.test("introspect: Option.none", () => {
  const schema = enc.option.none();
  const info = introspect(schema);
  assertEquals(info.kind, "option");
  if (info.kind === "option") {
    assertEquals(info.valueType, null);
  }
});

// ============================================================================
// Metadata
// ============================================================================

Deno.test("introspect: metadata wrapper", () => {
  const schema = enc.metadata(enc.str(), { name: "UserName", source: "types.ts" });
  const info = introspect(schema);
  assertEquals(info.kind, "metadata");
  if (info.kind === "metadata") {
    assertEquals(info.metadata.name, "UserName");
    assertEquals(info.metadata.source, "types.ts");
    assertEquals(info.inner, enc.str());
  }
});

// ============================================================================
// Port Types
// ============================================================================

Deno.test("introspect: port with methods", () => {
  const schema = enc.port("StoragePort", [
    { name: "load", params: [enc.str()], returnType: enc.obj([]) },
    { name: "save", params: [enc.str(), enc.obj([])], returnType: enc.und() },
  ]);
  const info = introspect(schema);
  assertEquals(info.kind, "port");
  if (info.kind === "port") {
    assertEquals(info.portName, "StoragePort");
    assertEquals(info.methods.length, 2);
    assertEquals(info.methods[0].name, "load");
    assertEquals(info.methods[0].params.length, 1);
    assertEquals(info.methods[1].name, "save");
    assertEquals(info.methods[1].params.length, 2);
  }
});

// ============================================================================
// Effect Types
// ============================================================================

Deno.test("introspect: effect type", () => {
  const schema = enc.effect("IO", enc.str());
  const info = introspect(schema);
  assertEquals(info.kind, "effect");
  if (info.kind === "effect") {
    assertEquals(info.effectType, "IO");
    assertEquals(info.returnType, enc.str());
  }
});

// ============================================================================
// Convenience Helpers
// ============================================================================

Deno.test("getKind: returns correct kind for each type", () => {
  assertEquals(getKind(enc.str()), "primitive");
  assertEquals(getKind(enc.lit("hello")), "literal");
  assertEquals(getKind(enc.arr(enc.str())), "array");
  assertEquals(getKind(enc.tup(enc.str())), "tuple");
  assertEquals(getKind(enc.obj([])), "object");
  assertEquals(getKind(enc.union(enc.str(), enc.num())), "union");
  assertEquals(getKind(enc.dunion("type", [])), "dunion");
  assertEquals(getKind(enc.brand(enc.str(), "ID")), "brand");
  assertEquals(getKind(enc.ro(enc.str())), "readonly");
  assertEquals(getKind(enc.refine.min(enc.num(), 0)), "refinement");
});

Deno.test("getProperties: extracts object properties", () => {
  const schema = enc.obj([
    { name: "id", type: enc.num(), optional: false },
    { name: "name", type: enc.str(), optional: false },
  ]);
  const props = getProperties(schema);
  assertEquals(props.length, 2);
  assertEquals(props[0].name, "id");
  assertEquals(props[1].name, "name");
});

Deno.test("getProperties: returns empty for non-objects", () => {
  const props = getProperties(enc.str());
  assertEquals(props, []);
});

Deno.test("getVariants: extracts DUNION variants", () => {
  const schema = enc.dunion("type", [
    { tag: "a", schema: enc.obj([]) },
    { tag: "b", schema: enc.obj([]) },
  ]);
  const variants = getVariants(schema);
  assertEquals(variants.length, 2);
  assertEquals(variants[0].tag, "a");
  assertEquals(variants[1].tag, "b");
});

Deno.test("getVariants: returns empty for non-dunion", () => {
  const variants = getVariants(enc.str());
  assertEquals(variants, []);
});

Deno.test("getRefinements: extracts refinement constraints", () => {
  const schema = enc.refine.min(enc.refine.max(enc.num(), 100), 0);
  const refinements = getRefinements(schema);
  assertEquals(refinements.length, 2);
  assertEquals(refinements[0], { kind: "min", value: 0 });
  assertEquals(refinements[1], { kind: "max", value: 100 });
});

Deno.test("getRefinements: returns empty for non-refinement", () => {
  const refinements = getRefinements(enc.str());
  assertEquals(refinements, []);
});

Deno.test("unwrapBrand: unwraps brand wrapper", () => {
  const schema = enc.brand(enc.str(), "UserId");
  const inner = unwrapBrand(schema);
  assertEquals(inner, enc.str());
});

Deno.test("unwrapBrand: returns unchanged for non-brand", () => {
  const schema = enc.str();
  const result = unwrapBrand(schema);
  assertEquals(result, schema);
});

Deno.test("unwrapReadonly: unwraps readonly wrapper", () => {
  const schema = enc.ro(enc.str());
  const inner = unwrapReadonly(schema);
  assertEquals(inner, enc.str());
});

Deno.test("unwrapReadonly: returns unchanged for non-readonly", () => {
  const schema = enc.str();
  const result = unwrapReadonly(schema);
  assertEquals(result, schema);
});

Deno.test("unwrapAll: unwraps all nested wrappers", () => {
  const schema = enc.ro(
    enc.brand(
      enc.refine.min(enc.refine.max(enc.num(), 100), 0),
      "Age",
    ),
  );
  const base = unwrapAll(schema);
  assertEquals(base, enc.num());
});

Deno.test("unwrapAll: with metadata wrapper", () => {
  const schema = enc.metadata(
    enc.ro(enc.brand(enc.str(), "ID")),
    { name: "ID" },
  );
  const base = unwrapAll(schema);
  assertEquals(base, enc.str());
});

// ============================================================================
// Traversal
// ============================================================================

Deno.test("traverse: visits all schema types", () => {
  const visited: string[] = [];

  const visitor = {
    primitive: (type: string) => {
      visited.push(`primitive:${type}`);
      return null;
    },
    literal: (value: string | number | boolean) => {
      visited.push(`literal:${value}`);
      return null;
    },
    object: () => {
      visited.push("object");
      return null;
    },
  };

  // Visit primitive
  traverse(enc.str(), visitor);
  assertEquals(visited, ["primitive:string"]);

  // Visit literal
  visited.length = 0;
  traverse(enc.lit(42), visitor);
  assertEquals(visited, ["literal:42"]);

  // Visit object
  visited.length = 0;
  traverse(enc.obj([]), visitor);
  assertEquals(visited, ["object"]);
});

Deno.test("traverse: throws if visitor method missing", () => {
  assertThrows(
    () => traverse(enc.str(), {}),
    Error,
    "Visitor must define 'primitive' method",
  );
});

// ============================================================================
// Schema Identity
// ============================================================================

Deno.test("hashSchema: produces stable hashes", () => {
  const schema1 = enc.obj([
    { name: "id", type: enc.num(), optional: false },
    { name: "name", type: enc.str(), optional: false },
  ]);
  const schema2 = enc.obj([
    { name: "id", type: enc.num(), optional: false },
    { name: "name", type: enc.str(), optional: false },
  ]);

  const hash1 = hashSchema(schema1);
  const hash2 = hashSchema(schema2);
  assertEquals(hash1, hash2);
});

Deno.test("hashSchema: different schemas produce different hashes", () => {
  const hash1 = hashSchema(enc.str());
  const hash2 = hashSchema(enc.num());
  assertEquals(hash1 !== hash2, true);
});

Deno.test("schemasEqual: compares schemas structurally", () => {
  const schema1 = enc.obj([
    { name: "id", type: enc.num(), optional: false },
  ]);
  const schema2 = enc.obj([
    { name: "id", type: enc.num(), optional: false },
  ]);

  assertEquals(schemasEqual(schema1, schema2), true);
});

Deno.test("schemasEqual: detects differences", () => {
  const schema1 = enc.str();
  const schema2 = enc.num();
  assertEquals(schemasEqual(schema1, schema2), false);
});

// ============================================================================
// Error Cases
// ============================================================================

Deno.test("introspect: throws on invalid bytecode", () => {
  assertThrows(
    () => introspect("not bytecode" as any),
    Error,
    "Expected bytecode array",
  );
});

Deno.test("introspect: throws on empty array", () => {
  assertThrows(
    () => introspect([] as any),
    Error,
    "Invalid bytecode: empty array",
  );
});

Deno.test("introspect: throws on unknown opcode", () => {
  assertThrows(
    () => introspect([999] as any),
    Error,
    "Unsupported opcode for introspection",
  );
});

// ============================================================================
// Complex Real-World Examples
// ============================================================================

Deno.test("introspect: complex nested user schema", () => {
  // Simulates: type User = Readonly<{ id: UserId; profile: UserProfile }>
  const UserIdSchema = enc.brand(enc.str(), "UserId");
  const UserProfileSchema = enc.obj([
    { name: "name", type: enc.str(), optional: false },
    { name: "email", type: enc.refine.email(enc.str()), optional: false },
    { name: "age", type: enc.refine.min(enc.refine.max(enc.num(), 120), 0), optional: true },
  ]);
  const UserSchema = enc.ro(enc.obj([
    { name: "id", type: UserIdSchema, optional: false },
    { name: "profile", type: UserProfileSchema, optional: false },
  ]));

  const info = introspect(UserSchema);
  assertEquals(info.kind, "readonly");

  if (info.kind === "readonly") {
    const objInfo = introspect(info.inner);
    assertEquals(objInfo.kind, "object");

    if (objInfo.kind === "object") {
      assertEquals(objInfo.properties.length, 2);
      assertEquals(objInfo.properties[0].name, "id");
      assertEquals(objInfo.properties[1].name, "profile");

      // Inspect UserId brand
      const idInfo = introspect(objInfo.properties[0].type);
      assertEquals(idInfo.kind, "brand");
      if (idInfo.kind === "brand") {
        assertEquals(idInfo.tag, "UserId");
        assertEquals(idInfo.inner, enc.str());
      }

      // Inspect UserProfile
      const profileInfo = introspect(objInfo.properties[1].type);
      assertEquals(profileInfo.kind, "object");
      if (profileInfo.kind === "object") {
        assertEquals(profileInfo.properties.length, 3);

        // Check email refinement
        const emailInfo = introspect(profileInfo.properties[1].type);
        assertEquals(emailInfo.kind, "refinement");
        if (emailInfo.kind === "refinement") {
          assertEquals(emailInfo.refinements.length, 1);
          assertEquals(emailInfo.refinements[0], { kind: "email" });
        }

        // Check age refinements
        const ageInfo = introspect(profileInfo.properties[2].type);
        assertEquals(ageInfo.kind, "refinement");
        if (ageInfo.kind === "refinement") {
          assertEquals(ageInfo.refinements.length, 2);
          assertEquals(ageInfo.refinements[0], { kind: "min", value: 0 });
          assertEquals(ageInfo.refinements[1], { kind: "max", value: 120 });
        }
      }
    }
  }
});

Deno.test("introspect: complex ADT with discriminated union", () => {
  // Simulates: type Result<T, E> = { type: "ok"; value: T } | { type: "err"; error: E }
  const ResultSchema = enc.dunion("type", [
    {
      tag: "ok",
      schema: enc.obj([
        { name: "type", type: enc.lit("ok"), optional: false },
        { name: "value", type: enc.str(), optional: false },
      ]),
    },
    {
      tag: "err",
      schema: enc.obj([
        { name: "type", type: enc.lit("err"), optional: false },
        { name: "error", type: enc.str(), optional: false },
      ]),
    },
  ]);

  const info = introspect(ResultSchema);
  assertEquals(info.kind, "dunion");

  if (info.kind === "dunion") {
    assertEquals(info.discriminant, "type");
    assertEquals(info.variants.length, 2);
    assertEquals(info.variants[0].tag, "ok");
    assertEquals(info.variants[1].tag, "err");

    // Inspect ok variant
    const okInfo = introspect(info.variants[0].schema);
    assertEquals(okInfo.kind, "object");
    if (okInfo.kind === "object") {
      assertEquals(okInfo.properties.length, 2);
      assertEquals(okInfo.properties[0].name, "type");
      assertEquals(okInfo.properties[1].name, "value");
    }
  }
});
