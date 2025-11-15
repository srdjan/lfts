# Type Objects (v0.10.0)

## Overview

LFTS v0.10.0 introduces a **Hybrid Type Object System** that wraps bytecode arrays with a rich reflection API while maintaining full backward compatibility and performance.

**Key Benefits:**
- 🎯 **Reflection-first API**: Programmatic access to schema structure
- 🔧 **Runtime composition**: Transform schemas dynamically (makePartial, pick, omit, extend)
- 🚀 **Zero overhead**: Same bytecode interpreter, <5% unwrapping cost
- ✅ **Backward compatible**: Raw bytecode arrays still work
- 🏗️ **Builder API**: Fluent programmatic schema construction
- 📊 **Rich introspection**: Direct property/variant access without parsing

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   Type Object Layer                      │
│  ┌───────────────────────────────────────────────────┐  │
│  │  Type<T>                                          │  │
│  │  - validate(value): T                             │  │
│  │  - validateSafe(value): Result<T, ValidationError>│ │
│  │  - inspect(): SchemaInfo                          │  │
│  │  - equals(other): boolean                         │  │
│  │  - hash(): string                                 │  │
│  └───────────────────────────────────────────────────┘  │
│                         │                                │
│                         ├─► StringType                   │
│                         ├─► NumberType                   │
│                         ├─► ObjectType                   │
│                         ├─► ArrayType                    │
│                         ├─► UnionType                    │
│                         ├─► DUnionType                   │
│                         └─► 13 RefinementType classes   │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                   Bytecode Layer                         │
│  - Op.STRING, Op.NUMBER, Op.OBJECT, Op.DUNION, etc.     │
│  - Nested array format: [Op, ...args]                   │
│  - Fast interpreter (8-16M ops/sec for primitives)      │
└─────────────────────────────────────────────────────────┘
```

## Usage Patterns

### 1. Builder API (Programmatic Construction)

```typescript
import { t } from "@lfts/type-runtime";

// Create schemas programmatically
const User$ = t.object({
  id: t.string().pattern("^usr_[a-z0-9]+$"),
  email: t.string().email(),
  age: t.number().min(0),
  role: t.union(t.literal("admin"), t.literal("user"), t.literal("guest")),
});

// Validate data
const result = User$.validateSafe({
  id: "usr_abc123",
  email: "test@example.com",
  age: 25,
  role: "user"
});

if (result.ok) {
  console.log("Valid user:", result.value);
} else {
  console.error("Validation failed:", result.error.message);
}
```

### 2. Runtime Schema Composition

```typescript
// Make all properties optional
const PartialUser$ = User$.makePartial();
PartialUser$.validateSafe({ id: "usr_test" }); // ✅ Valid

// Pick specific properties
const PublicUser$ = User$.pick(["id", "role"]);

// Omit sensitive properties
const SafeUser$ = User$.omit(["email"]);

// Extend with new properties
const UserWithTimestamps$ = User$.extend({
  createdAt: t.number(),
  updatedAt: t.number(),
});
```

### 3. Compiler-Generated Type Objects

```typescript
// types.ts
export type User = {
  id: string;
  email: string;
  age: number;
  role: "admin" | "user" | "guest";
};

// types.schema.ts (Schema-Root Pattern)
import type { User } from "./types.ts";

// Compiler automatically generates:
// export const User$ = createTypeObject([bytecode], { name: "User", source: "types.ts" });
export type UserSchema = User;
```

### 4. Introspection

```typescript
// Direct property access (no parsing needed)
console.log(User$.kind); // "object"
console.log(User$.properties.length); // 4
console.log(User$.properties[0].name); // "id"
console.log(User$.properties[0].optional); // false

// Full introspection
const info = User$.inspect();
if (info.kind === "object") {
  for (const prop of info.properties) {
    console.log(`${prop.name}: ${prop.optional ? "optional" : "required"}`);
  }
}
```

### 5. Discriminated Unions (ADTs)

```typescript
const Result$ = t.dunion("type", {
  ok: t.object({ type: t.literal("ok"), value: t.number() }),
  err: t.object({ type: t.literal("err"), message: t.string() }),
});

// Direct variant access
console.log(Result$.discriminant); // "type"
console.log(Result$.variants[0].tag); // "ok"
console.log(Result$.variants[1].tag); // "err"

