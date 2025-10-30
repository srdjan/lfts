# LFTS Future Direction

This document outlines planned features and the development roadmap for LFTS.
For currently implemented features, see [FEATURES.md](FEATURES.md).

---

## Scope Overview

The current runtime executes compiler-emitted opcode arrays to validate unknown
data at the boundary, optionally serialize it without transformation, and
surface errors as values. Gate/policy/transform passes enforce the Light-FP
subset so bytecode contains only canonical data constructs (primitives, objects,
unions, brands, readonly wrappers). The runtime is therefore a **lean validation
VM** with Result-based APIs and DUNION-powered discriminant dispatch.

**For implemented features, see [FEATURES.md](FEATURES.md)**

---

## Phase 1: Enrich Core Composition

**Priority:** High value, low risk

### Pure Function Pipelines _(Future once `|>` lands)_

- **Status:** Runtime bridge shipped via `pipe`/`asPipe` helpers; long-term
  compiler support still blocked until the TC39 pipeline operator (`|>`) reaches
  Stage 4 and ships in TypeScript/JavaScript ecosystems.
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
  bespoke syntax. Compiler work begins once the proposal is finalized and
  TypeScript emits the operator in its downlevel output or native targets.
- **Compiler:** Once the operator is supported, the compiler will analyze `|>`
  chains inside schema-approved modules and emit `Op.PIPELINE` metadata
  describing the ordered function handles. Until then, `pipe()` expressions are
  treated as runtime-only helpers and skipped by pipeline passes.
- **Runtime Support:** The runtime now exposes a pipeline executor (`pipe`,
  `asPipe`) that short-circuits on the first `Result.err`, records stage
  diagnostics, and supports nested pipelines. This layer remains the
  compatibility shim until bytecode-powered pipelines land.
- **Policy:** LFP1030 reserves bitwise `|` for the pipeline shim, so existing
  Light-FP gates stay pure while allowing the new helpers through. Revisit once
  native `|>` semantics are available.
- **Compatibility:** This remains an optional ergonomic layer. Existing
  validators and manual chaining patterns stay valid until the feature becomes
  available.

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

## Appendix: High-Priority Feature Proposals

This section proposes specific enhancements that address known gaps and
developer pain points.

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

**Complexity**: Medium **Critical for**: Ports pattern where most I/O is async

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

**Benefits**: First-class testing support for ports pattern **Complexity**:
Medium **Critical for**: Test-driven development with LFTS

---

## Implementation Sequencing Recommendation

### Release v0.5.0 (Next)

- Async Result/Promise interop
- Schema composition operators (pick, omit, partial, merge)
- Incremental compilation support
- Port mocking/stubbing framework

### Release v0.6.0

- Capability/Port contract validation
- Effect tracking runtime (basic IO/State)
- Cache eviction policies for memoization
- Distributed tracing integration (OpenTelemetry)

### Release v0.7.0

- Monadic/Functor runtime library
- Debugger & Trace Engine
- Binary bytecode serialization for WASM/RPC
- Pure Function Pipelines (when TC39 `|>` is available)

---

## Prioritization

1. **Phase 2 features** (Async interop, schema composition, incremental
   compilation) deliver immediate developer benefit and are independent of
   language features
2. **Capability validation and memoization** extend Light-FP into service
   architecture while controlling scope
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

**For currently implemented features, see [FEATURES.md](FEATURES.md)**
