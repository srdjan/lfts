# LFTS Future Direction

## Scope Overview

The current runtime executes compiler-emitted opcode arrays to validate unknown
data at the boundary, optionally serialize it without transformation, and
surface errors as values. Gate/policy/transform passes enforce the Light-FP
subset so bytecode contains only canonical data constructs (primitives, objects,
unions, brands, readonly wrappers). The runtime is therefore a **lean validation
VM** with Result-based APIs and DUNION-powered discriminant dispatch.

**Already Implemented (v0.3.0):**
- Result/Option combinators with full API
- LFP1020 policy rule for imperative branching detection
- DUNION tag caching for ADT validation
- Lazy path construction optimization
- Union result-based validation
- Optional strict excess-property checking

---

## Phase 1: Enrich Core Composition

**Priority:** High value, low risk

### Pure Function Pipelines _(Future once `|>` lands)_

- **Status:** Planned enhancement; blocked until the TC39 pipeline operator
  (`|>`) reaches Stage 4 and ships in TypeScript/JavaScript ecosystems. No
  pipeline helper exists in the current runtime.
- **Intended UX:** When the language-level operator is available, LFTS users
  should be able to compose pure, schema-validated functions declaratively:

```ts
// Future: when |> operator is standardized
const result = rawUser
  |> normalizeName
  |> validateEmail
  |> toPersisted;
```

- **Dependency:** We will adopt the canonical TC39 pipeline semantics to avoid
  bespoke syntax. Implementation work begins only after the proposal is
  finalized and TypeScript emits the operator in its downlevel output or native
  targets.
- **Compiler:** Once the operator is supported, the compiler will analyze `|>`
  chains inside schema-approved modules and emit `Op.PIPELINE` metadata
  describing the ordered function handles. Until then, no pipeline-specific
  passes are run.
- **Runtime Support:** The runtime will introduce a pipeline registry and
  executor that short-circuits on the first `Result.Err` while preserving
  type-safe payloads. We will also expose structured diagnostics for each stage
  to keep error reporting aligned with the Result model.
- **Compatibility:** This remains an optional ergonomic layer. Existing
  validators and manual chaining patterns stay valid until the feature becomes
  available.

### Runtime Introspection Hooks

- **Pillars:** Supports developers without mutating data path; pure core
  preserved if hooks are side-effect free snapshots
- **Compiler:** Gate ensures `inspect()` appears only in `*.schema.ts` or
  designated debug modules; no transform change
- **Bytecode:** Extend metadata table (not opcode) to annotate schema names and
  source spans
- **Compatibility:** Behind feature flag to keep bundle cost opt-in

#### Before / After

**Before**

```ts
const validateOrder = (payload: unknown): Result<Order> => {
  const snapshot = JSON.parse(JSON.stringify(payload)); // manual deep copy for debugging
  const result = orderSchema(payload);
  if (result.isErr()) {
    debugBus.emit("order:invalid", { snapshot, issues: result.error.issues }); // no schema metadata
  }
  return result;
};
```

**After**

```ts
const validateOrder = orderSchema.inspect((ctx) => {
  ctx.onFailure((issues) => {
    debugBus.emit("order:invalid", {
      schema: ctx.schemaName, // metadata provided by runtime
      issues,
    });
  });
}); // inspector returns same Result<Order> signature

validateOrder(payload); // hook fires only on failure
```

---

## Prebuilt Type Annotations

- **Status:** Planned enhancement for ergonomic refinements and nominal typing;
  not implemented in the current compiler.
- **Concept:** The runtime exports prebuilt annotation types (like `Nominal`,
  `Email`, `Min<N>`) that developers import and compose via intersections. The
  compiler recognizes these well-known annotations and emits specialized
  bytecode for runtime validation, keeping the syntax clean and discoverable.

**Prebuilt Annotations (exported from runtime):**

```ts
// Nominal typing (compile-time only, no runtime check)
export type Nominal = { readonly __meta?: ["nominal"] };

// String refinements
export type Email = { readonly __meta?: ["email"] };
export type Url = { readonly __meta?: ["url"] };
export type Pattern<P extends string> = { readonly __meta?: ["pattern", P] };
export type MinLength<N extends number> = { readonly __meta?: ["minLength", N] };
export type MaxLength<N extends number> = { readonly __meta?: ["maxLength", N] };

// Numeric refinements
export type Min<N extends number> = { readonly __meta?: ["min", N] };
export type Max<N extends number> = { readonly __meta?: ["max", N] };
export type Range<Min extends number, Max extends number> = {
  readonly __meta?: ["range", Min, Max]
};
```

**Usage (clean and discoverable):**