// Validate
const okResult = Result$.validateSafe({ type: "ok", value: 42 });
const errResult = Result$.validateSafe({ type: "err", message: "failed" });
```

## Type Class Hierarchy

### Abstract Base: `Type<T>`

All Type classes extend the abstract `Type<T>` base which provides:

```typescript
abstract class Type<T> {
  readonly bc: Bytecode;                    // Raw bytecode array
  abstract readonly kind: string;           // "primitive", "object", etc.

  validate(value: unknown): T;              // Throws on error
  validateSafe(value: unknown): Result<T, ValidationError>;
  inspect(): SchemaInfo;                    // Introspection
  equals(other: Type): boolean;             // Structural equality
  hash(): string;                           // SHA-256 hash
}
```

### Primitive Types

```typescript
class StringType extends Type<string> {
  kind: "primitive";

  // Refinements
  email(): StringType;
  url(): StringType;
  pattern(regex: string): StringType;
  minLength(n: number): StringType;
  maxLength(n: number): StringType;
  nonEmpty(): StringType;
}

class NumberType extends Type<number> {
  kind: "primitive";

  // Refinements
  min(n: number): NumberType;
  max(n: number): NumberType;
  integer(): NumberType;
  positive(): NumberType;
  negative(): NumberType;
}

class BooleanType extends Type<boolean> { kind: "primitive"; }
class NullType extends Type<null> { kind: "primitive"; }
class UndefinedType extends Type<undefined> { kind: "primitive"; }
class LiteralType<T> extends Type<T> { kind: "literal"; value: T; }
```

### Composite Types

```typescript
class ObjectType<T> extends Type<T> {
  kind: "object";
  properties: PropertyInfo[];              // Lazy-parsed
  strict: boolean;

  // Composition methods
  makePartial(): ObjectType<Partial<T>>;
  pick(keys: string[]): ObjectType<Pick<T, K>>;
  omit(keys: string[]): ObjectType<Omit<T, K>>;
  extend(props: Record<string, Type>): ObjectType<T & U>;
}

class ArrayType<T> extends Type<T[]> {
  kind: "array";
  element: Type<T>;                        // Lazy-unwrapped

  // Refinements
  minItems(n: number): ArrayType<T>;
  maxItems(n: number): ArrayType<T>;
}

class TupleType<T> extends Type<T> {
  kind: "tuple";
  elements: Type[];                        // Lazy-parsed
}

class UnionType<T> extends Type<T> {
  kind: "union";
  alternatives: Type[];                    // Lazy-parsed
}

class DUnionType<T> extends Type<T> {
  kind: "dunion";
  discriminant: string;                    // Direct access
  variants: VariantInfo[];                 // Lazy-parsed
}
```

### Wrapper Types

```typescript
class ReadonlyType<T> extends Type<Readonly<T>> {
  kind: "readonly";
  inner: Type<T>;                          // Lazy-unwrapped
}

class BrandType<T> extends Type<T> {
  kind: "brand";
  tag: string;                             // Direct access
  inner: Type;                             // Lazy-unwrapped
}

class MetadataType<T> extends Type<T> {
  kind: "metadata";
  metadata: SchemaMetadata;                // Direct access
  inner: Type<T>;                          // Lazy-unwrapped
}
```

### Refinement Types (13 total)

```typescript
class RefineMinType<T> extends Type<T> { kind: "refinement"; constraint: number; }
class RefineMaxType<T> extends Type<T> { kind: "refinement"; constraint: number; }
class RefineIntegerType extends Type<number> { kind: "refinement"; }
class RefineEmailType extends Type<string> { kind: "refinement"; }
class RefineUrlType extends Type<string> { kind: "refinement"; }
class RefinePatternType extends Type<string> { kind: "refinement"; pattern: string; }
class RefineMinLengthType extends Type<string> { kind: "refinement"; constraint: number; }
class RefineMaxLengthType extends Type<string> { kind: "refinement"; constraint: number; }
class RefineMinItemsType<T> extends Type<T[]> { kind: "refinement"; constraint: number; }
class RefineMaxItemsType<T> extends Type<T[]> { kind: "refinement"; constraint: number; }
class RefinePositiveType extends Type<number> { kind: "refinement"; }
class RefineNegativeType extends Type<number> { kind: "refinement"; }
class RefineNonEmptyType extends Type<string> { kind: "refinement"; }
```

## Builder API Reference

The `t` object provides fluent builders for all Type classes:

```typescript
import { t } from "@lfts/type-runtime";

