# LFP Future Direction

## Scope Overview

The current runtime executes compiler-emitted opcode arrays to validate unknown data at the boundary, optionally serialize it without transformation, and surface errors as values. Gate/policy/transform passes enforce the Light-FP subset so bytecode contains only canonical data constructs (primitives, objects, unions, brands, readonly wrappers). The runtime is therefore a **lean validation VM** with Result-based APIs and DUNION-powered discriminant dispatch.

---

## Phase 1: Enrich Core Composition

**Priority:** High value, low risk

### Pure Function Pipelines *(Future once `|>` lands)*

- **Status:** Planned enhancement; blocked until the TC39 pipeline operator (`|>`) reaches Stage 4 and ships in TypeScript/JavaScript ecosystems. No pipeline helper exists in the current runtime.
- **Intended UX:** When the language-level operator is available, LFP users should be able to compose pure, schema-validated functions declaratively:

```ts
// Future: when |> operator is standardized
const result = rawUser
  |> normalizeName
  |> validateEmail
  |> toPersisted;
```

- **Dependency:** We will adopt the canonical TC39 pipeline semantics to avoid bespoke syntax. Implementation work begins only after the proposal is finalized and TypeScript emits the operator in its downlevel output or native targets.
- **Compiler:** Once the operator is supported, the compiler will analyze `|>` chains inside schema-approved modules and emit `Op.PIPELINE` metadata describing the ordered function handles. Until then, no pipeline-specific passes are run.
- **Runtime Support:** The runtime will introduce a pipeline registry and executor that short-circuits on the first `Result.Err` while preserving type-safe payloads. We will also expose structured diagnostics for each stage to keep error reporting aligned with the Result model.
- **Compatibility:** This remains an optional ergonomic layer. Existing validators and manual chaining patterns stay valid until the feature becomes available.

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

---

## Appendix A: Enhancements to Existing Planned Features

This section proposes specific improvements and alternative approaches to the features already outlined above.

### Phase 1 Enhancements

#### Pure Function Pipelines - Enhancements

**1. Type-safe error accumulation in pipelines**

Current proposal assumes first-failure short-circuit. Consider adding parallel validation mode:

```ts
// Enhanced pipeline with error accumulation option
const validateUserInput = pipeOf<RawInput, ValidatedUser>(
  { mode: "accumulate" }, // collect all validation errors
  validateEmail,
  validateAge,
  validateAddress,
);

// Returns Result with either value OR all accumulated errors
const result = validateUserInput(input);
// result.error.issues → [{path: "email", ...}, {path: "age", ...}]
```

**Benefits**: Better UX for form validation scenarios; single validation pass shows all issues
**Complexity**: Medium - requires modifying Result type to support error arrays
**Trade-off**: May conflict with "first-failure" philosophy in VALIDATOR_GAPS.md, but offers pragmatic developer experience

**2. Pipeline branching/conditional stages**

```ts
const processOrder = pipeOf<Order, ProcessedOrder>(
  normalizeOrder,
  branch({
    when: (o) => o.amount > 1000,
    then: applyEnterpriseDiscount,
    else: applyStandardDiscount,
  }),
  calculateTax,
);
```

**Benefits**: Declarative conditional logic without breaking pure pipelines
**Complexity**: Low - syntactic sugar over existing composition
**Consideration**: Ensure branches maintain referential transparency

**3. Pipeline debugging/tracing integration**

```ts
const saveUser = pipeOf<RawUser, PersistedUser>(
  normalizeName,
  validateEmail.trace("email-validation"), // declarative trace points
  toPersisted,
);
```

**Benefits**: Built-in observability without polluting business logic
**Complexity**: Low - integrates with Phase 3 trace engine
**Implementation**: Add optional `.trace()` method to pipeline stages

#### Result/Option Combinators - Enhancements

**1. Async Result/Promise interop**

Current proposal shows sync operations. Add first-class async support:

```ts
import { AsyncResult } from "../runtime/combinators.ts";

const loadUser = (id: UserId): AsyncResult<User> =>
  AsyncResult.from(fetchUserAPI(id))
    .andThen(validateUserSchema)
    .mapErr(enrichErrorContext)
    .timeout(5000, "User fetch timeout");
```