```ts
import type { Nominal, Email, Min, Max } from "lfts-runtime";

type UserId = string & Nominal;
type UserEmail = string & Email;
type Age = number & Min<0> & Max<120>;
type Username = string & MinLength<3> & MaxLength<20>;

type User = {
  id: UserId;
  email: UserEmail;
  age: Age;
  username: Username;
};
```

- **Compiler Behavior:** During the transform pass the compiler detects
  intersections with well-known annotation types. For each annotation, it emits
  appropriate bytecode:
  - `Nominal` → No runtime check (type-level only)
  - `Email`, `Url` → `Op.REFINE` with pattern validation
  - `Min<N>`, `Max<N>` → `Op.REFINE` with numeric bounds
  - `Pattern<P>` → `Op.REFINE` with custom regex
- **Runtime Support:** The validator executes `Op.REFINE` bytecode and returns
  structured errors when constraints fail, maintaining Result-based error
  reporting.
- **Extensibility:** Users can define custom annotations if needed by following
  the `__meta` convention, but prebuilt annotations cover common cases.
- **Relationship to Existing Features:** Replaces today's verbose brand pattern
  (`string & { readonly __brand: "UserId" }`) with imported annotations, while
  adding runtime validation for refinements that were previously missing.

---

## Phase 2: Effect Awareness & Contract Safety

**Priority:** Medium effort

### Capability/Port Contract Validation

- **Pillars:** Honors types-first by validating port interfaces; enforces
  errors-as-values via structured capability diagnostics; pure core maintained
  if effects stay outside domain
- **Compiler:** Gate bans dynamic method creation on ports; policy enforces
  explicit `PortSchema` exports; transform emits `Op.PORT` describing method
  signatures and Result envelopes
- **Bytecode:** Add `Op.PORT`, `Op.METHOD`, `Op.EFFECT_TAG`
- **Compatibility:** Ports optional; data-only projects unaffected

#### Before / After

**Before**

```ts
type NotificationPort = {
  sendEmail(input: EmailInput): Promise<Result<void>>;
};

const ensureNotificationPort = (port: unknown): Result<NotificationPort> => {
  const candidate = port as Partial<NotificationPort>;
  if (!candidate || typeof candidate.sendEmail !== "function") {
    return Result.err({ capability: "sendEmail", reason: "missing" }); // ad-hoc contract check
  }
  return Result.ok(candidate as NotificationPort);
};
```

**After**

```ts
const NotificationPortSchema = PortSchema.define({
  sendEmail: capabilityOf(emailCapabilitySchema), // declare method signature + Result envelope
});

const ensureNotificationPort = NotificationPortSchema.validate; // returns Result<NotificationPort>

ensureNotificationPort(port); // runtime emits structured capability diagnostics
```

### Effect Tracking Runtime (IO, State)

- **Pillars:** Extends pure core by explicitly labeling effects rather than
  hiding them; types-first via effect schemas; Result channel carries effect
  logs
- **Compiler:** New policy ensuring effect-producing functions return
  `Effect<Result>`; transform expands `effectOf<T>()` to bytecode
- **Bytecode:** Introduce `Op.EFFECT`, `Op.EFFECT_SEQ`, `Op.EFFECT_PAR`
- **Compatibility:** Needs versioned bytecode; older runtime ignores unknown
  opcodes → require minor version bump

#### Before / After

**Before**

```ts
const persistInvoice = async (
  invoice: Invoice,
): Promise<Result<PersistedInvoice>> => {
  const result = await saveInvoice(invoice);
  effectLog.push({ tag: "db.save", payload: invoice }); // developers manage effect logs manually
  return result; // Result payload carries no provenance
};
```

**After**

```ts
const persistInvoice = effectOf<Invoice, PersistedInvoice>(
  "db.save",
  (ctx, invoice) => ctx.perform(saveInvoice, invoice), // runtime records IO + arguments atomically
); // produces Effect<Result<PersistedInvoice>>

persistInvoice.run(invoice).toResult(); // unwrap Result plus effect log metadata
```

### Memoization & Lazy Evaluation

- **Pillars:** Supports performance while preserving purity (memo tables keyed
  by validated inputs); types-first by requiring deterministic schemas
- **Compiler:** Policy ensures memoized functions declare referential
  transparency; transform decorates functions with cache metadata
- **Bytecode:** `Op.MEMO_START`, `Op.MEMO_END`, `Op.LAZY`
- **Compatibility:** Caches optional; default runtime bypasses memo ops if
  compiled without support

#### Before / After

**Before**

```ts
const accountCache = new Map<string, Result<Account>>();

export const loadAccount = (id: AccountId): Result<Account> => {
  const cached = accountCache.get(id.value);
  if (cached) return cached; // manual cache lookup + eager evaluation
  const result = retrieveAccount(id);
  accountCache.set(id.value, result); // developer manages eviction + keying
  return result;
};
```

