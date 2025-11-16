# Light-FP Type Compiler (Deno-only)

This is an experimental prototype of a minimal Light‑FP TypeScript compiler
that ships **v0.9.0** of the toolchain and runtime:

- Enforces the **Light-FP** subset (no OOP, no decorators, no `this`, no
  mapped/conditional types).
- Compiles `typeOf<T>()` sites into **Deepkit-compatible bytecode** literals
  (Deno-only build task).
- Performs **compiler-only policy enforcement** (no linter): ports/capabilities
  discipline and data-only schemas.

## Packages

```
packages/
  lfts-type-spec/           # pruned bytecode enum & helpers
  lfts-type-compiler/       # Deno-only compiler CLI + passes (gate, policy, transform, emit)
  lfts-type-runtime/        # thin wrapper around @deepkit/type for decode/validate/serialize
deno_example/              # minimal demo wired via deno tasks
```

## Quick start

```sh
deno task build     # runs compiler (gate + policy + transform) on deno_example/src → dist
deno task start     # runs dist/main.js
deno task lint      # lint + check for OOP constructs
```

If any **policy or gate** violation is found, `deno task build` exits non‑zero
with diagnostics. For an end-to-end walkthrough (project layout, schema files,
generated artifacts), read [docs/TUTORIAL.md](docs/TUTORIAL.md).

## Documentation Map

Use this map to jump to the canonical source for each topic (to avoid
duplicate descriptions scattered across docs):

- **Language & Compiler**
  - [docs/LANG-SPEC.md](docs/LANG-SPEC.md) – authoritative Light-FP rules
  - [docs/FEATURES.md](docs/FEATURES.md) – implemented language/runtime features (references LANG-SPEC for rule details)
  - [docs/KNOWN_ISSUES.md](docs/KNOWN_ISSUES.md) – defects tracked at compile time
  - [docs/VALIDATOR_GAPS.md](docs/VALIDATOR_GAPS.md) – known runtime gaps
- **Runtime & Performance**
  - [packages/lfts-type-runtime/README.md](packages/lfts-type-runtime/README.md) – `mod.ts` API, validation, Result/Option/AsyncResult docs
  - [docs/BYTECODE_REFERENCE.md](docs/BYTECODE_REFERENCE.md) – bytecode ops, performance notes
  - [packages/lfts-type-runtime/pipeline.ts](packages/lfts-type-runtime/pipeline.ts) – optional pipeline helpers (see README “Optional Pipeline” section for usage)
- **Patterns & Guides**
  - [docs/EFFECTS_GUIDE.md](docs/EFFECTS_GUIDE.md) – AsyncResult, ports, effect discipline
  - [docs/DISTRIBUTED_GUIDE.md](docs/DISTRIBUTED_GUIDE.md) – distributed helpers module
  - [docs/SCHEMA_GENERATION.md](docs/SCHEMA_GENERATION.md) – schema-root and compiler emission
  - [docs/TUTORIAL.md](docs/TUTORIAL.md) – high-level getting started guide
- **Development**
  - [CONTRIBUTING.md](CONTRIBUTING.md) – Light-FP etiquette + workflow
  - [docs/CLI.md](docs/CLI.md) – CLI usage and flags
  - [CHANGELOG.md](CHANGELOG.md) – release history + migration guidance
  - [docs/FUTURE_DIRECTION.md](docs/FUTURE_DIRECTION.md) – roadmap and open bets

## Core Runtime Surface (mod.ts)

`packages/lfts-type-runtime/mod.ts` is the single public entrypoint for runtime
APIs. The surface is intentionally narrow:

- **Functional results:** `Result`, `Option`, `AsyncResult` (sync + async error handling)
- **Validation helpers:** `validate`, `validateSafe`, `validateAll`, `validateWithResult`
- **Serialization + pattern matching:** `serialize`, `match`
- **Type + introspection:** `typeOf`, `Type` builders (`t`, `primitives`), `introspect`, `inspect`, `withMetadata`
- **Port helpers:** `validatePort`, `getPortName`, `getPortMethods` (treat “Port” and “Capability” suffixes as equivalent)

See [packages/lfts-type-runtime/README.md](packages/lfts-type-runtime/README.md)
for detailed documentation of every export.

## Optional Pipeline Module

Pipeline helpers were extracted in **v0.9.0** into their own optional module.
They are considered advanced helpers and are **not exported** from `mod.ts`.

```ts
import {
  pipe,
  asPipe,
  PipelineExecutionError,
} from "./packages/lfts-type-runtime/pipeline.ts";
```

- Preferred import form: `import { pipe, asPipe, PipelineExecutionError } from "./packages/lfts-type-runtime/pipeline.ts"`.
- `pipe()` + `asPipe()` model the TC39 pipeline proposal while preserving Light-FP guarantees.
- `.run()` throws `PipelineExecutionError` when a stage produces `Result.err`; `.runResult()` stays pure.
- Existing code that imported pipeline APIs from `mod.ts` must now import from the subpath (breaking change noted in CHANGELOG and CLAUDE.md).

## Ports & Capabilities Terminology

“Port” and “Capability” describe the same concept: pure interfaces that model
effects at the boundary. Stick to the `@port` discipline, keep implementation
details in adapters, and validate implementations with
`validatePort`/`getPortName`/`getPortMethods`. Suffix names with either `Port`
or `Capability` consistently so diagnostics stay readable.