**Benefits**: Handles real-world async boundaries (DB, HTTP, FS) without Promise hell
**Complexity**: Medium - requires AsyncResult monad with proper error channel
**Critical for**: Ports pattern where most I/O is async

**2. Result.collect for batch operations**

```ts
// Validate array of items, collect all errors or return all successes
const results = Result.collect([user1, user2, user3].map(validateUser));
// Result<User[], ValidationError[]> - either all succeed or return all errors
```

**Benefits**: Batch validation for lists without manual iteration
**Complexity**: Low - utility function over existing Result type
**Use case**: Validating imported CSV rows, bulk API responses

**3. Option.zip for combining multiple optional values**

```ts
const fullAddress = Option.zip(
  Option.from(user.street),
  Option.from(user.city),
  Option.from(user.zip),
).map(([street, city, zip]) => `${street}, ${city} ${zip}`);
```

**Benefits**: Cleaner composition when multiple optionals must all be present
**Complexity**: Low - utility function
**Alternative**: Use Result.ensure with validation logic

#### Runtime Introspection Hooks - Enhancements

**1. Schema diffing for migration safety**

```ts
const oldSchema = Task$_v1;
const newSchema = Task$_v2;

const diff = introspect.diff(oldSchema, newSchema);
// { added: ["priority"], removed: [], changed: [{ field: "status", ... }] }

if (!diff.isBackwardCompatible()) {
  throw new Error("Breaking schema change detected");
}
```

**Benefits**: Prevents accidental breaking changes in data contracts
**Complexity**: Medium - requires schema traversal and comparison logic
**Use case**: API versioning, database migrations, stored data validation

**2. Schema-to-JSON-Schema export**

```ts
const jsonSchema = introspect.toJSONSchema(Task$);
// Standard JSON Schema for OpenAPI, documentation, other tools
```

**Benefits**: Interop with existing JSON Schema ecosystem (Swagger, validators)
**Complexity**: Medium - bidirectional mapping between LFP bytecode and JSON Schema
**Addresses**: VALIDATOR_GAPS.md mentions "No JSON Schema export"

**3. Live schema reloading for development**

```ts
if (Deno.env.get("ENV") === "development") {
  introspect.watchSchemas("./src/**/*.schema.ts", {
    onReload: (schemaName) => console.log(`Reloaded: ${schemaName}`),
  });
}
```

**Benefits**: Hot-reload validation schemas without restarting dev server
**Complexity**: High - requires file watching and dynamic schema replacement
**Trade-off**: Dev-only feature, impacts bundle size unless tree-shaken

### Phase 2 Enhancements

#### Capability/Port Contract Validation - Enhancements

**1. Runtime port contract verification**

Current proposal validates method signatures. Add runtime behavior contracts:

```ts
const NotificationPortSchema = PortSchema.define({
  sendEmail: capabilityOf(emailCapabilitySchema)
    .ensures({
      timeout: 5000, // max execution time
      retries: 3, // retry policy
      idempotent: true, // can safely retry
    }),
});

// Wrap adapter with contract enforcement
const wrappedPort = NotificationPortSchema.wrap(emailAdapter);
// Automatically enforces timeout, retries, logs violations
```

**Benefits**: Enforces SLA contracts, prevents runaway operations
**Complexity**: High - requires async interception and policy enforcement
**Consideration**: May require effect tracking (Phase 2) for full implementation

**2. Port mocking/stubbing for tests**

```ts
const mockStorage = PortSchema.mock(StoragePort$, {
  load: () => Result.ok('{"tasks": []}'),
  save: () => Result.ok(true),
});

// Type-safe mocks with automatic contract validation
const result = handleCommand(store, clock, io, mockStorage, addCmd);
```

**Benefits**: First-class testing support for ports pattern
**Complexity**: Medium - code generation for mock implementations
**Critical for**: Test-driven development with LFP

**3. Port composition/delegation**

```ts
// Compose multiple storage backends with fallback
const resilientStorage = PortSchema.compose(
  primaryStorage,
  { fallback: secondaryStorage, cacheLayer: redisCache }
);
```

**Benefits**: Declarative port composition without manual delegation code
**Complexity**: Medium - requires port interceptors and retry logic
**Use case**: Multi-region failover, caching layers, circuit breakers

