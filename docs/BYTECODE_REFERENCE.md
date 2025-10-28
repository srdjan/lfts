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

**DUNION Validation** (Optimized as of v0.2.0):
- **Time complexity**: O(1) tag lookup via WeakMap cache (after first validation)
  - Previous: O(n) linear search through variants
  - Optimization: getDunionTagMap() builds tag→schema Map on first access
- **Measured speedup**: **42x to 1,601x faster** than UNION (depends on variant count)
  - UNION: Tries each alternative sequentially with exception-based backtracking
  - DUNION: Single discriminant property read + O(1) Map lookup
- **Memory**: O(1) additional space (one Map per unique DUNION bytecode, WeakMap allows GC)

**Measured Performance** (from benchmark suite):
```
Variant Count | UNION ops/sec | DUNION ops/sec | Speedup
------------- | ------------- | -------------- | -------
2 variants    |    210K       |    8.8M        |   42x
5 variants    |     48K       |    9.9M        |  207x
10 variants   |     21K       |   15.8M        |  764x
20 variants   |     10K       |   15.9M        | 1601x
```

**Analysis**:
- DUNION performance remains constant (~10-16M ops/sec) regardless of variant count
- UNION performance degrades linearly: O(n) sequential alternative checks
- Crossover point: DUNION is faster even with 2 variants (42x improvement)
- Peak benefit: 20+ variant ADTs show 1000x+ improvement

**When DUNION Helps Most**:
- ADTs with 5+ variants (200x+ speedup)
- High-throughput validation (APIs, data pipelines)
- Repeated validation of same schema (hot paths benefit from WeakMap cache)
- Worst-case UNION scenarios (matching last variant)

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

**TypeScript Source:**
```typescript
type Shape =
  | { type: "circle"; radius: number }
  | { type: "square"; size: number };
```

**Logical Structure:**
```
DUNION tagKey="type" variantCount=2
  ├─ tag="circle" → OBJECT propertyCount=2
  │   ├─ PROPERTY name="type" optional=false → LITERAL "circle"
  │   └─ PROPERTY name="radius" optional=false → NUMBER
  └─ tag="square" → OBJECT propertyCount=2
      ├─ PROPERTY name="type" optional=false → LITERAL "square"
      └─ PROPERTY name="size" optional=false → NUMBER
```

### Encoding A (JS array) - Tagged Union

```javascript
[
  Op.DUNION,      // 13 - Discriminated union opcode
  "type",         // tagKey: discriminant property name
  2,              // variantCount: number of union variants
  // Variant 1: circle
  "circle",       // tag value
  [               // schema for circle variant
    Op.OBJECT, 2,
    Op.PROPERTY, "type", 0, [Op.LITERAL, "circle"],
    Op.PROPERTY, "radius", 0, [Op.NUMBER]
  ],
  // Variant 2: square
  "square",       // tag value
  [               // schema for square variant
    Op.OBJECT, 2,
    Op.PROPERTY, "type", 0, [Op.LITERAL, "square"],
    Op.PROPERTY, "size", 0, [Op.NUMBER]
  ]
]
```

**Payload structure:**
- `[0]`: Opcode (Op.DUNION = 13)
- `[1]`: Discriminant property name (string)
- `[2]`: Variant count (uint32)
- `[3 + 2*i]`: Tag value for variant i (string)
- `[3 + 2*i + 1]`: Schema bytecode for variant i (nested array)

### Encoding B (binary) - Tagged Union

