# LFTS Future Direction & Roadmap

This document outlines **planned features** and future enhancements for LFTS. These are proposals and ideas for future releases, not commitments.

**For currently implemented features, see [FEATURES.md](FEATURES.md).**

---

## Design Philosophy

All future enhancements must align with LFTS's core principles:

### Favor Composable Primitives Over Layered Frameworks

LFTS maintains a **minimal, explicit runtime** that provides composable primitives rather than layered frameworks.

**Core commitments:**
- Provide essential validation and composition primitives
- Keep optional features in separate modules (tree-shakeable)
- Favor direct-style programming over monadic abstractions
- Let applications build domain-specific helpers from basics

**See [packages/lfts-type-runtime/README.md - Simplicity Charter](../packages/lfts-type-runtime/README.md#simplicity-charter) for detailed design principles.**

### Current Scope

The LFTS runtime is a **lean validation VM** that:
- Executes compiler-emitted bytecode to validate unknown data
- Surfaces errors as `Result` values (no exceptions)
- Enforces Light-FP subset through Gate/Policy/Transform passes
- Supports only canonical data constructs (primitives, objects, unions, brands, readonly)
- Uses DUNION-powered O(1) discriminant dispatch for ADTs

---

## Future Enhancements

**Note:** The following features are planned for future releases. For currently implemented features, see [FEATURES.md](FEATURES.md).

---

## Phase 1: Advanced Composition (Future)

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

## Phase 2: Advanced FP Patterns & Tooling

**Priority:** High effort, future releases

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

**Note:** Schema composition (Partial, Pick, Omit, etc.) and AsyncResult helpers are already implemented. See [FEATURES.md](FEATURES.md) for details.

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

### Release v0.7.0+ (Future)

High-priority enhancements:
- Incremental compilation support
- Port mocking/stubbing framework for testing
- Memoization & lazy evaluation

### Release v0.8.0+ (Future)

Advanced features:
- Monadic/Functor runtime library (optional)
- Cache eviction policies for memoization
- Distributed tracing integration (OpenTelemetry)

### Release v0.9.0+ (Future)

Experimental features:
- Debugger & Trace Engine
- Binary bytecode serialization for WASM/RPC
- Native pipeline operator support (when TC39 `|>` is standardized)

---

## Prioritization

1. **Incremental compilation and testing tools** deliver immediate developer benefit
2. **Memoization and lazy evaluation** extend performance optimization capabilities
3. **Advanced FP constructs, tracing, and cross-runtime support** bring significant value but demand careful design and larger surface-area changes

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

This document outlines future enhancements that maintain LFTS's Light-FP philosophy—**types-first schemas, pure domain logic, and Result-based error reporting**—while carefully expanding capabilities through optional, tree-shakeable features.

All proposals prioritize:
- Composable primitives over layered frameworks
- Direct-style programming over complex abstractions
- Zero-cost abstractions and tree-shakeable modules
- Backward compatibility with existing code

**For currently implemented features, see [FEATURES.md](FEATURES.md)**