#### Effect Tracking Runtime - Enhancements

**1. Effect batching and optimization**

```ts
const batchedQueries = effectOf.batch<UserId, User>("db.query", {
  batchSize: 100,
  batchWindow: 10, // ms
  executor: (ids) => db.getUsersBatch(ids),
});

// Automatically batches individual calls into bulk operations
const users = await Promise.all(userIds.map(id => batchedQueries.run(id)));
```

**Benefits**: Automatic N+1 query prevention, better database performance
**Complexity**: High - requires batching queue and deduplication
**Critical for**: Production performance with heavy I/O

**2. Effect replay/time-travel debugging**

```ts
const effectLog = effectOf<Invoice, PersistedInvoice>("db.save",
  (ctx, invoice) => ctx.perform(saveInvoice, invoice),
  { recordInputs: true }
);

// Later: replay effects for debugging
const replay = effectLog.replayFrom(timestamp);
```

**Benefits**: Reproduce production bugs, audit trail for compliance
**Complexity**: High - requires serializable effect logs and replay engine
**Trade-off**: Storage overhead for effect logs

**3. Effect cancellation and cleanup**

```ts
const uploadFile = effectOf<File, URL>("fs.upload", (ctx, file) => {
  const handle = ctx.perform(startUpload, file);

  ctx.onCancel(() => {
    cleanupUpload(handle); // automatic cleanup on cancellation
  });

  return handle;
});

// Cancellation propagates cleanup
const controller = new AbortController();
uploadFile.run(file, { signal: controller.signal });
controller.abort(); // triggers cleanup
```

**Benefits**: Proper resource management, prevents leaks
**Complexity**: High - requires cancellation propagation through effect tree
**Critical for**: Long-running operations, user-initiated cancellations

#### Memoization & Lazy Evaluation - Enhancements

**1. Cache eviction policies**

```ts
export const loadAccount = memoOf(retrieveAccount, {
  key: (id: AccountId) => id.value,
  eviction: {
    strategy: "lru",
    maxSize: 1000,
    ttl: 60_000, // 60 seconds
  },
});
```

**Benefits**: Prevents unbounded memory growth, stale data control
**Complexity**: Medium - requires cache management with size/time policies
**Critical for**: Long-running servers

**2. Conditional memoization**

```ts
export const loadAccount = memoOf(retrieveAccount, {
  key: (id: AccountId) => id.value,
  shouldCache: (result) => result.ok && !result.value.deleted,
  // Don't cache errors or deleted accounts
});
```

**Benefits**: Fine-grained cache control based on result value
**Complexity**: Low - predicate function over result
**Use case**: Skip caching errors, cache only valid states

**3. Distributed/shared cache support**

```ts
export const loadAccount = memoOf(retrieveAccount, {
  key: (id: AccountId) => id.value,
  storage: redisCache, // external cache backend
  serialize: (account) => JSON.stringify(account),
  deserialize: (json) => validate(Account$, JSON.parse(json)),
});
```

**Benefits**: Share cache across multiple processes/servers
**Complexity**: High - requires serialization, external storage integration
**Use case**: Multi-instance deployments, serverless functions

### Phase 3 Enhancements

#### Monadic/Functor Runtime Library - Enhancements

**1. Do-notation syntax sugar**

```ts
// Current proposal requires chaining
const enrichOrder = (input: RawOrder): Result<EnrichedOrder> =>
  ResultMonad.of(input)
    .map(normalizeOrder)
    .flatMap(priceOrder)
    .map(renderConfirmation)
    .run();

// Enhanced: Generator-based do-notation
const enrichOrder = ResultMonad.do(function* (input: RawOrder) {
  const normalized = yield* normalizeOrder(input);
  const priced = yield* priceOrder(normalized);
  return renderConfirmation(priced);
});
```

**Benefits**: More readable for complex flows with intermediate values
**Complexity**: Medium - requires generator support and type inference
**Alternative**: Consider Rust-style `?` operator if TypeScript adds it

**2. Transformer/Lens support for nested updates**

```ts
import { lens } from "../runtime/optics.ts";

const updateAddress = lens<User>()
  .prop("profile")
  .prop("address")
  .prop("street");

const updated = updateAddress.set(user, "123 Main St");
// Immutable deep update without manual spreading
```

