# Engineering Guide (Iteration 1)

## Build Flow
```
parse → LFP Gate (syntax bans)
      → Policy Engine (semantic rules LFP1001–LFP1003)
      → Transform (typeOf<T>() → bytecode literal)
      → Emit
```

## Configuration
`lfp.config.json` controls rule enablement/options (compiler-only).

## Rule Authoring (Single Source of Truth)
- Each rule is defined once (AST + TypeChecker), runs in the compiler, emits **fatal diagnostics**.
- No linter. IDEs surface errors via build or your future language server.

## Deno Tasks
- `deno task build`: compile `deno_example/src` into `dist`, failing on any violation.
- `deno task start`: run the demo program from `dist/`.

## Extending
- Add rules under `packages/lfp-type-compiler/src/policy/rules/` and register them in `engine.ts`.
- Extend the encoder when you expand the allowed type surface (e.g., generics, enums-as-unions helper).

## Limitations (Iteration 1)
- No generics in schemas, no mapped/conditional types.
- `typeOf<T>()` only in initializer sites.
- No function metadata (`.__type`). Only explicit schema constants.


## ADTs & Exhaustive Matching

- Discriminant: **`type`** (string-literal) is the only allowed tag for ADTs.
- Compiler (`LFP1006`) enforces proper discrimination.
- Use `match(value, cases)` from the runtime for exhaustive branching.
- Compiler (`LFP1007`) checks the `cases` object literal is **exactly** the set of tags in the ADT.


## Canonical Single Syntax (How to write code)

**Data models**
```ts
// ✅
export type User = {
  readonly id: string & { readonly __brand: "UserId" };
  readonly name: string;
  readonly email?: string;
};
// ❌ interface User { ... } (LFP1008)
```

**Arrays / readonly**
```ts
// ✅
type T = readonly number[];
// ❌ Array<number>, ReadonlyArray<number>, Readonly<{...}> (LFP1015)
```

**Optionals vs undefined**
```ts
// ✅
type U = { email?: string };
// ❌
type U2 = { email: string | undefined }; // (LFP1009)
```

**Brands**
```ts
// ✅
type UserId = string & { readonly __brand: "UserId" };
// ❌
type UserId = string & Brand<"UserId">; // (LFP1010)
```

**No nulls**
```ts
// ❌
type Bad = { middle: string | null }; // (LFP1011)
```

**Ports**
```ts
/** @port */
export interface ClockPort {
  now(): number;             // ✅ method signature
  // tick: () => void;       // ❌ (LFP1012)
}
```

**Imports**
```ts
// ✅
import type { User } from "./types.ts";
```


### Quick fixes in diagnostics
Whenever possible, diagnostics include a **Quick fix** hint. These are non-binding suggestions meant to be copy/paste friendly and idempotent with our future codemod.

## Schema files only
To avoid exposing compiler internals, place all `typeOf<T>()` calls in `*.schema.ts`. The compiler enforces this via **LFP1016**.



## Using schema-root aliases
1. Define pure domain types in `types.ts`.
2. In `*.schema.ts`, add `export type <Name>Schema = <Type>`.
3. Build with `deno task build`. The compiler emits `const <Name>$ = [...]`.
4. Use the `<Name>$` constants at the edges with the built-in validator.
