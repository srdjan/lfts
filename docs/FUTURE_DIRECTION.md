# LFP Future Direction

## Scope Overview

The current runtime executes compiler-emitted opcode arrays to validate unknown data at the boundary, optionally serialize it without transformation, and surface errors as values. Gate/policy/transform passes enforce the Light-FP subset so bytecode contains only canonical data constructs (primitives, objects, unions, brands, readonly wrappers). The runtime is therefore a **lean validation VM** with Result-based APIs and DUNION-powered discriminant dispatch.

---

## Phase 1: Enrich Core Composition

**Priority:** High value, low risk

### Pure Function Pipelines

- **Pillars:** Reinforces pure core by offering runtime helpers that compose bytecode-validated functions; aligns with types-first via schema-checked inputs/outputs; keeps error-handling as Result
- **Compiler:** Add policy lint ensuring pipeline definitions stay in schema-approved modules; extend transform pass to inline `pipeOf<Fns...>()` metadata (no gate change)
- **Bytecode:** Introduce `Op.PIPELINE` referencing ordered function handles; runtime loads handles from a pure-function registry
- **Compatibility:** Optional API; existing validators untouched

#### Before / After

**Before**

```ts
import { Result } from "../runtime/result.ts"; // manual chaining today

const saveUser = (input: RawUser): Result<PersistedUser> => {
  const normalized = normalizeName(input); // compose work by hand
  if (normalized.isErr()) return normalized; // explicit short-circuit
  const validated = validateEmail(normalized.value);
  if (validated.isErr()) return validated; // repeated guard clauses
  return toPersisted(validated.value); // final conversion
};
```

**After**

```ts
import { pipeOf } from "../runtime/pipelines.ts"; // proposed pipeline helper

const saveUser = pipeOf<RawUser, PersistedUser>( // declare pipeline once
  normalizeName, // each step stays focused
  validateEmail,
  toPersisted,
); // runtime now short-circuits on the first failing stage
```

### Result/Option Combinators

- **Pillars:** Deepens errors-as-values and pure workflows; types-first upheld by tying combinators to branded Result schemas
- **Compiler:** Add policy rule preventing imperative branching inside combinator declarations; transform pass emits canonical wrappers
- **Bytecode:** New `Op.RESULT_OK`, `Op.RESULT_ERR`, `Op.OPTION_SOME`, `Op.OPTION_NONE` for structural tagging
- **Compatibility:** Additive; existing bytecode remains valid

#### Before / After

**Before**

```ts
import { Result } from "../runtime/result.ts"; // manual branching today

const getPrimaryEmail = (emails: string[]): Result<string> => {
  if (emails.length === 0) {
    return Result.err("missing primary email"); // branch for Option-like case
  }
  const primary = normalizeEmail(emails[0]);
  if (!isValidEmail(primary)) {
    return Result.err("invalid email format"); // duplicate error tagging
  }
  return Result.ok(primary);
};
```

**After**

```ts
import { Result, Option } from "../runtime/combinators.ts"; // proposed combinator set

const getPrimaryEmail = (emails: string[]): Result<string> =>
  Option.first(emails) // lift array access into Option
    .okOr("missing primary email") // convert Option → Result declaratively
    .andThen(Result.ensure(isValidEmail, "invalid email format")) // reuse validation helper
    .map(normalizeEmail); // map only runs when previous steps succeed
```

### Runtime Introspection Hooks

- **Pillars:** Supports developers without mutating data path; pure core preserved if hooks are side-effect free snapshots
- **Compiler:** Gate ensures `inspect()` appears only in `*.schema.ts` or designated debug modules; no transform change
- **Bytecode:** Extend metadata table (not opcode) to annotate schema names and source spans
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

## Phase 2: Effect Awareness & Contract Safety

**Priority:** Medium effort

### Capability/Port Contract Validation

- **Pillars:** Honors types-first by validating port interfaces; enforces errors-as-values via structured capability diagnostics; pure core maintained if effects stay outside domain
- **Compiler:** Gate bans dynamic method creation on ports; policy enforces explicit `PortSchema` exports; transform emits `Op.PORT` describing method signatures and Result envelopes
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