**Benefits**: Clean nested immutable updates without spread hell
**Complexity**: Medium - requires type-safe lens implementation
**Use case**: Deep state updates in pure domain logic

**3. Free monad for DSL construction**

```ts
// Define workflow DSL using free monad
type WorkflowF<A> =
  | { tag: "fetch"; url: string; next: (data: unknown) => A }
  | { tag: "validate"; schema: any[]; data: unknown; next: (result: Result<unknown>) => A }
  | { tag: "save"; data: unknown; next: () => A };

const workflow = Free.do(function* () {
  const raw = yield* fetch("/api/users");
  const validated = yield* validate(User$, raw);
  yield* save(validated);
  return validated;
});

// Interpret workflow with different backends (real, mock, test)
const result = await workflow.interpret(productionInterpreter);
```

**Benefits**: Separate workflow definition from execution, testability
**Complexity**: High - advanced FP concept, may violate "Light" principles
**Trade-off**: Powerful but potentially too abstract for target audience

#### Debugger & Trace Engine - Enhancements

**1. Distributed tracing integration (OpenTelemetry)**

```ts
export const buildInvoice = withTrace(invoiceSchema, {
  exportTo: openTelemetryExporter,
  spanName: "validate-invoice",
  attributes: { service: "billing" },
});
```

**Benefits**: Integration with existing observability infrastructure
**Complexity**: Medium - requires OpenTelemetry SDK integration
**Critical for**: Production microservices, observability

**2. Time-travel debugging with snapshots**

```ts
const debugSession = TraceEngine.capture(() => {
  const result = processOrder(rawOrder);
  return result;
});

// Later: step through execution
debugSession.stepForward();
debugSession.stepBackward();
debugSession.inspectState("normalizedOrder");
```

**Benefits**: Interactive debugging for complex validation flows
**Complexity**: Very High - requires execution recording and replay
**Trade-off**: Significant runtime overhead, dev-only feature

**3. Selective tracing with sampling**

```ts
export const buildInvoice = withTrace(invoiceSchema, {
  sampleRate: 0.01, // Trace 1% of invocations
  traceOnError: true, // Always trace failures
});
```

**Benefits**: Reduces tracing overhead in production
**Complexity**: Low - probabilistic sampling logic
**Critical for**: Production performance

#### Cross-runtime Interop - Enhancements

**1. Schema versioning and compatibility checks**

```ts
const binaryBundle = emitBytecode(orderSchema, {
  target: "wasm",
  version: "2.0.0",
  compatibleWith: ["1.x.x"], // semver range
});

// Runtime checks compatibility before loading
await wasmPort.load(binaryBundle, { enforceCompatibility: true });
```

**Benefits**: Safe schema evolution across runtime boundaries
**Complexity**: Medium - requires version metadata and compatibility rules
**Critical for**: Long-lived systems with multiple deployments

**2. Multi-language code generation**

```ts
// Generate validation code for other languages from LFP schemas
const rustCode = codeGen.toRust(orderSchema);
const goCode = codeGen.toGo(orderSchema);

// Share single source of truth across polyglot services
```

**Benefits**: Consistent validation across microservices in different languages
**Complexity**: Very High - requires code generators for each target language
**Alternative**: JSON Schema export (simpler) + language-specific validators

**3. Browser/Worker optimization**

```ts
const binaryBundle = emitBytecode(orderSchema, {
  target: "browser",
  optimize: {
    minify: true,
    stripDebug: true,
    inlineSmallSchemas: true,
  },
});

// Minimal bundle for client-side validation
```

**Benefits**: Smaller bundles, faster client-side validation
**Complexity**: Medium - requires bytecode optimization passes
**Use case**: Form validation, API client libraries

---

## Appendix B: New Feature Proposals

This section proposes entirely new features that would enhance the LFP compiler and runtime.

### B1: Schema-Driven Code Generation (Phase 1-2)

**Description**: Generate boilerplate code from schema definitions

