# Light-FP Type Compiler (Deno-only)

This is an experimental prototype of a minimal Light‑FP TypeScript compiler that:
- Enforces the **Light Functional** subset (no OOP, no decorators, no `this`, no mapped/conditional types).
- Compiles `typeOf<T>()` sites into **Deepkit-compatible bytecode** literals (Deno-only build task).
- Performs **compiler-only policy enforcement** (no linter): ports/capabilities discipline and data-only schemas.

## Packages

```
packages/
  lfp-type-spec/           # pruned bytecode enum & helpers
  lfp-type-compiler/       # Deno-only compiler CLI + passes (gate, policy, transform, emit)
  lfp-type-runtime/        # thin wrapper around @deepkit/type for decode/validate/serialize
deno_example/              # minimal demo wired via deno tasks
```

## Quick start

```sh
deno task build     # runs compiler (gate + policy + transform) on deno_example/src → dist
deno task start     # runs dist/main.js
deno task lint      # lint + check for OOP constructs
```

If any **policy or gate** violation is found, `deno task build` exits non‑zero with diagnostics.

## OOP Safeguards

This codebase strictly enforces **Light-FP principles** and prohibits all OOP constructs:

- ❌ No `class`, `extends`, `implements`, `this`, `super`, `constructor`
- ✅ Pure functions, type aliases, and functional patterns only

**Multiple layers of protection:**
1. **Deno Lint** - `deno task lint` checks before commit
2. **Pre-commit Hook** - Install with `./scripts/install-hooks.sh`
3. **CI Pipeline** - GitHub Actions runs checks on all PRs
4. **Custom Checker** - `scripts/check-no-oop.ts` scans entire codebase

See [CONTRIBUTING.md](CONTRIBUTING.md) for full Light-FP guidelines.

See **LANG-SPEC.md** for the minimal language surface and **guide.mmd** for the engineering guide.


## New in v0.3.0: ADT update
- **Strict ADT discriminant**: the only allowed tag is `'type'` (policy `LFP1006`).
- **Exhaustive ADT matching**: `match(value, cases)` helper + compiler policy `LFP1007` enforce all variants are handled (no missing or extra tags).


## Canonical Single Syntax
To keep the subset minimal and uniform:

- Data objects: **`type` aliases** only (interfaces are reserved for `@port`).  
- Optionals: **`?`** (no `| undefined` on props).  
- Arrays: **`T[]`** (no `Array<T>`).  
- Readonly arrays: **`readonly T[]`** (no `ReadonlyArray<T>`).  
- Readonly objects/tuples: use **`readonly` modifiers** (no `Readonly<…>`).  
- Brands: **structural brand** `T & { readonly __brand: "Tag" }` (no `Brand<…>`).  
- Nullability: **no `null`** in schemas; use `?` for absence.  
- Enums: use **union of string literals** (no `enum`).  
- Ports: **method signatures** (no property function members).  
- Imports: **`import type`** when type‑only.  
- Assertions: avoid `as` in schema files.


## Release packaging
Create a versioned zip under `./out/` from project sources:

```bash
deno task release
```

## Schema files (*.schema.ts)
Keep domain type modules **pure**. Use `*.schema.ts` files to centralize all `typeOf<T>()` calls.

- Compiler policy **LFP1016** forbids `typeOf<T>()` outside `*.schema.ts`.
- Pattern:
  ```ts
  // user.schema.ts
  import { typeOf } from "../packages/lfp-type-runtime/mod.ts";
  import type { User } from "./types.ts";
  export const User$ = typeOf<User>();
  ```



## Schema-root aliases (v0.2.0)
Prefer **zero-exposure** roots in `*.schema.ts`:
```ts
// user.schema.ts
import type { User } from "./types.ts";
export type UserSchema = User; // compiler emits: export const User$ = [...]
```
You can then import `User$` from the built output or reference it within the module after build.
