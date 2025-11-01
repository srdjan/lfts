# LFTS Introspection API

The LFTS Introspection API provides read-only access to schema structure at runtime, enabling dynamic code generation, debugging tools, and runtime analysis without impacting validation performance.

**Version**: v0.6.0
**Status**: Stable

## Table of Contents

- [Overview](#overview)
- [Core API](#core-api)
- [Convenience Helpers](#convenience-helpers)
- [Schema Traversal](#schema-traversal)
- [Schema Identity](#schema-identity)
- [Use Cases](#use-cases)
- [Performance](#performance)
- [Examples](#examples)

## Overview

The introspection API allows you to examine the structure of LFTS bytecode schemas at runtime:

```typescript
import { introspect, getProperties } from "lfts-type-runtime";

// Examine schema structure
const info = introspect(User$);
if (info.kind === "object") {
  console.log(`User has ${info.properties.length} properties`);
  for (const prop of info.properties) {
    console.log(`  - ${prop.name}: ${prop.optional ? "optional" : "required"}`);
  }
}

// Or use convenience helpers
const properties = getProperties(User$);
```

### Design Philosophy

- **Read-only**: Schemas are immutable; introspection never modifies them
- **Zero validation cost**: Introspection is separate from the validation hot path
- **Tree-shakeable**: Import only the functions you need
- **Type-safe**: Full TypeScript support with discriminated unions

## Core API

### `introspect(schema: TypeObject): SchemaInfo`

Primary entry point for examining schema structure. Returns a discriminated union describing the schema kind and its metadata.

**Returns**: `SchemaInfo` - Discriminated union with these variants:

| Kind | Description | Fields |
|------|-------------|--------|
| `primitive` | Basic types (string, number, boolean, null, undefined) | `type` |
| `literal` | Literal values | `value` |
| `array` | Array types | `element` |
| `tuple` | Fixed-length tuples | `elements` |
| `object` | Object types with properties | `properties`, `strict` |
| `union` | Type unions | `alternatives` |
| `dunion` | Discriminated unions (ADTs) | `discriminant`, `variants` |
| `brand` | Branded types | `tag`, `inner` |
| `readonly` | Readonly wrappers | `inner` |
| `refinement` | Runtime constraints | `refinements`, `inner` |
| `result` | Result types | `valueType`, `errorType` |
| `option` | Option types | `valueType` |
| `metadata` | Schema metadata | `metadata`, `inner` |
| `port` | Port interfaces | `portName`, `methods` |
| `effect` | Effect types | `effectType`, `returnType` |

**Example**:

```typescript
const info = introspect(User$);

switch (info.kind) {
  case "object":
    console.log(`Object with ${info.properties.length} properties`);
    console.log(`Strict mode: ${info.strict}`);
    break;
  case "dunion":
    console.log(`ADT with discriminant '${info.discriminant}'`);
    console.log(`Variants: ${info.variants.map(v => v.tag).join(", ")}`);
    break;
  case "refinement":
    console.log(`Refinements: ${info.refinements.map(r => r.kind).join(", ")}`);
    break;
}
```

### Type Definitions

```typescript
export type PropertyInfo = {
  readonly name: string;
  readonly type: TypeObject;
  readonly optional: boolean;
};

export type VariantInfo = {
  readonly tag: string;
  readonly schema: TypeObject;
};

export type RefinementInfo =
  | { readonly kind: "min"; readonly value: number }
  | { readonly kind: "max"; readonly value: number }
  | { readonly kind: "integer" }
  | { readonly kind: "minLength"; readonly value: number }
  | { readonly kind: "maxLength"; readonly value: number }
  | { readonly kind: "minItems"; readonly value: number }
  | { readonly kind: "maxItems"; readonly value: number }
  | { readonly kind: "email" }
  | { readonly kind: "url" }
  | { readonly kind: "pattern"; readonly pattern: string };
```

## Convenience Helpers

Quick access functions for common introspection tasks.

### `getKind(schema: TypeObject): SchemaInfo["kind"]`

Get the schema kind without full introspection.

```typescript
const kind = getKind(User$); // "object"
```

### `getProperties(schema: TypeObject): readonly PropertyInfo[]`

Extract properties from an OBJECT schema. Returns empty array if not an object.

```typescript
const properties = getProperties(User$);
for (const prop of properties) {
  console.log(`${prop.name}: ${prop.optional ? "?" : ""}`);
}
```

### `getVariants(schema: TypeObject): readonly VariantInfo[]`

Extract variants from a DUNION schema. Returns empty array if not a discriminated union.

```typescript
const variants = getVariants(Action$);
for (const variant of variants) {
  console.log(`- ${variant.tag}`);
}
```

### `getRefinements(schema: TypeObject): readonly RefinementInfo[]`

Extract refinements from a schema. Returns empty array if no refinements.

```typescript
const refinements = getRefinements(Age$);
console.log(`Constraints: ${refinements.map(r => `${r.kind}=${r.value}`).join(", ")}`);
```

### `unwrapBrand(schema: TypeObject): TypeObject`

Unwrap a BRAND wrapper to get the inner schema.

```typescript
const inner = unwrapBrand(UserId$); // Returns string schema
```

### `unwrapReadonly(schema: TypeObject): TypeObject`

Unwrap a READONLY wrapper to get the inner schema.

```typescript
const inner = unwrapReadonly(ReadonlyUser$); // Returns User schema
```

### `unwrapAll(schema: TypeObject): TypeObject`

Recursively unwrap all wrappers (BRAND, READONLY, REFINEMENT, METADATA) to get the base schema.

```typescript
// Given: Readonly<UserId> where UserId = string & { __brand: "UserId" } & Min<0>
const base = unwrapAll(complexSchema); // Returns: string schema
```

## Schema Traversal

Generic tree walking with visitor pattern.

### `traverse<R>(schema: TypeObject, visitor: SchemaVisitor<R>): R`

Traverse a schema tree and invoke visitor methods based on schema kind.

**Example: Count all object properties**:

```typescript
let propertyCount = 0;

traverse(schema, {
  object: (properties, strict) => {
    propertyCount += properties.length;
    // Recursively traverse property types
    properties.forEach(prop => traverse(prop.type, visitor));
    return null;
  },
  // Define other visitors as needed
  primitive: () => null,
  array: (element) => {
    traverse(element, visitor);
    return null;
  },
});

console.log(`Total properties: ${propertyCount}`);
```

**Example: Generate TypeScript type definition**:

```typescript
function generateTypeScript(schema: TypeObject): string {
  return traverse(schema, {
    primitive: (type) => type,
    literal: (value) => JSON.stringify(value),
    object: (properties) => {
      const props = properties.map(p =>
        `${p.name}${p.optional ? "?" : ""}: ${generateTypeScript(p.type)}`
      ).join("; ");
      return `{ ${props} }`;
    },
    array: (element) => `Array<${generateTypeScript(element)}>`,
    union: (alternatives) => alternatives.map(generateTypeScript).join(" | "),
    // ... other visitors
  });
}
```

## Schema Identity

Functions for comparing and hashing schemas.

### `hashSchema(schema: TypeObject): string`

Compute a stable hash of schema structure. Schemas with identical structure produce identical hashes.

**Note**: This is NOT a cryptographic hash. Designed for cache keys and identity comparison.

```typescript
const hash1 = hashSchema(User$);
const hash2 = hashSchema(User$);
assert(hash1 === hash2);

// Use as cache key
const schemaCache = new Map<string, GeneratedCode>();
const hash = hashSchema(schema);
if (schemaCache.has(hash)) {
  return schemaCache.get(hash);
}
```

### `schemasEqual(schemaA: TypeObject, schemaB: TypeObject): boolean`

Deep structural comparison of two schemas.

```typescript
if (schemasEqual(actualSchema, expectedSchema)) {
  console.log("Schemas match!");
}
```

## Use Cases

### 1. JSON Schema Generation

Generate JSON Schema for OpenAPI documentation:

```typescript
function toJsonSchema(schema: TypeObject): object {
  const info = introspect(schema);

  switch (info.kind) {
    case "primitive":
      return { type: info.type === "null" ? "null" : info.type };
    case "object":
      return {
        type: "object",
        properties: Object.fromEntries(
          info.properties.map(p => [p.name, toJsonSchema(p.type)])
        ),
        required: info.properties
          .filter(p => !p.optional)
          .map(p => p.name),
        additionalProperties: !info.strict,
      };
    case "array":
      return {
        type: "array",
        items: toJsonSchema(info.element),
      };
    case "union":
      return {
        oneOf: info.alternatives.map(toJsonSchema),
      };
    // ... handle other cases
  }
}
```

### 2. TypeScript Type Generation

Generate TypeScript type definitions from schemas:

```typescript
function generateType(name: string, schema: TypeObject): string {
  const info = introspect(schema);

  if (info.kind === "object") {
    const props = info.properties.map(p => {
      const optional = p.optional ? "?" : "";
      const propType = generateType("", p.type);
      return `  ${p.name}${optional}: ${propType};`;
    }).join("\n");
    return `export type ${name} = {\n${props}\n};`;
  }

  if (info.kind === "dunion") {
    const variants = info.variants.map(v => {
      const variantType = generateType("", v.schema);
      return `  | ${variantType}`;
    }).join("\n");
    return `export type ${name} =\n${variants};`;
  }

  // ... handle other cases
}
```

### 3. Form Configuration Generation

Generate form schemas for UI frameworks:

```typescript
function generateFormConfig(schema: TypeObject): FormConfig {
  const properties = getProperties(schema);

  return {
    fields: properties.map(prop => {
      const refinements = getRefinements(prop.type);
      const base = unwrapAll(prop.type);
      const baseKind = getKind(base);

      return {
        name: prop.name,
        required: !prop.optional,
        type: mapToFormFieldType(baseKind),
        validation: refinements.map(r => ({
          rule: r.kind,
          value: "value" in r ? r.value : undefined,
        })),
      };
    }),
  };
}
```

### 4. Mock Data Generation

Generate test fixtures from schemas:

```typescript
function generateMock(schema: TypeObject): unknown {
  const info = introspect(schema);

  switch (info.kind) {
    case "primitive":
      return generatePrimitiveMock(info.type);
    case "object":
      return Object.fromEntries(
        info.properties
          .filter(p => !p.optional || Math.random() > 0.5)
          .map(p => [p.name, generateMock(p.type)])
      );
    case "array":
      return Array.from({ length: 3 }, () => generateMock(info.element));
    case "dunion":
      const variant = info.variants[0];
      return generateMock(variant.schema);
    // ... handle other cases
  }
}
```

### 5. Schema Documentation

Generate human-readable documentation:

```typescript
function documentSchema(name: string, schema: TypeObject): string {
  const info = introspect(schema);
  let doc = `## ${name}\n\n`;

  if (info.kind === "object") {
    doc += "**Properties:**\n\n";
    for (const prop of info.properties) {
      const optional = prop.optional ? " (optional)" : " (required)";
      doc += `- \`${prop.name}\`${optional}\n`;

      const refinements = getRefinements(prop.type);
      if (refinements.length > 0) {
        doc += `  - Constraints: ${refinements.map(r => r.kind).join(", ")}\n`;
      }
    }
  }

  return doc;
}
```

## Performance

The introspection API is designed for **zero impact on validation performance**:

- **Separate from hot path**: Validation never calls introspection functions
- **Opt-in**: Only imported when needed; tree-shakeable
- **No caching overhead**: WeakMap caches used by validation are separate
- **Lazy evaluation**: Introspection happens only when you call it

**Benchmarks** (relative to validation):

| Operation | Cost | Notes |
|-----------|------|-------|
| Validation (baseline) | 1.0x | 8-16M ops/sec for ADTs |
| `introspect()` | < 0.1% | One-time parse of bytecode |
| `getKind()` | < 0.01% | Just reads first opcode |
| `traverse()` | Variable | Depends on visitor implementation |

**Bundle size impact**: +5-10KB when imported

## Examples

### Complete Example: Generate OpenAPI Schema

```typescript
import { introspect, getProperties, unwrapAll } from "lfts-type-runtime";

function toOpenAPISchema(schema: TypeObject, name?: string): object {
  const info = introspect(schema);

  switch (info.kind) {
    case "metadata":
      // Use metadata name if available
      return toOpenAPISchema(info.inner, info.metadata.name);

    case "primitive":
      const typeMap = {
        string: "string",
        number: "number",
        boolean: "boolean",
        null: "null",
      };
      return { type: typeMap[info.type] };

    case "literal":
      return { enum: [info.value] };

    case "object":
      return {
        type: "object",
        properties: Object.fromEntries(
          info.properties.map(p => [
            p.name,
            toOpenAPISchema(p.type),
          ])
        ),
        required: info.properties
          .filter(p => !p.optional)
          .map(p => p.name),
        additionalProperties: !info.strict,
      };

    case "array":
      return {
        type: "array",
        items: toOpenAPISchema(info.element),
      };

    case "dunion":
      return {
        discriminator: { propertyName: info.discriminant },
        oneOf: info.variants.map(v => ({
          title: v.tag,
          ...toOpenAPISchema(v.schema),
        })),
      };

    case "refinement":
      const baseSchema = toOpenAPISchema(info.inner);
      // Apply refinement constraints
      for (const r of info.refinements) {
        switch (r.kind) {
          case "min":
            baseSchema.minimum = r.value;
            break;
          case "max":
            baseSchema.maximum = r.value;
            break;
          case "minLength":
            baseSchema.minLength = r.value;
            break;
          case "maxLength":
            baseSchema.maxLength = r.value;
            break;
          case "pattern":
            baseSchema.pattern = r.pattern;
            break;
          case "email":
            baseSchema.format = "email";
            break;
          case "url":
            baseSchema.format = "uri";
            break;
        }
      }
      return baseSchema;

    case "brand":
    case "readonly":
      // Transparent wrappers in OpenAPI
      return toOpenAPISchema(info.inner);

    case "union":
      return {
        oneOf: info.alternatives.map(alt => toOpenAPISchema(alt)),
      };

    default:
      return { type: "object" };
  }
}

// Usage
const openApiSchema = toOpenAPISchema(User$);
console.log(JSON.stringify(openApiSchema, null, 2));
```

### Complete Example: Schema Diff Tool

```typescript
import { introspect, schemasEqual } from "lfts-type-runtime";

type SchemaDiff =
  | { kind: "identical" }
  | { kind: "different"; path: string; reason: string };

function diffSchemas(
  schemaA: TypeObject,
  schemaB: TypeObject,
  path = ""
): SchemaDiff[] {
  if (schemasEqual(schemaA, schemaB)) {
    return [{ kind: "identical" }];
  }

  const diffs: SchemaDiff[] = [];
  const infoA = introspect(schemaA);
  const infoB = introspect(schemaB);

  if (infoA.kind !== infoB.kind) {
    diffs.push({
      kind: "different",
      path,
      reason: `Schema kind changed from ${infoA.kind} to ${infoB.kind}`,
    });
    return diffs;
  }

  if (infoA.kind === "object" && infoB.kind === "object") {
    // Compare properties
    const propsA = new Map(infoA.properties.map(p => [p.name, p]));
    const propsB = new Map(infoB.properties.map(p => [p.name, p]));

    // Check removed properties
    for (const [name, propA] of propsA) {
      if (!propsB.has(name)) {
        diffs.push({
          kind: "different",
          path: `${path}.${name}`,
          reason: "Property removed",
        });
      }
    }

    // Check added properties
    for (const [name, propB] of propsB) {
      if (!propsA.has(name)) {
        diffs.push({
          kind: "different",
          path: `${path}.${name}`,
          reason: "Property added",
        });
      }
    }

    // Check changed properties
    for (const [name, propA] of propsA) {
      const propB = propsB.get(name);
      if (propB) {
        if (propA.optional !== propB.optional) {
          diffs.push({
            kind: "different",
            path: `${path}.${name}`,
            reason: `Optional changed: ${propA.optional} -> ${propB.optional}`,
          });
        }
        diffs.push(...diffSchemas(propA.type, propB.type, `${path}.${name}`));
      }
    }
  }

  return diffs.filter(d => d.kind !== "identical");
}

// Usage
const diffs = diffSchemas(OldUserSchema$, NewUserSchema$);
for (const diff of diffs) {
  if (diff.kind === "different") {
    console.log(`${diff.path}: ${diff.reason}`);
  }
}
```

## See Also

- [BYTECODE_REFERENCE.md](./BYTECODE_REFERENCE.md) - Bytecode format specification
- [VALIDATOR_GAPS.md](./VALIDATOR_GAPS.md) - Current limitations
- [FEATURES.md](./FEATURES.md) - All LFTS features

## Future Enhancements

Possible additions in future versions (not yet implemented):

- **Schema transformation**: `mapSchema()` for structural transformations
- **Schema validation**: Validate schemas against meta-schemas
- **Performance profiling**: Track validation performance per schema node
- **Schema versioning**: Track schema evolution over time
- **Custom visitors**: Pre-built visitors for common tasks
