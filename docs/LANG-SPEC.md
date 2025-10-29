# Light-FP Language Spec

## Goals
- Provide a **minimal** TypeScript subset suitable for **pure, light functional** programming.
- Generate runtime type information via `typeOf<T>()` encoded as Deepkit-compatible bytecode.
- Enforce discipline **in the compiler** (no external linter).

## Allowed Constructs
- **Types**: `string | number | boolean | null | undefined`, literal types
- **Arrays**: homogeneous arrays (`T[]`)
- **Tuples**: fixed-length, no variadics
- **Objects**: explicit properties; optional (`?`) allowed
- **Unions**: including tagged unions
- **readonly**: shallow on arrays/tuples/objects
- **Intersections**: **only** for nominal branding via `T & Brand<'Tag'>`
- **Functions**: values only (no reflection metadata)

## Disallowed (Gate — fatal)
- OOP: `class`, `extends/implements`, `constructor`, `new`, `super`, `this`
- Decorators (legacy or TC39)
- Type-level features (MVP): mapped types, conditional types, template-literal types, `keyof`,
  indexed/lookup types (`T[K]`), index signatures (`[k: string]: T`), recursive/self-referential types
- Namespaces, enums-as-runtime (enums are treated as unions at type-level only)

## Runtime Model
- `typeOf<T>()` may appear **only in const/initializer positions**. The compiler replaces it with a **bytecode literal**.
- Validation/serialization are provided by the runtime (`@deepkit/type`) using that bytecode.

## Policy (Compiler-enforced)
- **LFP1001 Port Interfaces**: Interfaces marked/suffixed as Ports/Capabilities must contain **functions only**.
- **LFP1002 Ports not in data**: Port types **must not** appear in data schemas (anything that flows into `typeOf<T>()`).
- **LFP1003 Data-only schemas**: Schemas must not contain **function-typed** fields.

## Bytecode Surface (pruned)
- Primitives, literals, arrays, tuples, objects (required/optional), unions, readonly, brand.
- No class/decorator/heritage instructions.

- **LFP1006 Properly discriminated ADTs**: Unions of object variants must use a `'type'` string-literal tag with unique values.
- **LFP1007 Exhaustive match**: Calls to `match(value, cases)` over such ADTs must provide exactly one handler per tag (no missing/extra).


## Canonical Single Syntax
The compiler enforces one way to express each concept:

- Data model objects must be declared as **`type` aliases** (`LFP1008`).  
- Optional properties use `?`, never `| undefined` (`LFP1009`).  
- Arrays: `T[]`; readonly arrays: `readonly T[]`; no `Array<T>`/`ReadonlyArray<T>`/`Readonly<…>` (`LFP1015`).  
- Nominal branding uses **structural brand** only (`LFP1010`).  
- No `null` in schemas (`LFP1011`).  
- Enums are not allowed; use union of literals.  
- Ports must use **method signatures** (`LFP1012`).  
- Type-only imports are required for type-only usage (`LFP1013`).  
- No `as` assertions in files that define schemas (`LFP1014`).



### Diagnostics UX
Compiler diagnostics provide **Quick fix** suggestions (when safe) to guide authors toward the canonical syntax.

- **LFP1016 typeOf only in schema files**: `typeOf<T>()` may only appear in files named `*.schema.ts`. This keeps public domain types free of compiler hooks.



### Schema-root encoding (no helpers)
In files matching `*.schema.ts`, any `export type <Name>Schema = <Type>` is treated as a **schema root**.
During compilation, the transformer generates a sibling `export const <Name>$ = <bytecode>` while leaving the type alias intact.