// Primitives
t.string()                                 // StringType
t.number()                                 // NumberType
t.boolean()                                // BooleanType
t.null()                                   // NullType
t.undefined()                              // UndefinedType
t.literal("value")                         // LiteralType<"value">

// Composites
t.array(t.number())                        // ArrayType<number>
t.tuple([t.string(), t.number()])          // TupleType<[string, number]>
t.object({ id: t.string(), age: t.number() }) // ObjectType<{id: string, age: number}>
t.objectWithOptional({ id: t.string() }, { age: t.number() }) // Optional properties
t.union(t.string(), t.number())            // UnionType<string | number>
t.dunion("type", { ok: ..., err: ... })    // DUnionType

// Wrappers
t.readonly(t.array(t.number()))            // ReadonlyType<readonly number[]>
t.brand(t.string(), "UserId")              // BrandType<string & {__brand: "UserId"}>
```

## Performance Characteristics

### Validation (Hot Path)

- **Primitives**: 3-4M ops/sec
- **Objects**: 800K-900K ops/sec
- **DUNIONs**: 600K-800K ops/sec (with tag caching)
- **Type object overhead**: <5% (negligible)

### Introspection (Cold Path)

- **Raw bytecode**: 25M ops/sec
- **Type objects**: 22M ops/sec (11% slower, still very fast)
- **Lazy evaluation**: Properties parsed once and cached

### Memory

- **Type object wrapper**: ~48 bytes per instance
- **Property cache**: ~24 bytes per property (lazy)
- **Variant cache**: ~32 bytes per variant (lazy)

## Backward Compatibility

### Raw Bytecode Arrays Still Work

```typescript
import { Op } from "@lfts/type-spec";
import { validate, validateSafe, introspect } from "@lfts/type-runtime";

// Pre-v0.10.0 style: Raw bytecode arrays
const schema = [Op.STRING];
validate(schema, "hello");                 // ✅ Works
validateSafe(schema, "hello");             // ✅ Works
introspect(schema);                        // ✅ Works

// All existing code continues to work unchanged
```

### Mixed Usage

```typescript
// Mix Type objects and raw bytecode
const User$ = t.object({
  id: [Op.STRING],                         // Raw bytecode
  email: t.string().email(),               // Type object
  age: t.number().min(0),                  // Type object
});

// Validation functions accept both
validate(User$, data);                     // Type object
validate([Op.STRING], "test");             // Raw bytecode
```

## Migration Guide

### From Raw Bytecode (Pre-v0.10.0)

**Before:**
```typescript
import { Op } from "@lfts/type-spec";
import { validate } from "@lfts/type-runtime";

const User$ = [
  Op.OBJECT, 2, 0,
  Op.PROPERTY, "id", 0, [Op.STRING],
  Op.PROPERTY, "age", 0, [Op.NUMBER],
];

validate(User$, data);
```

**After (Option 1: Schema-Root Pattern):**
```typescript
// types.ts
export type User = { id: string; age: number };

// types.schema.ts
import type { User } from "./types.ts";
export type UserSchema = User;             // Compiler generates User$
```

**After (Option 2: Builder API):**
```typescript
import { t } from "@lfts/type-runtime";

const User$ = t.object({
  id: t.string(),
  age: t.number(),
});

User$.validate(data);                      // Method API
```

## Known Limitations

### Refinement Chaining (TypeScript Limitation)

**Problem**: Refinement methods don't preserve the class type due to TypeScript's type system constraints.

```typescript
// ❌ DOESN'T WORK - .maxLength() not available after first refinement
const Username$ = t.string().minLength(3).maxLength(20);
//                                        ^^^^^^^^^^^^ Error: maxLength doesn't exist on Type<unknown>
```

**Root Cause**: The refinement methods return `Type<T>` (the base class) instead of `StringType` due to TypeScript's limitations with method return types.

**Workarounds**:

**Option 1: Manual composition (Recommended)**
```typescript
// Create a refined type using helper functions
import { RefineMinLengthType, RefineMaxLengthType } from "@lfts/type-runtime/type-object";

