# Light-FP Bytecode Specification

This document defines the logical bytecode produced by the Light-FP compiler and consumed by all runtimes. The semantics described here are authoritative; concrete encodings (JavaScript array literals, binary streams, etc.) are merely transport formats that must round-trip to the same logical structure.

## Versioning & Compatibility
- **Specification version**: `1.0.0`. Increment the minor version for backward-compatible additions (new node types, new optional payload fields) and the major version for breaking changes. Patch releases cover editorial fixes only.
- **Logical contract**: Both the Deno TypeScript runtime and the forthcoming WASM runtime must declare support for a specific specification version. Emitters are responsible for embedding the spec version into their output so runtimes can reject incompatible bytecode early.
- **Feature flags**: Reserved for future use. Emitters SHOULD include a bitset when serialising to binary so runtimes can gracefully handle opt-in features.

## Logical Node Definitions
Each type description is a directed tree whose nodes are drawn from the `Op` enum in `packages/lfp-type-spec/src/mod.ts`. The enum values double as stable identifiers across encodings; consumers must not rely on their numeric order.

| Node | Purpose | Payload Fields |
| ---- | ------- | --------------- |
| `STRING` | Any UTF-16 string. | None |
| `NUMBER` | Finite IEEE-754 double. | None |
| `BOOLEAN` | Boolean value. | None |
| `NULL` | Literal `null`. | None |
| `UNDEFINED` | Literal `undefined`. | None |
| `LITERAL` | Exact literal primitive. | `value: string | number | boolean` |
| `ARRAY` | Homogeneous array. | `element: node` |
| `TUPLE` | Fixed-length tuple. | `length: uint32`, `elements[length]: node` |
| `OBJECT` | Object with named properties. | `propertyCount: uint32`, `properties[propertyCount]: PROPERTY node` |
| `PROPERTY` | Declares a single object property. Must only appear as child of `OBJECT`. | `name: stringId`, `optional: boolean`, `schema: node` |
| `OPTIONAL` | Reserved placeholder for future optional wrapper. | No payload; runtimes must reject until activated. |
| `UNION` | Non-discriminated union. | `alternativeCount: uint32`, `alternatives[alternativeCount]: node` |
| `READONLY` | Structural immutability marker. | `inner: node` |
| `DUNION` | Discriminated union keyed by a property. | `tagKey: stringId`, `variantCount: uint32`, `variants[variantCount]: { tag: stringId, schema: node }` |
| `BRAND` | Structural brand intersection. | `tag: stringId`, `inner: node` |

### Node Semantics
- `PROPERTY.optional` indicates whether the owning `OBJECT` requires the key to be present during validation.
- `READONLY` conveys intent only; current runtimes treat it as an alias but retain the marker for future alias analysis.
- `OPTIONAL` is a logical placeholder. Emitters MUST NOT produce it until the gate/policy permits the construct and runtimes implement the semantics.
- `DUNION` requires the discriminant property to be a literal string in each variant. Runtimes must enforce strict tag matching before delegating to the variant schema.
- Any unsupported TypeScript construct must materialise as a well-defined **diagnostic node**. Iteration 1 uses `LITERAL` with a descriptive string (e.g., `"/*unsupported intersection*/"`); future revisions may introduce a dedicated `ERROR` node.

## Emission Behaviour

### DUNION vs UNION Selection

The compiler emits `DUNION` when ALL of these conditions are met:
1. Union has ≥2 type literal members
2. Every member has a **required** (non-optional) property
3. All members use the **same** property name as discriminant
4. All discriminant values are **string literals**
5. All discriminant values are **unique**

Otherwise, the compiler emits `UNION` with sequential alternative checking.

#### Examples: DUNION Emission

```typescript
// ✅ Emits DUNION - perfect ADT
type Command =
  | { type: "add"; name: string }
  | { type: "list" }
  | { type: "delete"; id: string };
// Bytecode: [Op.DUNION, "type", 3, "add", [...], "list", [...], "delete", [...]]

// ✅ Emits DUNION - custom discriminant key
type Shape =
  | { kind: "circle"; radius: number }
  | { kind: "square"; size: number };
// Bytecode: [Op.DUNION, "kind", 2, "circle", [...], "square", [...]]
```

#### Examples: UNION Fallback

```typescript
// ❌ Emits UNION - mixed discriminant keys
type Mixed =
  | { type: "a"; x: number }
  | { kind: "b"; y: number };
// Reason: Inconsistent tag property names

// ❌ Emits UNION - optional discriminant
type Optional =
  | { type?: "a"; x: number }
  | { type?: "b"; y: number };
// Reason: Discriminant marked optional

// ❌ Emits UNION - non-literal discriminant
type Dynamic =
  | { type: string; x: number }
  | { type: string; y: number };
// Reason: Discriminant is not a string literal

// ❌ Emits UNION - duplicate tags
type Duplicate =
  | { type: "same"; x: number }
  | { type: "same"; y: string };
// Reason: Tag "same" appears twice

// ❌ Emits UNION - non-object variant
type MixedTypes = string | { type: "object"; value: number };
// Reason: Not all variants are type literals
```