**After**

```ts
export const loadAccount = memoOf(retrieveAccount, {
  key: (id: AccountId) => id.value, // declarative cache key policy
  orElse: lazyOf(retrieveFromReplica), // lazy fallback stays pure
}); // runtime enforces referential transparency + TTL options

loadAccount(id); // memo metadata compiled into Op.MEMO_* bytecode
```

---

## Phase 3: Advanced FP Patterns & Tooling

**Priority:** High effort

### Monadic/Functor Runtime Library

- **Pillars:** Codifies errors-as-values (Either/Result monad), encourages pure
  transformations; types-first via algebraic schemas for contexts
- **Compiler:** Gate forbids ad-hoc mutation in monad builders; policy requires
  Kind tagging; transform emits `Op.KIND_MAP`, `Op.KIND_FLATMAP`
- **Bytecode:** New ops for functor/monad combinators
- **Compatibility:** Library-level addition; ensure fallback implementations
  degrade gracefully

#### Before / After

**Before**

```ts
const enrichOrder = (input: RawOrder): Result<EnrichedOrder> => {
  const normalized = normalizeOrder(input);
  if (normalized.isErr()) return normalized; // nested guards pile up quickly
  const priced = priceOrder(normalized.value);
  if (priced.isErr()) return priced; // every step repeats the pattern
  return Result.ok(renderConfirmation(priced.value));
};
```

**After**

```ts
const enrichOrder = (input: RawOrder): Result<EnrichedOrder> =>
  ResultMonad.of(input) // proposed Result monad helper
    .map(normalizeOrder) // works like functor map
    .flatMap(priceOrder) // chain Result-returning functions
    .map(renderConfirmation)
    .run(); // unwraps to Result without hand-written control flow
```

### Debugger & Trace Engine

- **Pillars:** Aids developer insight while keeping execution deterministic;
  types-first via typed trace entries
- **Compiler:** Optional transform generating trace markers
- **Bytecode:** `Op.TRACE_PUSH`, `Op.TRACE_POP` (stripped in production builds)
- **Compatibility:** Make tracing opt-in with compiler flag

#### Before / After

**Before**

```ts
export const buildInvoice = (payload: unknown): Result<Invoice> => {
  console.log("buildInvoice:start", payload); // ad-hoc tracing pollutes prod logs
  const result = invoiceSchema(payload);
  console.log("buildInvoice:end", result);
  return result;
};
```

**After**

```ts
export const buildInvoice = withTrace(invoiceSchema, (trace) => {
  trace.push("buildInvoice"); // runtime injects Op.TRACE_* markers
  trace.onFailure((issues) => trace.record("issues", issues)); // structured trace payload
});

buildInvoice(payload, { trace: true }); // opt-in flag emits typed trace frames
```

### Cross-runtime Interop (WASM, RPC)

- **Pillars:** Preserves pure core by shipping bytecode to constrained
  environments; errors-as-values via cross-runtime Result marshalling
- **Compiler:** Transform outputs binary bytecode variant; policy ensures
  portable subset only
- **Bytecode:** Binary serialization format; no new logical ops
- **Compatibility:** Requires dual emit path (JS + binary); ensure current JS
  array format still supported

#### Before / After

**Before**

```ts
const program = compileSchema(orderSchema); // JS opcode array today
const payload = JSON.stringify(program); // developer manages encoding
const bytes = new TextEncoder().encode(payload);
await wasmPort.load(bytes); // host must know JSON envelope schema
```

**After**

```ts
const binaryBundle = emitBytecode(orderSchema, { target: "wasm" }); // compiler emits binary format
await wasmPort.load(binaryBundle.artifact); // runtime metadata drives cross-runtime handshake
await rpcBridge.advertise(binaryBundle.manifest); // share Result contracts across boundaries
```

---

## Prioritization

1. **Phase 1 features** deliver immediate developer benefit with minimal
   compiler churn (pipelines when available, introspection)
2. **Capability validation and memoization** (Phase 2) next—they extend Light-FP
   into service architecture while controlling scope
3. **Advanced FP constructs, tracing, and cross-runtime support** (Phase 3)
   bring significant value but demand careful design and larger surface-area
   changes; schedule after earlier phases ship and stabilize

---

## Trade-offs & Risks

### Complexity Creep

Each feature widens the runtime's mandate; mitigate via opt-in flags and strict
guardrails in policy rules.

### Bundle Size & Performance

New opcodes and helpers expand the runtime. Maintain tree-shakable modules;
monitor bytecode decoding cost.

### Deviation from "Light" Principles