**Use Cases**:
```ts
// Given schema
export type UserSchema = {
  id: UserId;
  name: string;
  email: string;
  role: "admin" | "user";
};

// Compiler generates:
export const User$ = [...]; // bytecode (existing)

// NEW: Generated builders
export const UserBuilder = {
  create: (id: UserId, name: string, email: string, role: "admin" | "user"): User =>
    validate(User$, { id, name, email, role }),

  // Lenses for immutable updates
  update: {
    name: (user: User, name: string): User => ({ ...user, name }),
    email: (user: User, email: string): User => ({ ...user, email }),
  },

  // Type-safe partial constructors
  partial: {
    withName: (name: string) => (user: Partial<User>) => ({ ...user, name }),
  },
};
```

**Benefits**:
- Eliminates manual builder/lens boilerplate
- Type-safe updates without spread operator errors
- Consistent API across all schemas

**Implementation**:
- **Compiler**: New transform pass after schema-root encoding
- **Bytecode**: No new opcodes, uses existing schemas
- **Configuration**: `lfp.config.json` flag `generateBuilders: boolean`

**Complexity**: Medium
- Leverage existing schema AST from typeOf rewriter
- Generate TypeScript declarations alongside bytecode
- Ensure generated code follows LFP rules

**Trade-offs**:
- Increases generated code size
- Opt-in via config to avoid bloat for simple projects
- May conflict with custom builder patterns

### B2: Compile-Time Refinement Validation (Phase 1)

**Description**: Validate refinement constraints at compile-time for literal values

**Use Cases**:
```ts
// Schema with refinements
type PositiveInt = number & { readonly __refine: { min: 1, integer: true } };

// Compile-time error for invalid literals
const age: PositiveInt = -5; // ❌ LFP1017: Value -5 violates refinement min: 1
const price: PositiveInt = 19.99; // ❌ LFP1017: Value 19.99 violates refinement integer: true

// Valid literals pass
const quantity: PositiveInt = 10; // ✅
```

**Benefits**:
- Catch constraint violations before runtime
- No performance overhead for validated constants
- Stronger type safety for configuration values

**Implementation**:
- **Compiler**: New policy rule `compile-time-refinements` (LFP1017)
- **Gate**: No changes
- **Policy**: Analyze literal assignments and check against refinements
- **Transform**: Emit bytecode with refinement annotations

**Complexity**: Medium
- Requires analyzing type refinement annotations
- Check literal values against numeric/string constraints
- Handle const enums and computed constants

**Trade-offs**:
- Only works for literal values (not variables)
- Requires new refinement annotation syntax
- May duplicate TypeScript's type narrowing

**Related**: Addresses VALIDATOR_GAPS.md "No refinements" limitation

### B3: Port Adapter Auto-Generation (Phase 2)

**Description**: Generate port adapter boilerplate from interface definitions

**Use Cases**:
```ts
// Port interface
export interface StoragePort {
  load(): Promise<Result<string>>;
  save(data: string): Promise<Result<void>>;
}

// NEW: Compiler generates adapter template
// storage.adapter.ts (generated)
export function createStorageAdapter(config: StorageConfig): StoragePort {
  return {
    load: async () => {
      // TODO: implement load logic
      return Result.ok("");
    },
    save: async (data: string) => {
      // TODO: implement save logic
      return Result.ok(undefined);
    },
  };
}

// Also generates mock for testing
export const mockStoragePort: StoragePort = {
  load: async () => Result.ok('{"tasks":[]}'),
  save: async (_) => Result.ok(undefined),
};
```

**Benefits**:
- Reduces boilerplate for port implementations
- Ensures adapters match port contracts
- Auto-generated mocks for testing

**Implementation**:
- **Compiler**: New CLI command `deno task lfp:generate-adapter StoragePort`
- **Policy**: Validate port interface before generation
- **Output**: TypeScript files with TODO stubs

**Complexity**: Medium
- Parse port interface declarations
- Generate TypeScript function skeletons
- Handle async/sync Result types

**Trade-offs**:
- Separate CLI step, not automatic compilation
- Generated code requires manual implementation
- May encourage "implement later" technical debt

**Related**: Enhances Phase 2 "Capability/Port Contract Validation"

### B4: Transactional State Updates (Phase 2)

**Description**: Atomic state updates with automatic rollback on validation failure