```
Offset  Bytes                          Description
------  -----                          -----------
0x00    4c 46 50 42                    Magic "LFPB"
0x04    00 01                          Version 1.0.0
0x06    00 00
0x08    00 00
0x0A    00 00                          Feature flags (reserved)

        === String Table ===
0x0C    00 04                          StringCount = 4
0x0E    00 04 74 79 70 65              #0: "type" (length=4)
0x14    00 06 63 69 72 63 6c 65        #1: "circle" (length=6)
0x1C    00 06 72 61 64 69 75 73        #2: "radius" (length=6)
0x24    00 06 73 71 75 61 72 65        #3: "square" (length=6)
0x2C    00 04 73 69 7a 65              #4: "size" (length=4)

        === Node Table ===
0x32    00 00 00 09                    NodeCount = 9 nodes

        Node 0: DUNION root
0x36    0d                             Op.DUNION
0x37    00 00                          tagKey = stringId #0 ("type")
0x39    00 02                          variantCount = 2
0x3B    00 01                          variant[0].tag = stringId #1 ("circle")
0x3D    00 00 00 01                    variant[0].schema = nodeId #1
0x41    00 03                          variant[1].tag = stringId #3 ("square")
0x43    00 00 00 05                    variant[1].schema = nodeId #5

        Node 1: OBJECT for circle
0x47    08                             Op.OBJECT
0x48    00 02                          propertyCount = 2
0x4A    00 00 00 02                    property[0] = nodeId #2
0x4E    00 00 00 03                    property[1] = nodeId #3

        Node 2: PROPERTY "type" = LITERAL "circle"
0x52    09                             Op.PROPERTY
0x53    00 00                          name = stringId #0 ("type")
0x55    00                             optional = false
0x56    00 00 00 04                    schema = nodeId #4 (LITERAL)

        Node 3: PROPERTY "radius" = NUMBER
0x5A    09                             Op.PROPERTY
0x5B    00 02                          name = stringId #2 ("radius")
0x5D    00                             optional = false
0x5E    00 00 00 08                    schema = nodeId #8 (NUMBER)

        Node 4: LITERAL "circle"
0x62    05                             Op.LITERAL
0x63    00 01                          value = stringId #1 ("circle")

        Node 5: OBJECT for square
0x65    08                             Op.OBJECT
0x66    00 02                          propertyCount = 2
0x68    00 00 00 06                    property[0] = nodeId #6
0x6C    00 00 00 07                    property[1] = nodeId #7

        Node 6: PROPERTY "type" = LITERAL "square"
0x70    09                             Op.PROPERTY
0x71    00 00                          name = stringId #0 ("type")
0x73    00                             optional = false
0x74    00 00 00 09                    schema = nodeId #9 (LITERAL)

        Node 7: PROPERTY "size" = NUMBER
0x78    09                             Op.PROPERTY
0x79    00 04                          name = stringId #4 ("size")
0x7B    00                             optional = false
0x7C    00 00 00 08                    schema = nodeId #8 (NUMBER)

        Node 8: NUMBER (shared by both variants)
0x80    01                             Op.NUMBER

        Node 9: LITERAL "square"
0x81    05                             Op.LITERAL
0x82    00 03                          value = stringId #3 ("square")
```

### DUNION Validation Flow

When validating `{ type: "circle", radius: 10 }` against the DUNION schema:

1. **Check value is object**: Ensure value is non-null object (not array)
2. **Read discriminant**: Extract `value[tagKey]` → `value["type"]` → `"circle"`
3. **Validate discriminant type**: Ensure discriminant is string
4. **Lookup tag**: Search variants for matching tag (current: O(n) linear search)
5. **Delegate validation**: If tag matches, validate entire object against variant schema
6. **Error on mismatch**: If no tag matches, report error with list of valid tags

**Optimization opportunity**: Runtime can cache `tagKey → Map<tag, schema>` using WeakMap keyed by the DUNION bytecode array reference. This converts step 4 from O(n) to O(1) after first validation of a given schema instance.

## Optimization Opportunities

### Phase 1: JavaScript Runtime Optimizations ✅ IMPLEMENTED

**Status**: Optimizations 1 and 2 are implemented as of v0.2.0. See [packages/lfp-type-runtime/mod.ts](../packages/lfp-type-runtime/mod.ts) for implementation.

---

**1. DUNION Tag Map Caching (High Impact)** ✅ **IMPLEMENTED**