Introducing heavy abstractions (monads, effect systems) risks overwhelming
users. Anchor decisions to Light-FP's simplicity goal—favor composable
primitives over layered frameworks.

### Backward Compatibility

New bytecode ops require version negotiation. Plan semantic versioning and
feature detection to ensure old schemas still run.

### Compiler Maintenance

Additional passes and metadata raise complexity. Keep transformations
incremental and reuse existing schema-root machinery.

---

## Summary

This roadmap keeps the Light-FP philosophy intact—**types-first schemas, pure
domain logic, and Result-based error reporting**—while progressively widening
the runtime from a validation VM into a broader functional toolkit.

---

## Appendix: High-Priority Feature Proposals

This section proposes specific enhancements that address known gaps and
developer pain points.

### Error Aggregation with Limits (High Priority)

**Description**: Collect multiple validation errors instead of failing fast

**Use Cases**:

```ts
// Current: First-failure only
const result = validate(User$, data);
// result.error → single error

// Proposed: Aggregate errors
const result = validateAll(User$, data, { maxErrors: 10 });
// result.errors → [
//   { path: "email", message: "invalid format" },
//   { path: "age", message: "must be >= 0" },
//   { path: "address.zip", message: "required" },
// ]
```

**Benefits**:
- Better UX for form validation
- See all issues in one pass
- Configurable error limit prevents runaway validation

**Implementation**:
- **Runtime**: New `validateAll()` function
- **Bytecode**: No changes, interpreter collects errors
- **Result type**: Supports `ValidationResult<T>` with error array

**Complexity**: Medium
**Related**: Addresses VALIDATOR_GAPS.md #1 "First-failure only"

### Schema Composition Operators

**Description**: Composable schema transformations for common patterns

**Use Cases**:

```ts
import { Schema } from "../runtime/schema.ts";

// Pick subset of properties
const UserSummary$ = Schema.pick(User$, ["id", "name"]);

// Omit sensitive properties
const PublicUser$ = Schema.omit(User$, ["passwordHash", "ssn"]);

// Make all properties optional (for partial updates)
const UserPatch$ = Schema.partial(User$);

// Merge multiple schemas
const ExtendedUser$ = Schema.merge(User$, { createdAt: enc.num() });
```

**Benefits**:
- Reduce schema duplication
- Type-safe schema derivations
- Runtime and compile-time consistency

**Complexity**: Medium

### Async Result/Promise Interop

**Description**: First-class async support for Result combinators

**Use Cases**:

```ts
import { AsyncResult } from "../runtime/combinators.ts";

const loadUser = (id: UserId): AsyncResult<User, string> =>
  AsyncResult.from(fetchUserAPI(id))
    .andThen(validateUserSchema)
    .mapErr(enrichErrorContext)
    .timeout(5000, "User fetch timeout");
```

**Benefits**: Handles real-world async boundaries (DB, HTTP, FS) without Promise
hell

**Complexity**: Medium
**Critical for**: Ports pattern where most I/O is async

### Incremental Compilation

**Description**: Only recompile changed schema files for faster builds

**Use Cases**:

```bash
# Current: Full recompilation on every change
$ deno task build
Compiling 150 .schema.ts files... (3.2s)

# Proposed: Incremental compilation
$ deno task build
Cached: 148 files
Compiling: 2 changed files... (0.2s)
```

**Benefits**:
- Faster development iteration
- Reduced build times for large projects
- Better IDE responsiveness

**Implementation**:
- **Compiler**: Cache bytecode output keyed by file hash
- **CLI**: New `--incremental` flag (default: true)
- **Storage**: `.lfts-cache/` directory with compiled artifacts

**Complexity**: High

### Port Mocking/Stubbing for Tests

**Description**: Generate type-safe mocks for port interfaces

**Use Cases**:

```ts
const mockStorage = PortSchema.mock(StoragePort$, {
  load: () => Result.ok('{"tasks": []}'),
  save: () => Result.ok(undefined),
});

// Type-safe mocks with automatic contract validation
const result = handleCommand(store, clock, io, mockStorage, addCmd);
```

**Benefits**: First-class testing support for ports pattern
**Complexity**: Medium
**Critical for**: Test-driven development with LFTS

---

## Implementation Sequencing Recommendation

### Release v0.4.0 (Next)
- Error Aggregation with configurable limits
- Async Result/Promise interop
- Schema composition operators (pick, omit, partial, merge)
- Incremental compilation support

### Release v0.5.0
- Runtime introspection hooks
- Port mocking/stubbing framework
- Custom type annotations foundation
- Cache eviction policies for memoization

### Release v0.6.0
- Capability/Port contract validation
- Effect tracking runtime (basic IO/State)
- Distributed tracing integration (OpenTelemetry)
- Binary bytecode serialization for WASM/RPC