**Use Cases**:
```ts
import { transaction } from "../runtime/transaction.ts";

// Current: Manual rollback on validation failure
function addTask(store: Store, task: Task): Store {
  const next = new Map(store.tasks);
  next.set(task.id, task);

  try {
    validate(TaskList$, { tasks: Array.from(next.values()) });
    return { tasks: next };
  } catch {
    // Manual cleanup, error-prone
    return store;
  }
}

// NEW: Automatic rollback via transaction
function addTask(store: Store, task: Task): Result<Store> {
  return transaction(() => {
    const next = new Map(store.tasks);
    next.set(task.id, task);

    const validated = validateSafe(TaskList$, { tasks: Array.from(next.values()) });

    if (!validated.ok) {
      // Transaction automatically rolls back
      return Result.err(validated.error);
    }

    return Result.ok({ tasks: next });
  });
}
```

**Benefits**:
- Prevent invalid intermediate states
- Automatic rollback on validation errors
- Cleaner error handling for multi-step updates

**Implementation**:
- **Runtime**: New `transaction()` function with checkpoint/restore
- **Bytecode**: No new opcodes
- **Integration**: Works with existing Result types

**Complexity**: Medium-High
- Requires copy-on-write semantics or structural sharing
- Handle nested transactions
- Performance overhead for large state

**Trade-offs**:
- Memory overhead for state snapshots
- May encourage large state objects (anti-pattern)
- Alternative: Encourage smaller, validatable updates

**Related**: Complements Phase 1 Result combinators

### B5: Branded Newtypes with Runtime Validation (Phase 1)

**Description**: Attach validation logic to brand types for automatic enforcement

**Use Cases**:
```ts
// Current: Manual validation at brand boundaries
export type Email = string & { readonly __brand: "Email" };

function createEmail(raw: string): Result<Email> {
  if (!raw.includes("@")) return Result.err("invalid email");
  return Result.ok(raw as Email);
}

// NEW: Branded type with validation schema
export type Email = string & {
  readonly __brand: "Email";
  readonly __validate: { pattern: /^[^@]+@[^@]+\.[^@]+$/ };
};

// Compiler auto-generates constructor
export const Email = Brand.define<Email>({
  from: (raw: string) => {
    if (!/^[^@]+@[^@]+\.[^@]+$/.test(raw)) {
      return Result.err({ field: "email", message: "invalid format" });
    }
    return Result.ok(raw as Email);
  },
});

// Usage
const email = Email.from("user@example.com"); // Result<Email>
```

**Benefits**:
- Centralized validation for branded types
- Automatic constructor generation
- Type-safe brand boundaries

**Implementation**:
- **Compiler**: Detect brand types with `__validate` property
- **Transform**: Generate Brand.define() constructor
- **Policy**: New rule LFP1018 enforcing validation schema

**Complexity**: Medium
- Parse brand type annotations
- Generate validation functions
- Integrate with existing refinement system

**Trade-offs**:
- Adds new `__validate` magic property
- May duplicate refinement logic
- Increases complexity of brand pattern

**Related**: Addresses VALIDATOR_GAPS.md "No brand-carrying runtime checks"

### B6: Schema Composition Operators (Phase 1)

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

// Make all properties required
const CompleteUser$ = Schema.required(UserDraft$);

// Merge multiple schemas
const ExtendedUser$ = Schema.merge(User$, { createdAt: enc.num() });

// Validate and transform
const result = validate(UserSummary$, data);
```

**Benefits**:
- Reduce schema duplication
- Type-safe schema derivations
- Runtime and compile-time consistency

**Implementation**:
- **Runtime**: New `Schema` utility module
- **Bytecode**: Operate on existing bytecode arrays
- **Types**: Use TypeScript utility types (Pick, Omit, Partial, Required)

**Complexity**: Medium
- Traverse and transform bytecode at runtime
- Ensure type-level and runtime-level stay synchronized
- Handle nested schemas and unions

**Trade-offs**:
- Runtime schema manipulation has cost
- May conflict with "explicit schema" philosophy
- Alternative: Code generation at compile-time

**Related**: Common request in schema libraries (Zod, Yup)

### B7: Incremental Compilation (Phase 1)

**Description**: Only recompile changed schema files for faster builds

**Use Cases**:
```bash
# Current: Full recompilation on every change
$ deno task build
Compiling 150 .schema.ts files... (3.2s)