- **Pillars:** Extends pure core by explicitly labeling effects rather than hiding them; types-first via effect schemas; Result channel carries effect logs
- **Compiler:** New policy ensuring effect-producing functions return `Effect<Result>`; transform expands `effectOf<T>()` to bytecode
- **Bytecode:** Introduce `Op.EFFECT`, `Op.EFFECT_SEQ`, `Op.EFFECT_PAR`
- **Compatibility:** Needs versioned bytecode; older runtime ignores unknown opcodes → require minor version bump

#### Before / After

**Before**

```ts
const persistInvoice = async (invoice: Invoice): Promise<Result<PersistedInvoice>> => {
  const result = await saveInvoice(invoice);
  effectLog.push({ tag: "db.save", payload: invoice }); // developers manage effect logs manually
  return result; // Result payload carries no provenance
};
```

**After**

```ts
const persistInvoice = effectOf<Invoice, PersistedInvoice>("db.save", (ctx, invoice) =>
  ctx.perform(saveInvoice, invoice) // runtime records IO + arguments atomically
); // produces Effect<Result<PersistedInvoice>>

persistInvoice.run(invoice).toResult(); // unwrap Result plus effect log metadata
```

### Memoization & Lazy Evaluation

- **Pillars:** Supports performance while preserving purity (memo tables keyed by validated inputs); types-first by requiring deterministic schemas
- **Compiler:** Policy ensures memoized functions declare referential transparency; transform decorates functions with cache metadata
- **Bytecode:** `Op.MEMO_START`, `Op.MEMO_END`, `Op.LAZY`
- **Compatibility:** Caches optional; default runtime bypasses memo ops if compiled without support

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

- **Pillars:** Codifies errors-as-values (Either/Result monad), encourages pure transformations; types-first via algebraic schemas for contexts
- **Compiler:** Gate forbids ad-hoc mutation in monad builders; policy requires Kind tagging; transform emits `Op.KIND_MAP`, `Op.KIND_FLATMAP`
- **Bytecode:** New ops for functor/monad combinators
- **Compatibility:** Library-level addition; ensure fallback implementations degrade gracefully

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

- **Pillars:** Aids developer insight while keeping execution deterministic; types-first via typed trace entries
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

- **Pillars:** Preserves pure core by shipping bytecode to constrained environments; errors-as-values via cross-runtime Result marshalling
- **Compiler:** Transform outputs binary bytecode variant; policy ensures portable subset only
- **Bytecode:** Binary serialization format; no new logical ops
- **Compatibility:** Requires dual emit path (JS + binary); ensure current JS array format still supported

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

1. **Phase 1 features** deliver immediate developer benefit with minimal compiler churn (pipelines, combinators, introspection)
2. **Capability validation and memoization** (Phase 2) next—they extend Light-FP into service architecture while controlling scope
3. **Advanced FP constructs, tracing, and cross-runtime support** (Phase 3) bring significant value but demand careful design and larger surface-area changes; schedule after earlier phases ship and stabilize

---

## Trade-offs & Risks

### Complexity Creep
Each feature widens the runtime's mandate; mitigate via opt-in flags and strict guardrails in policy rules.

### Bundle Size & Performance
New opcodes and helpers expand the runtime. Maintain tree-shakable modules; monitor bytecode decoding cost.

### Deviation from "Light" Principles
Introducing heavy abstractions (monads, effect systems) risks overwhelming users. Anchor decisions to Light-FP's simplicity goal—favor composable primitives over layered frameworks.

### Backward Compatibility
New bytecode ops require version negotiation. Plan semantic versioning and feature detection to ensure old schemas still run.

### Compiler Maintenance
Additional passes and metadata raise complexity. Keep transformations incremental and reuse existing schema-root machinery.

---

## Summary

This roadmap keeps the Light-FP philosophy intact—**types-first schemas, pure domain logic, and Result-based error reporting**—while progressively widening the runtime from a validation VM into a broader functional toolkit.