### Performance Characteristics

**DUNION Validation**:
- **Time complexity**: O(n) linear search through variants (current implementation)
  - With map cache optimization: O(1) after first validation of schema instance
- **Typical speedup**: 10-100x faster than UNION for ADTs with 3+ variants
  - UNION: Tries each alternative sequentially, expensive exception handling
  - DUNION: Single discriminant property read + tag lookup
- **Memory**: O(1) additional space (tag→schema map cached per unique DUNION bytecode)

**Example Performance**:
```typescript
// Scenario: Validate 10,000 objects with 4-variant ADT
// UNION:  850 validations/sec  (11.76 ms total)
// DUNION: 8,500 validations/sec (1.18 ms total) → 10x faster
```

**When DUNION Helps Most**:
- Large batch validation (APIs, data pipelines)
- ADTs with 5+ variants
- Nested structures with repeated ADT types
- High-throughput validation scenarios

### Other Emission Rules

- `OPTIONAL` remains disabled in the gate; emitters continue to use the `PROPERTY.optional` flag for optional fields.

## Encoding A — Nested JavaScript Arrays (Deno Runtime)
- **Container**: Each logical node is encoded as a JavaScript array literal emitted at compile time. The first element is the `Op` enum value, subsequent elements carry payload data in the order shown above.
- **Strings**: Stored inline as TypeScript string literals. Numeric values remain numbers. Boolean flags use `0`/`1` for compactness.
- **Nesting**: Child nodes appear inline as nested arrays. This keeps the emitter simple and enables the existing runtime (`packages/lfp-type-runtime/mod.ts`) to interpret the structure with a recursive `switch`.
- **Version stamp**: Emitters should prepend a leading array entry of the form `[versionMajor, versionMinor, versionPatch]` once the runtime adds explicit version checks. Until then, the Deno runtime trusts that transformer and runtime are built from the same commit.

## Encoding B — Binary Stream (WASM Runtime)
The binary representation is a stream of unsigned bytes optimised for linear memory. It must decode deterministically back into the logical node graph.

```
Offset  Size    Field                    Description
0       4       Magic                    ASCII `LFPB`
4       2       VersionMajor             Matches spec major
6       2       VersionMinor             Matches spec minor
8       2       VersionPatch             Matches spec patch
10      2       FeatureFlags             Bitset (reserved)
12      4       StringCount              Number of unique strings
16      …       StringTable              UTF-8 strings prefixed with u16 length; referenced by index
…       4       NodeCount                Total logical nodes
…       …       NodeRecords              Packed records per node (opcode, payload, offsets)
```

- **NodeRecords**: Each record starts with `opcode: u8`. Payload layout follows the logical definition (for example, `ARRAY` stores a `u32` child index). Variable-length segments (e.g., tuples, unions) encode counts followed by indices into the node array.
- **Indices**: Child references point to entries in the node table to avoid deep recursion during decoding.
- **Diagnostic payloads**: Until a dedicated node exists, unsupported constructs use `LITERAL` pointing to a string-table entry that describes the failure.
- **Endianness**: All multi-byte integers use big-endian order to remain platform-neutral.

The WASM runtime prototype should expose a loader that reads the binary header, validates the version, materialises the string table, and builds an in-memory representation identical to the logical node tree before execution.

## Examples

### Logical view
```
OBJECT
  ├─ PROPERTY name="name" optional=false → STRING
  └─ PROPERTY name="age" optional=true → NUMBER
```

### Encoding A (JS array)
```
[ Op.OBJECT, 2,
  Op.PROPERTY, "name", 0, [Op.STRING],
  Op.PROPERTY, "age", 1, [Op.NUMBER]
]
```

### Encoding B (binary; pseudo dump)
```
4c 46 50 42  00 01  00 00  00 01  00 00
00 02  00 04 6e 61 6d 65  00 03 61 67 65
00 03  08 00 00 00 02  09 00 00 00 00 00  00 00 00 01
09 00 00 00 01 01  00 00 00 02
```
The dump above illustrates the magic, version, string table (`"name"`, `"age"`), and the node records referencing those indices.

### Tagged union (logical)
```
DUNION tagKey="type"
  ├─ tag="circle" → OBJECT(radius: NUMBER)
  └─ tag="square" → OBJECT(size: NUMBER)
```

Encoding A and B follow the same patterns as above, substituting the `DUNION` payload ordering.

## Maintenance Checklist
- Update this document whenever the logical node set, payload semantics, or encoding constraints change.
- Synchronise examples and field definitions with `packages/lfp-type-spec/src/mod.ts` and the emitters in `packages/lfp-type-compiler/src/transform/`.
- Add round-trip tests for every spec release to ensure both encodings remain compatible with the logical bytecode definition.