# NEW: Incremental compilation
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
- **Storage**: `.lfp-cache/` directory with compiled artifacts

**Complexity**: High
- Dependency tracking between schema files
- Cache invalidation on schema changes
- Handle transitive dependencies

**Trade-offs**:
- Additional disk space for cache
- Complexity in cache invalidation logic
- May mask errors from stale cache

**Related**: Standard feature in modern compilers (tsc, Rust, etc.)

### B8: Error Aggregation with Limits (Phase 1)

**Description**: Collect multiple validation errors instead of failing fast

**Use Cases**:
```ts
// Current: First-failure only
const result = validateSafe(User$, data);
// result.error → single error

// NEW: Aggregate errors
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
- **Result type**: Already supports `ValidationResult<T>` with error array

**Complexity**: Medium
- Modify validator to continue after errors
- Track error count and respect limit
- Aggregate errors from nested structures

**Trade-offs**:
- Performance cost of continuing validation after errors
- May produce confusing cascading errors
- Configurable limit mitigates unbounded work

**Related**: VALIDATOR_GAPS.md lists this as "High Priority" (#1)

### B9: Port Contract Testing Framework (Phase 2)

**Description**: Automated contract testing for port implementations

**Use Cases**:
```ts
// Define port contract tests
const StoragePortTests = PortContract.define(StoragePort$, {
  tests: {
    "should load empty string on first run": async (port) => {
      const result = port.load();
      assert(result === "");
    },

    "should persist and retrieve data": async (port) => {
      const data = JSON.stringify({ tasks: [] });
      const saved = port.save(data);
      assert(saved === true);

      const loaded = port.load();
      assert(loaded === data);
    },

    "should be idempotent": async (port) => {
      const data = JSON.stringify({ tasks: [] });
      port.save(data);
      port.save(data);
      // Should not error on duplicate save
    },
  },

  properties: {
    idempotent: ["save"],
    timeout: { load: 1000, save: 1000 },
  },
});

// Run tests against implementation
const fileStorage = fileStorageAdapter("/tmp/test.json");
await StoragePortTests.verify(fileStorage);
```

**Benefits**:
- Ensure adapters satisfy port contracts
- Reusable test suites for all implementations
- Property-based testing for ports

**Implementation**:
- **Runtime**: New `PortContract` testing framework
- **Integration**: Works with Deno test runner
- **Policy**: Validate contract definitions

**Complexity**: High
- Define contract testing DSL
- Generate test cases from properties
- Handle async/cleanup for stateful ports

**Trade-offs**:
- New testing abstraction to learn
- May duplicate existing test logic
- Requires discipline to maintain contracts

**Related**: Enhances Phase 2 port validation

### B10: Query DSL for Data Transformation (Phase 2)

**Description**: Type-safe query language for filtering and transforming validated data

**Use Cases**:
```ts
import { Query } from "../runtime/query.ts";

// Type-safe queries over validated data
const activeAdminUsers = Query.from(users)
  .where(u => u.role === "admin")
  .where(u => u.active === true)
  .select(u => ({ id: u.id, name: u.name }))
  .sortBy(u => u.name)
  .take(10);

// Compiles to efficient iteration, no ORM overhead
const results = activeAdminUsers.execute(); // { id: UserId, name: string }[]
```

**Benefits**:
- Declarative data transformation
- Type-safe field access and filtering
- No runtime query parsing

**Implementation**:
- **Runtime**: Query builder with type-safe combinators
- **Bytecode**: No changes, operates on validated data
- **Types**: Leverage TypeScript's type inference

**Complexity**: Medium
- Implement query combinators (where, select, sortBy, etc.)
- Ensure type safety through builder pattern
- Optimize for common patterns (indexed access)

**Trade-offs**:
- Not a full query engine (no joins, aggregations)
- May encourage data transformation in domain layer (anti-pattern)
- Alternative: Use standard Array methods

**Related**: Lightweight alternative to ORMs for pure FP

### B11: Compile-Time Schema Validation (Phase 1)

**Description**: Catch invalid schemas at compile-time instead of runtime

**Use Cases**:
```ts
// Current: Runtime error during validation
export type BadSchema = {
  callback: () => void; // Functions not allowed in schemas
};
export const BadSchema$ = typeOf<BadSchema>(); // ❌ Runtime error