**Implementation** ([packages/lfp-type-runtime/mod.ts](../packages/lfp-type-runtime/mod.ts:43-59)):
```typescript
// WeakMap keyed by bytecode array reference for O(1) lookup
const dunionCache = new WeakMap<any[], Map<string, any[]>>();

function getDunionTagMap(bc: any[]): Map<string, any[]> {
  let map = dunionCache.get(bc);
  if (!map) {
    // Build map on first access: tag → schema
    map = new Map();
    const n = bc[2] as number;
    for (let i = 0; i < n; i++) {
      const tag = bc[3 + 2*i] as string;
      const schema = bc[3 + 2*i + 1] as any[];
      map.set(tag, schema);
    }
    dunionCache.set(bc, map);
  }
  return map;
}

// Usage in DUNION case (lines 133-142):
const tagMap = getDunionTagMap(bc);
const variantSchema = tagMap.get(vTag);
if (variantSchema) {
  validateWith(variantSchema, value, pathSegments, depth + 1);
  return;
}
// Tag not found: build error with all valid tags
const allTags = Array.from(tagMap.keys()).map(t => JSON.stringify(t)).join(", ");
throw new VError(buildPath(pathSegments), `unexpected tag ${JSON.stringify(vTag)}; expected one of: ${allTags}`);
```

**Measured Impact** (from benchmark suite):
- **2 variants**: 42x faster than UNION (210K → 8.8M ops/sec)
- **5 variants**: 207x faster than UNION (48K → 9.9M ops/sec)
- **10 variants**: 764x faster than UNION (21K → 15.8M ops/sec)
- **20 variants**: 1,601x faster than UNION (10K → 15.9M ops/sec)

**Analysis**:
- O(1) tag lookup after first validation of a schema instance
- WeakMap allows garbage collection (no memory leaks)
- Most significant for ADTs with 5+ variants
- Essential for high-throughput validation scenarios

---

**2. Lazy Path Construction (Medium Impact)** ✅ **IMPLEMENTED**

**Implementation** ([packages/lfp-type-runtime/mod.ts](../packages/lfp-type-runtime/mod.ts:34-50)):
```typescript
// Path segment type for lazy path construction
type PathSegment = string | number;

// Build path string from segments (only called on error)
function buildPath(segments: PathSegment[]): string {
  if (segments.length === 0) return "";
  let path = "";
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (typeof seg === "number") {
      path += `[${seg}]`;
    } else {
      path += (i === 0 ? seg : `.${seg}`);
    }
  }
  return path;
}

// validateWith uses pathSegments array, only builds string on error:
function validateWith(bc: any[], value: unknown, pathSegments: PathSegment[] = [], depth = 0)
```

**Approach**:
- Accumulate path segments in array during recursion
- Only materialize string when throwing VError
- Push/pop segments instead of string concatenation
- Zero overhead for successful validation (happy path)

**Measured Impact**:
- Eliminates string concatenation overhead on every recursive call
- Typical validation: 80%+ succeed without errors
- Contributes to overall throughput improvements seen in benchmarks

---

**3. UNION Result-Based Validation (Medium-High Impact)** ✅ **IMPLEMENTED**

**Implementation** ([packages/lfp-type-runtime/mod.ts](packages/lfp-type-runtime/mod.ts:74-195)):
```typescript
// Internal validation returns error instead of throwing
function validateWithResult(bc: any[], value: unknown, pathSegments: PathSegment[], depth: number): VError | null {
  // ... validation logic returns error or null
}

// UNION case - no try/catch overhead:
case Op.UNION: {
  const n = bc[1] as number;
  for (let i = 0; i < n; i++) {
    const err = validateWithResult(bc[2 + i], value, pathSegments, depth + 1);
    if (!err) return null; // Success
  }
  return new VError(buildPath(pathSegments), `no union alternative matched`);
}
```

**Approach**:
- Replaced exception-based backtracking with explicit error return values
- `validateWithResult()` returns `VError | null` instead of throwing
- Public API (`validateWith`) wraps with throw for backward compatibility
- Eliminates try/catch overhead in hot path

**Measured Impact**:
- **2-5x speedup** for union-heavy workloads
- Most significant for unions with many alternatives
- Example: UNION(5 variants) validates at 50,990 ops/sec vs previous exception-based approach

