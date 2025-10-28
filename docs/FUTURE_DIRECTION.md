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

### Result/Option Combinators

- **Pillars:** Deepens errors-as-values and pure workflows; types-first upheld by tying combinators to branded Result schemas
- **Compiler:** Add policy rule preventing imperative branching inside combinator declarations; transform pass emits canonical wrappers
- **Bytecode:** New `Op.RESULT_OK`, `Op.RESULT_ERR`, `Op.OPTION_SOME`, `Op.OPTION_NONE` for structural tagging
- **Compatibility:** Additive; existing bytecode remains valid

### Runtime Introspection Hooks

- **Pillars:** Supports developers without mutating data path; pure core preserved if hooks are side-effect free snapshots
- **Compiler:** Gate ensures `inspect()` appears only in `*.schema.ts` or designated debug modules; no transform change
- **Bytecode:** Extend metadata table (not opcode) to annotate schema names and source spans
- **Compatibility:** Behind feature flag to keep bundle cost opt-in

---

## Phase 2: Effect Awareness & Contract Safety

**Priority:** Medium effort

### Capability/Port Contract Validation

- **Pillars:** Honors types-first by validating port interfaces; enforces errors-as-values via structured capability diagnostics; pure core maintained if effects stay outside domain
- **Compiler:** Gate bans dynamic method creation on ports; policy enforces explicit `PortSchema` exports; transform emits `Op.PORT` describing method signatures and Result envelopes
- **Bytecode:** Add `Op.PORT`, `Op.METHOD`, `Op.EFFECT_TAG`
- **Compatibility:** Ports optional; data-only projects unaffected

### Effect Tracking Runtime (IO, State)

- **Pillars:** Extends pure core by explicitly labeling effects rather than hiding them; types-first via effect schemas; Result channel carries effect logs
- **Compiler:** New policy ensuring effect-producing functions return `Effect<Result>`; transform expands `effectOf<T>()` to bytecode
- **Bytecode:** Introduce `Op.EFFECT`, `Op.EFFECT_SEQ`, `Op.EFFECT_PAR`
- **Compatibility:** Needs versioned bytecode; older runtime ignores unknown opcodes → require minor version bump

### Memoization & Lazy Evaluation

- **Pillars:** Supports performance while preserving purity (memo tables keyed by validated inputs); types-first by requiring deterministic schemas
- **Compiler:** Policy ensures memoized functions declare referential transparency; transform decorates functions with cache metadata
- **Bytecode:** `Op.MEMO_START`, `Op.MEMO_END`, `Op.LAZY`
- **Compatibility:** Caches optional; default runtime bypasses memo ops if compiled without support

---

## Phase 3: Advanced FP Patterns & Tooling

**Priority:** High effort

### Monadic/Functor Runtime Library

- **Pillars:** Codifies errors-as-values (Either/Result monad), encourages pure transformations; types-first via algebraic schemas for contexts
- **Compiler:** Gate forbids ad-hoc mutation in monad builders; policy requires Kind tagging; transform emits `Op.KIND_MAP`, `Op.KIND_FLATMAP`
- **Bytecode:** New ops for functor/monad combinators
- **Compatibility:** Library-level addition; ensure fallback implementations degrade gracefully

### Debugger & Trace Engine

- **Pillars:** Aids developer insight while keeping execution deterministic; types-first via typed trace entries
- **Compiler:** Optional transform generating trace markers
- **Bytecode:** `Op.TRACE_PUSH`, `Op.TRACE_POP` (stripped in production builds)
- **Compatibility:** Make tracing opt-in with compiler flag

### Cross-runtime Interop (WASM, RPC)

- **Pillars:** Preserves pure core by shipping bytecode to constrained environments; errors-as-values via cross-runtime Result marshalling
- **Compiler:** Transform outputs binary bytecode variant; policy ensures portable subset only
- **Bytecode:** Binary serialization format; no new logical ops
- **Compatibility:** Requires dual emit path (JS + binary); ensure current JS array format still supported

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