const Username$ = new RefineMaxLengthType(
  new RefineMinLengthType(
    t.string().bc,  // Get the bytecode
    3
  ).bc,
  20
);
```

**Option 2: Single refinement per variable**
```typescript
// Apply one refinement and accept the limitation
const Username$ = t.string().minLength(3);  // ✅ Works
// For additional refinements, manually construct bytecode
```

**Option 3: Direct bytecode construction**
```typescript
import { enc } from "@lfts/type-spec";

const Username$ = createTypeObject(
  enc.refine.maxLength(
    enc.refine.minLength([Op.STRING], 3),
    20
  )
);
```

**Best Practice**: For schemas with multiple refinements, use the schema-root pattern and let TypeScript infer the constraints:

```typescript
// types.ts
type Username = string & MinLength<3> & MaxLength<20>;  // TypeScript handles this

// types.schema.ts
export type UsernameSchema = Username;  // Compiler generates refined bytecode
```

**Future Work**: We're investigating builder patterns that could enable chaining while preserving types.

## API Reference

### Type Object Creation

```typescript
// From bytecode (compiler-generated)
createTypeObject(bytecode: Bytecode, metadata?: SchemaMetadata): Type

// From builder API
t.string()
t.number()
t.object(props)
// ... see Builder API Reference above
```

### Validation

```typescript
// Standalone functions (accept both Type objects and raw bytecode)
validate<T>(schema: TypeObject, value: unknown): T
validateSafe<T>(schema: TypeObject, value: unknown): Result<T, ValidationError>
validateAll<T>(schema: TypeObject, value: unknown): ValidationResult<T>

// Type object methods
Type.validate(value: unknown): T
Type.validateSafe(value: unknown): Result<T, ValidationError>
```

### Introspection

```typescript
// Standalone function
introspect(schema: TypeObject): SchemaInfo

// Type object method
Type.inspect(): SchemaInfo

// Direct property access (ObjectType only)
ObjectType.properties: PropertyInfo[]
ObjectType.strict: boolean

// Direct variant access (DUnionType only)
DUnionType.discriminant: string
DUnionType.variants: VariantInfo[]
```

### Composition (ObjectType only)

```typescript
ObjectType.makePartial(): ObjectType<Partial<T>>
ObjectType.pick(keys: string[]): ObjectType<Pick<T, K>>
ObjectType.omit(keys: string[]): ObjectType<Omit<T, K>>
ObjectType.extend(props: Record<string, Type>): ObjectType<T & U>
```

### Utilities

```typescript
Type.equals(other: Type): boolean
Type.hash(): string
Type.bc: Bytecode                          // Access raw bytecode
```

## Design Rationale

### Why Hybrid Architecture?

1. **Performance**: Bytecode interpreter is highly optimized (8-16M ops/sec). Wrapping doesn't change interpreter logic.
2. **Backward compatibility**: Existing code using raw bytecode continues to work.
3. **Developer experience**: Rich API for introspection and composition without sacrificing speed.
4. **Lazy evaluation**: Parse bytecode on demand, cache results. No overhead if you just validate.

### Why Not Pure Reflection?

Considered alternatives:
- **Pure reflection classes**: Higher memory overhead, slower instantiation
- **Bytecode-only**: No programmatic access, limited composability
- **Hybrid (chosen)**: Best of both worlds

### Why Lazy Parsing?

```typescript
// Properties parsed only when accessed
const User$ = createTypeObject(bytecode);
User$.validate(data);                      // ✅ No parsing overhead
User$.properties;                          // ✅ Parse once, cache
User$.properties;                          // ✅ Return cached result
```

## Examples

See complete working examples in:
- [`type-object-demo.ts`](../packages/lfts-type-runtime/type-object-demo.ts) - 7 feature demonstrations
- [`type-object.test.ts`](../packages/lfts-type-runtime/type-object.test.ts) - 48 unit tests
- [`backward-compat.test.ts`](../packages/lfts-type-runtime/backward-compat.test.ts) - 27 compatibility tests
- [`benchmark-type-objects.ts`](../packages/lfts-type-runtime/benchmark-type-objects.ts) - Performance analysis

## Related Documentation

- [FEATURES.md](FEATURES.md) - Overall LFTS features
- [BYTECODE_REFERENCE.md](BYTECODE_REFERENCE.md) - Bytecode format details
- [LANG-SPEC.md](LANG-SPEC.md) - Light-FP language specification
- [SCHEMA_GENERATION.md](SCHEMA_GENERATION.md) - Why explicit schemas vs reflection