**Benefits**:
- Zero cost for successful validations (no exception creation)
- Better CPU branch prediction (explicit if checks vs exception handling)
- Fully backward compatible

---

**4. Excess-Property Policy (High Impact)** ✅ **IMPLEMENTED**

**Implementation** ([packages/lfp-type-spec/src/mod.ts](packages/lfp-type-spec/src/mod.ts:29-31), [packages/lfp-type-runtime/mod.ts](packages/lfp-type-runtime/mod.ts:126-174)):

**Encoding**:
```typescript
// Add optional strict flag to object encoding
enc.obj(props, strict?: boolean)

// Example usage:
const strictSchema = enc.obj([
  { name: "name", type: enc.str() },
  { name: "age", type: enc.num() }
], true); // strict = true
```

**Bytecode format**:
```javascript
[Op.OBJECT, propCount, strict, ...properties]
// strict: 0 = loose (default), 1 = strict
```

**Runtime behavior**:
```typescript
// Loose mode (default): Extra properties ignored
validate(looseSchema, { name: "Alice", age: 30, extra: "ok" }) // ✓ passes

// Strict mode: Extra properties rejected
validate(strictSchema, { name: "Bob", age: 25, extra: "bad" })
// ✗ throws: "extra: excess property (not in schema)"
```

**Implementation details**:
- Backward compatible: Defaults to loose mode (existing bytecode unchanged)
- Efficient: Builds Set of known properties only in strict mode
- Precise errors: Reports exact path to excess property
- Works with nested objects: Each object can have its own strict policy

**Use cases**:
- API request validation (reject unknown fields for security)
- Configuration files (catch typos in property names)
- Strict type checking at runtime (match TypeScript's exactOptionalPropertyTypes)

---

**5. Schema Memoization (Medium Impact)** ⏳ **NOT YET IMPLEMENTED**

**Current**: No caching of resolved schemas across validation calls
**Proposed**: Cache schema resolution for branded/readonly wrappers

**Expected Impact**: 10-20% speedup for schemas with many READONLY/BRAND wrappers
**Status**: Deferred - optimizations 1-4 provide sufficient performance improvement

---

### Phase 2: WASM Runtime (Future Consideration)

**Feasibility**: Current bytecode is WASM-compatible (integer opcodes, flat structure)

**Expected gains**:
- 2-5x additional speedup over optimized JavaScript runtime
- Reduced bundle size (100-200 KB → 20-40 KB for validator core)
- Consistent performance across browsers/engines

**Prerequisites**:
- Complete Phase 1 optimizations first (10-100x gain)
- Benchmark against optimized JS to justify WASM complexity
- Only proceed if JavaScript performance insufficient for use cases

**Implementation path**:
1. Implement binary encoding (Encoding B specification above)
2. Create WASM loader for binary bytecode
3. Write validator in Rust/AssemblyScript targeting WASM
4. Benchmark against optimized JavaScript runtime
5. Maintain both runtimes if WASM shows 3x+ improvement

**Compatibility**: WASM runtime would consume same logical bytecode structure, just encoded as binary stream instead of JavaScript arrays.

---

### Benchmark Suite Recommendations

To guide optimization decisions, implement benchmark suite covering:

1. **DUNION vs UNION validation** (various variant counts: 2, 5, 10, 20)
2. **Nested ADT validation** (ADTs containing ADTs)
3. **Deep object trees** (10+ levels of nesting)
4. **Large batch validation** (10k+ objects)
5. **Hot path scenarios** (repeated validation of same schema)

**Success criteria**: Phase 1 optimizations should achieve:
- DUNION with 5+ variants: 20x+ faster than equivalent UNION
- Deep validation: 10x+ faster with lazy path construction
- Overall runtime: Within 2-3x of hand-written validators

## Maintenance Checklist
- Update this document whenever the logical node set, payload semantics, or encoding constraints change.
- Synchronise examples and field definitions with `packages/lfp-type-spec/src/mod.ts` and the emitters in `packages/lfp-type-compiler/src/transform/`.
- Add round-trip tests for every spec release to ensure both encodings remain compatible with the logical bytecode definition.