## OOP Safeguards

This codebase strictly enforces **Light-FP principles** and prohibits all OOP
constructs:

- ❌ No `class`, `extends`, `implements`, `this`, `super`, `constructor`
- ✅ Pure functions, type aliases, and functional patterns only

**Multiple layers of protection:**

1. **Deno Lint** - `deno task lint` checks before commit
2. **Pre-commit Hook** - Install with `./scripts/install-hooks.sh`
3. **CI Pipeline** - GitHub Actions runs checks on all PRs
4. **Custom Checker** - `scripts/check-no-oop.ts` scans entire codebase

See [CONTRIBUTING.md](CONTRIBUTING.md) for full Light-FP guidelines.

See **LANG-SPEC.md** for the minimal language surface and **guide.mmd** for the
engineering guide.

## New in v0.4.0 (WIP): Prebuilt Type Annotations

**Nominal types** (compile-time only):
- `type UserId = string & Nominal` - Clean nominal typing without runtime cost

**String refinements** (runtime validated):
- `type UserEmail = string & Email` - Email format validation
- `type Website = string & Url` - URL format validation
- `type Phone = string & Pattern<"^\\+?[1-9]\\d{1,14}$">` - Custom regex patterns
- `type Username = string & MinLength<3> & MaxLength<20>` - Length constraints

**Numeric refinements** (runtime validated):
- `type Age = number & Min<0> & Max<120>` - Min/max bounds
- `type Percentage = number & Range<0, 100>` - Range constraint

```ts
import {
  validate,
  typeOf,
  type Nominal,
  type Email,
  type Min,
  type Max,
  type MinLength,
  type MaxLength,
} from "./packages/lfts-type-runtime/mod.ts";

type User = {
  readonly id: string & Nominal;           // Compile-time brand
  readonly email: string & Email;          // Runtime validation
  readonly username: string & MinLength<3> & MaxLength<20>;
  readonly age: number & Min<0> & Max<120>;
};

export const User$ = typeOf<User>();

// Runtime validation
const result = validate(User$, {
  id: "user_123",
  email: "alice@example.com",  // ✅ valid
  username: "alice",             // ✅ valid
  age: 25                        // ✅ valid
});
```

## Distributed Execution Helpers (v0.9.0)

LFTS provides optional helpers for building distributed systems using composable primitives:

**HTTP Adapters** - Schema-validated HTTP client:
```ts
import {
  httpGet,
  httpPost,
  type NetworkError,
} from "./packages/lfts-type-runtime/distributed.ts";

const result = await httpGet<User>(
  "https://api.example.com/users/123",
  UserSchema,
  { timeoutMs: 5000 }
);

if (result.ok) {
  console.log("User:", result.value);
} else {
  // Explicit error handling: timeout | http_error | serialization_error | ...
  console.error("Failed:", result.error);
}
```

**Resilience Patterns** - Composable fault tolerance:
```ts
import {
  withRetry,
  createCircuitBreaker,
  withFallback,
} from "./packages/lfts-type-runtime/distributed.ts";

// Retry with exponential backoff
const result = await withRetry(
  () => httpGet<User>(url, UserSchema),
  {
    maxAttempts: 3,
    shouldRetry: (err) => err.type === "timeout" || err.type === "connection_refused"
  }
);

// Circuit breaker for cascading failure prevention
const breaker = createCircuitBreaker({ failureThreshold: 5 });
await breaker.execute(() => httpGet<Config>(url, ConfigSchema));

// Fallback to cached data
await withFallback(
  httpGet<Config>(remoteUrl, ConfigSchema),
  Promise.resolve(Result.ok(DEFAULT_CONFIG))
);
```

**Features:**
- Zero external dependencies (uses native `fetch`)
- Bundle size: ~6KB minified (tree-shakeable)
- All operations return `Result<T, NetworkError>` for explicit error handling
- Automatic schema validation at network boundaries
- Port pattern for location transparency

See [docs/DISTRIBUTED_GUIDE.md](docs/DISTRIBUTED_GUIDE.md) for complete guide and examples.

Run examples: `deno run -A packages/lfts-type-runtime/distributed-example.ts`

## New in v0.3.0: ADT update

- **Strict ADT discriminant**: the only allowed tag is `'type'` (policy
  `LFP1006`).
- **Exhaustive ADT matching**: `match(value, cases)` helper + compiler policy
  `LFP1007` enforce all variants are handled (no missing or extra tags).

## Canonical Single Syntax

To keep the subset minimal and uniform:

- Data objects: **`type` aliases** only (interfaces are reserved for `@port`).
- Optionals: **`?`** (no `| undefined` on props).
- Arrays: **`T[]`** (no `Array<T>`).
- Readonly arrays: **`readonly T[]`** (no `ReadonlyArray<T>`).
- Readonly objects/tuples: use **`readonly` modifiers** (no `Readonly<…>`).
- Brands: **structural brand** `T & { readonly __brand: "Tag" }` (no
  `Brand<…>`).
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

Keep domain type modules **pure**. Use `*.schema.ts` files to centralize all
`typeOf<T>()` calls.

- Compiler policy **LFP1016** forbids `typeOf<T>()` outside `*.schema.ts`.
- Pattern:
  ```ts
  // user.schema.ts
  import { typeOf } from "../packages/lfts-type-runtime/mod.ts";
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

You can then import `User$` from the built output or reference it within the
module after build.