// NEW: Compile-time error
export type BadSchema = {
  callback: () => void;
};
export const BadSchema$ = typeOf<BadSchema>();
// ❌ LFP1003: Data schema contains function-typed field 'callback'
```

**Benefits**:
- Faster feedback cycle (compile vs runtime)
- Catch errors before tests/production
- Consistent with other LFP policy rules

**Implementation**:
- **Compiler**: Analyze `typeOf<T>()` type argument in policy pass
- **Policy**: Extend data-no-functions rule to typeOf call sites
- **Gate**: No changes

**Complexity**: Low
- Reuse existing policy rules
- Check type argument before transform

**Trade-offs**:
- Already partially implemented (data-no-functions rule)
- May not catch all cases due to TypeScript API limitations
- Complements runtime validation, doesn't replace it

**Related**: Moves error detection earlier in development cycle

### B12: Schema Registry for Shared Contracts (Phase 3)

**Description**: Centralized registry for sharing schemas across modules/services

**Use Cases**:
```ts
// Register schemas globally
SchemaRegistry.register("User", User$);
SchemaRegistry.register("Task", Task$);

// Use schemas by name (no import needed)
const user = validate(SchemaRegistry.get("User"), data);

// Cross-service schema sharing
const manifest = SchemaRegistry.export();
await rpcBridge.publishSchemas(manifest);

// Client fetches schemas
const remoteUser$ = await rpcBridge.fetchSchema("User");
```

**Benefits**:
- Decouple schema definition from usage
- Enable dynamic schema loading
- Share contracts across network boundaries

**Implementation**:
- **Runtime**: Global `Map<string, Bytecode>` registry
- **Compiler**: Optional schema export manifest
- **Serialization**: Binary bytecode format for network transfer

**Complexity**: High
- Schema versioning and compatibility
- Registry invalidation on schema changes
- Security concerns (schema injection)

**Trade-offs**:
- Global state (may conflict with pure FP principles)
- Tight coupling to registry
- Alternative: Explicit imports (current approach)

**Related**: VALIDATOR_GAPS.md mentions "No schema registry"

---

## Prioritization Matrix

### High Value, Low Effort (Ship First)
1. **B8: Error Aggregation** - Addresses #1 gap in VALIDATOR_GAPS.md
2. **B6: Schema Composition** - Common pain point, pure runtime
3. **B11: Compile-Time Validation** - Small compiler enhancement
4. **B7: Incremental Compilation** - Direct developer productivity win

### High Value, Medium Effort (Next Phase)
5. **B1: Schema-Driven Code Generation** - Reduces boilerplate significantly
6. **B5: Branded Newtypes with Validation** - Strengthens type safety
7. **B2: Compile-Time Refinements** - Early error detection
8. **B4: Transactional State Updates** - Safety for complex updates

### High Value, High Effort (Long-Term)
9. **B3: Port Adapter Auto-Generation** - Major ports pattern enhancement
10. **B9: Port Contract Testing** - Essential for production ports
11. **B12: Schema Registry** - Enables distributed systems

### Lower Priority (Optional/Niche)
12. **B10: Query DSL** - Niche use case, standard Array methods work
13. **Free Monads** (A3.3) - Too abstract for "Light" FP
14. **Time-Travel Debugging** (A3.2) - High cost, dev-only

---

## Implementation Sequencing Recommendation

### Iteration 2 (Next Release)
- B8: Error Aggregation
- B11: Compile-Time Schema Validation
- B7: Incremental Compilation
- Phase 1 Enhancements: Async Result, Pipeline tracing

### Iteration 3 (Following Release)
- B1: Schema-Driven Code Generation
- B6: Schema Composition Operators
- B5: Branded Newtypes with Validation
- Phase 2 Enhancements: Port mocking, Cache eviction

### Iteration 4 (Future)
- B2: Compile-Time Refinements
- B3: Port Adapter Auto-Generation
- B4: Transactional State Updates
- Phase 3 Enhancements: OpenTelemetry integration

---

## Summary

This roadmap keeps the Light-FP philosophy intact—**types-first schemas, pure domain logic, and Result-based error reporting**—while progressively widening the runtime from a validation VM into a broader functional toolkit.
