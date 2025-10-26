# Deepkit-Compatible Bytecode Reference

This document describes the bytecode format emitted by the Light-FP compiler passes and consumed by the runtime helpers shipped in this repository. The format intentionally mirrors Deepkit's type bytecode while staying small enough to review and hand-author during Iteration 1.

## Context
- **Emitter**: `typeOf<T>()` transformer and schema-root rewriter in `packages/lfp-type-compiler/src/transform/`.
- **Spec**: `Op` enum and `enc` helpers in `packages/lfp-type-spec/src/mod.ts`.
- **Runtime**: Decoder/validator in `packages/lfp-type-runtime/mod.ts`.

The compiler rewrites each `typeOf<T>()` call (or exported `FooSchema` alias) into a nested array literal that the runtime treats as canonical schema data. Downstream code should treat these arrays as immutable constants.

## Encoding Conventions
- **Container**: Every encoded type is a JavaScript array whose first element is an opcode (`Op` enum value). Additional elements carry payload data documented below.
- **Enum values**: TypeScript assigns the opcodes sequential numeric IDs. The current mapping is stable for Iteration 1 but should be treated as an implementation detail:

  | Opcode | Numeric | Meaning |
  | ------ | ------- | ------- |
  | `Op.STRING` | 0 | primitive string |
  | `Op.NUMBER` | 1 | primitive number (finite) |
  | `Op.BOOLEAN` | 2 | primitive boolean |
  | `Op.NULL` | 3 | literal `null` |
  | `Op.UNDEFINED` | 4 | literal `undefined` |
  | `Op.LITERAL` | 5 | literal payload (string / number / boolean) |
  | `Op.ARRAY` | 6 | homogeneous array |
  | `Op.TUPLE` | 7 | fixed-length tuple |
  | `Op.OBJECT` | 8 | object with named properties |
  | `Op.PROPERTY` | 9 | property marker inside `Op.OBJECT` payload |
  | `Op.OPTIONAL` | 10 | reserved (not emitted in Iteration 1) |
  | `Op.UNION` | 11 | union of alternatives |
  | `Op.READONLY` | 12 | readonly wrapper (structural only) |
  | `Op.DUNION` | 13 | discriminated union (ADT) |
  | `Op.BRAND` | 14 | structural brand tag |

- **Values**: Numbers are emitted as numeric literals, strings as string literals, nested schemas as inline arrays. The compiler emits `0`/`1` flags for booleans to keep payloads fully serializable.
- **Placeholders**: Unsupported constructs fall back to `[Op.LITERAL, "/*unsupported*/"]` (or a descriptive string) so the runtime fails fast if such bytecode is reached.

## Payload Layout by Opcode

### Primitives and Literals
- `[Op.STRING]`, `[Op.NUMBER]`, `[Op.BOOLEAN]`, `[Op.NULL]`, `[Op.UNDEFINED]`
  - No trailing payload.
- `[Op.LITERAL, value]`
  - `value` must be a JSON-serializable primitive (`string | number | boolean`).

### Collections
- Arrays: `[Op.ARRAY, elementSchema]`
  - `elementSchema` is a nested opcode array.
- Tuples: `[Op.TUPLE, length, element₀, element₁, …]`
  - `length` must equal the number of element schemas that follow.

### Objects
- Object header: `[Op.OBJECT, propertyCount, …propertySegments]`
- Each property segment: `[Op.PROPERTY, name, isOptionalFlag, schema]`
  - `name`: string key emitted exactly as written in the type literal.
  - `isOptionalFlag`: `0` for required, `1` for optional (`prop?:`).
  - `schema`: nested opcode array for the property type.
  - Properties appear in source order; excess properties are ignored at runtime.

### Unions
- Plain unions: `[Op.UNION, alternativeCount, schema₀, schema₁, …]`
  - The runtime tries each schema in order until one validates.
- Discriminated unions (ADT): `[Op.DUNION, tagKey, variantCount, tag₀, schema₀, tag₁, schema₁, …]`
  - `tagKey`: name of the discriminant property (Iteration 1 enforces `'type'`).
  - Each `tagᵢ` is the literal discriminant string; `schemaᵢ` is a full object schema for that variant.
  - Runtime validation requires the discriminant property to exist and match one of the declared tags.

### Modifiers
- Readonly wrapper: `[Op.READONLY, innerSchema]`
  - Runtime currently treats this as an alias for `innerSchema` (immutability is not enforced).
- Brand wrapper: `[Op.BRAND, tag, innerSchema]`
  - Emitted when the compiler detects the structural `__brand` intersection pattern.
  - Runtime validates the inner schema only; brand tags serve as nominal markers for future phases.

## Emission Rules
- **`typeOf<T>()` calls**: The transformer (`typeOf-rewriter.ts`) walks literal-friendly TypeScript structures (primitives, arrays, tuples, object literals, unions, structural brands). Unsupported syntax yields literal markers.
- **Schema-root aliases**: Exported type aliases suffixed with `Schema` trigger the schema-root rewriter, which emits `export const Foo$ = […]` siblings that hold the encoded array.
- **Type references**: Unknown `type` references are emitted as `[Op.LITERAL, identifier]` placeholders to keep bytecode deterministic until symbol resolution is implemented.
- **Brands**: Only two-intersection patterns of the form `Base & { readonly __brand: "Tag" }` are recognized. Other intersections become `"/*unsupported intersection*/"` literals.
- **Reserved opcodes**: `Op.OPTIONAL` is defined but not emitted; optionality is handled via the flag in object properties.

## Runtime Semantics
- `validate(schema, value)` (`packages/lfp-type-runtime/mod.ts`) walks the bytecode and throws `VError` with path-aware diagnostics on mismatch.
- `serialize(schema, value)` currently delegates to `validate` and returns the value unchanged.
- `match(value, cases)` relies on ADT discriminants produced by `[Op.DUNION, …]`.
- If bytecode is missing (e.g., raw `typeOf<T>()` runtime usage), the runtime throws with guidance to re-run `deno task build`.

## Examples

### Simple Object
Type:
```ts
type User = { name: string; age?: number };
```
Bytecode (symbolic):
```
[ Op.OBJECT, 2,
  Op.PROPERTY, "name", 0, [Op.STRING],
  Op.PROPERTY, "age", 1, [Op.NUMBER]
]
```
Runtime shape (numbers resolved):
```
[ 8, 2,
  9, "name", 0, [0],
  9, "age", 1, [1]
]
```

### Tagged Union
Type:
```ts
type Shape =
  | { type: "circle"; radius: number }
  | { type: "square"; size: number };
```
Bytecode:
```
[ Op.DUNION, "type", 2,
  "circle", [Op.OBJECT, 2,
    Op.PROPERTY, "type", 0, [Op.LITERAL, "circle"],
    Op.PROPERTY, "radius", 0, [Op.NUMBER]
  ],
  "square", [Op.OBJECT, 2,
    Op.PROPERTY, "type", 0, [Op.LITERAL, "square"],
    Op.PROPERTY, "size", 0, [Op.NUMBER]
  ]
]
```

## Maintenance Checklist
- Update this reference when introducing new opcodes or changing payload layouts.
- Keep examples synchronized with the encoder implementations in `packages/lfp-type-compiler/src/transform/`.
- If runtime validation gains deeper semantics (immutability, branded enforcement, etc.), document the new behavior in the relevant sections above.
