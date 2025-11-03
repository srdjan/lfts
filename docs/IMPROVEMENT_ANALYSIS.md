# LFTS Improvement Analysis: Three Proposals

This document analyzes three potential improvements to LFTS against the project's core philosophy of "composable primitives over layered frameworks."

**Date**: 2025-01-03
**Version**: v0.8.0
**Status**: Analysis complete, recommendations provided

---

## Executive Summary

| Proposal | Philosophy Alignment | Effort | Breaking Changes | Recommendation |
|----------|---------------------|--------|------------------|----------------|
| **1. Generator-Based Effects** | ❌ Poor (1/5) | High | Yes | ❌ **REJECT** |
| **2. Enforced Pattern Matching** | ⚠️ Moderate (3/5) | Medium | Partial | ⚠️ **IMPROVE EXISTING** |
| **3. Exception Prohibition** | ✅ Good (4/5) | Low | Yes | ⏸️ **DEFER TO v1.0** |

**Key Findings**:
- LFTS already has strong functional foundations (99.7% exception-free, Result-based errors)
- Generator-based effects would violate the "direct-style programming" principle
- Pattern matching enforcement exists (LFP1020/LFP1007) but needs refinement, not escalation
- Full exception prohibition is feasible but low priority (only 7 throws in 2,410 lines)

---

## Table of Contents

1. [Proposal 1: Generator-Based Effects](#proposal-1-generator-based-effects)
2. [Proposal 2: Enforced Pattern Matching](#proposal-2-enforced-pattern-matching)
3. [Proposal 3: Exception Prohibition](#proposal-3-exception-prohibition)
4. [Comparison Matrix](#comparison-matrix)
5. [Implementation Roadmap](#implementation-roadmap)
6. [References](#references)

---

## Proposal 1: Generator-Based Effects

### Overview

**Goal**: Replace `Promise`-based async/await with generator/iterator-based effects (Effect-TS style) for better structured concurrency, cancellation, and resource management.

**Proposed API** (conceptual):
```typescript
// Current (direct-style)
async function loadUser(id: UserId): Promise<Result<User, LoadError>> {
  return AsyncResult.try(
    async () => await db.query("SELECT * FROM users WHERE id = ?", [id]),
    (err) => "database_error"
  );
}

// Proposed (generator-based)
function* loadUser(id: UserId) {
  const result = yield* Effect.tryPromise(
    () => db.query("SELECT * FROM users WHERE id = ?", [id]),
    (err) => "database_error"
  );
  return result;
}

// Usage
const program = Effect.gen(function* () {
  const user = yield* loadUser(userId);
  const posts = yield* loadPosts(user.id);
  return { user, posts };
});

await Effect.runPromise(program);
```

### Current State Analysis

**Existing async patterns** (from `docs/EFFECTS_GUIDE.md`):
- Philosophy: "Effects Are Just Async Functions That Can Fail"
- Uses native `Promise` + `async/await` + `Result<T, E>`
- Explicit rejection of monadic effects: *"❌ Not needed: Monadic Effect types - too complex!"*

**AsyncResult helpers** (comprehensive API):
```typescript
AsyncResult.try()        // Wrap throwing async operations
AsyncResult.andThen()    // Chain Result-returning functions
AsyncResult.map()        // Transform success values
AsyncResult.mapErr()     // Transform error values
AsyncResult.all()        // Parallel with fail-fast
AsyncResult.allSettled() // Parallel with error aggregation
AsyncResult.race()       // First-to-complete wins
```

**Statistics**:
- 110 `Promise<Result>` occurrences across 13 files
- 16 port interfaces using `Promise<Result<T, E>>`
- 0 generators in application code (3 in compiler for filesystem walking only)
- Current runtime: 64KB built, 2,410 lines source

### Philosophy Alignment Assessment

**LFTS Simplicity Charter** (`packages/lfts-type-runtime/README.md`):

> "LFTS is committed to maintaining a **minimal, explicit runtime** that provides composable primitives rather than layered frameworks. [...] Favor direct-style programming over monadic abstractions."

**Conflicts with core principles**:

1. **❌ Violates "Direct-Style Programming"**:
   - Current: Uses standard JavaScript async/await
   - Proposed: Requires generator syntax and Effect runners
   - Quote from README: *"Favor direct-style programming over monadic abstractions"*

2. **❌ Violates "Composable Primitives Over Frameworks"**:
   - Current: Simple `AsyncResult` helpers (7 functions)
   - Proposed: Requires Effect monad, interpreters, effect handlers, fiber management
   - This IS a framework, not a primitive

3. **❌ Contradicts Explicit Design Decision**:
   - `docs/FUTURE_DIRECTION.md` explicitly states:
     > "Advanced effect features **not planned**: Effect Tracking Runtime, Monadic Effect<R, E, A> types, Algebraic Effects - these add significant complexity and are better suited for specialized effect systems like ZIO or Effekt. LFTS prioritizes simplicity with direct-style async/await + Result."

**Philosophy Alignment**: ❌ **1/5** (Poor)

### Implementation Complexity

**Required changes**:

1. **Effect runtime** (~500-1000 lines):
   - Generator interpreter/runner
   - Fiber/task management for cancellation
   - Structured concurrency primitives
   - Effect composition operators

2. **Type system integration**:
   - `Effect<R, E, A>` type (requires, error, result)
   - Context/environment management
   - Layer system for dependency injection

3. **Migration burden**:
   - Rewrite 110 `Promise<Result>` functions
   - Update 16 port interfaces
   - Rewrite all async examples and documentation
   - Update compiler policy rules (ports pattern)

**Bundle size impact**: +10-20KB for effect runtime

**Implementation Effort**: **High** (3-4 weeks for runtime, 2-3 weeks for migration)

### Performance Analysis

**Current performance**:
- AsyncResult optimized with Result-based validation (2-5x faster than exceptions)
- Zero overhead for sync operations
- WeakMap caching for DUNION (40x-1,600x speedup)

**Generator-based concerns**:
- Generator overhead: ~5-10% performance penalty
- Fiber allocation cost
- No caching benefits (effects are ephemeral)
- Likely **regression** vs current implementation

### Benefits Analysis

**Claimed benefits**:
1. **Structured concurrency**: Cancel child operations when parent cancels
2. **Explicit dependencies**: Type signature shows environment requirements
3. **Composable effect stacks**: Reader, State, Logger, etc.

**Reality for LFTS**:
1. **Structured concurrency**: Can achieve with `AbortController` + `Promise.withResolvers()` (ES2023)
2. **Explicit dependencies**: Already achieved via Ports pattern + dependency injection
3. **Composable effects**: Not needed - LFTS targets simple domain logic, not complex effect management

**Net benefit**: ❌ **None** - No problem that generators solve better than current approach

### Recommendation

**❌ DO NOT IMPLEMENT**

**Rationale**:
1. Directly contradicts LFTS philosophy and explicit design decisions
2. Massive migration burden with zero practical benefit
3. Introduces framework complexity (Effect monad, runners, fibers)
4. Performance regression likely
5. Bundle size increase contradicts tree-shaking strategy

**Alternative**: If structured concurrency needed, use native `AbortController`:

```typescript
// Native structured concurrency (no generators needed)
const controller = new AbortController();

const loadUser = async (id: UserId, signal: AbortSignal): Promise<Result<User, LoadError>> => {
  return AsyncResult.try(
    async () => await db.query("SELECT ...", [id], { signal }),
    (err) => signal.aborted ? "cancelled" : "database_error"
  );
};

// Cancel all child operations
controller.abort();
```

---

## Proposal 2: Enforced Pattern Matching

### Overview

**Goal**: Make `match()` the *only* allowed control flow for discriminated unions and enums, enforced by compiler Gate/Policy passes.

**Specific requirements**:
- Ban `switch` statements in domain logic
- Ban `if/else` chains for ADT branching
- Require exhaustive `match()` with compile-time verification
- Provide clear error messages for prohibited control flow

### Current State Analysis

**Existing rules**:

1. **LFP1020: no-imperative-branching** (`policy/rules/no-imperative-branching.ts`):
```typescript
export const noImperativeBranchingRule: Rule = {
  meta: {
    id: "LFP1020",
    name: "no-imperative-branching",
    defaultSeverity: "warning", // ⚠️ Warning, not error
    description: "Prefer Result/Option combinators over imperative if/else..."
  },
  analyzeUsage(node, ctx) {
    // Detects: if (result.ok) { ... } else { ... }
    // Suggests: Result.map() or Result.andThen()
    // Allows: Early returns (if (!result.ok) return result;)
  }
};
```

**Test fixture** (`warn_imperative_branching/src/a.ts`):
```typescript
// ⚠️ Triggers LFP1020 warning
export const processUserBad = (result: Result<User, string>): string => {
  if (result.ok) {
    return `User: ${result.value.name}`;
  } else {
    return `Error: ${result.error}`;
  }
};

// ✅ Allowed: Early return pattern
export const validateUser = (result: Result<User, string>) => {
  if (!result.ok) return result;
  // Continue processing...
  return result;
};

// ✅ Better: Use combinators
export const processUserGood = (result: Result<User, string>): string =>
  Result.map(result, user => `User: ${user.name}`)
    .unwrapOr("Error occurred");
```

2. **LFP1007: exhaustive-match** (`policy/rules/exhaustive-match.ts`):
```typescript
export const exhaustiveMatchRule: Rule = {
  meta: {
    id: "LFP1007",
    name: "exhaustive-match",
    defaultSeverity: "error",
    description: "Ensure match() calls handle all ADT variants"
  },
  analyzeUsage(node, ctx) {
    // Validates match(value, cases) has all variants
    // Status: 19/22 tests passing (86%)
    // Known issues: 2 failing tests due to TypeScript API limitations
  }
};
```

**Pattern matching implementation** (`packages/lfts-type-runtime/mod.ts`):
```typescript
// Runtime match() function
export function match<T extends { readonly type: string }, R>(
  value: T,
  cases: { [K in T["type"]]: (v: Extract<T, { type: K }>) => R }
): R {
  const tag = value.type;
  const handler = cases[tag];
  if (typeof handler !== "function") {
    throw new Error(`match: unhandled case '${String(tag)}'`);
  }
  return handler(value);
}
```

**Usage statistics**:
- 25 files use `match()` in examples
- 223 `if` statements across 12 files (mostly legitimate)
- 20+ `switch` statements in compiler internals (opcode dispatch)

**Example usage** (`examples/08-pattern-matching/main.ts`):
```typescript
type Expr =
  | { type: "const"; value: number }
  | { type: "add"; left: Expr; right: Expr }
  | { type: "mul"; left: Expr; right: Expr };

function evaluate(expr: Expr): number {
  return match(expr, {
    const: (node) => node.value,
    add: (node) => evaluate(node.left) + evaluate(node.right),
    mul: (node) => evaluate(node.left) * evaluate(node.right),
  });
}
```

### Philosophy Alignment Assessment

**Alignment with Light-FP**:
- ✅ Pattern matching encourages exhaustiveness and declarative style
- ✅ Reduces bugs from missing cases
- ✅ Better than ad-hoc if/else chains

**Concerns**:
- ⚠️ Full ban on if/else is too restrictive
- ⚠️ Legitimate use cases exist (guards, null checks, early returns)
- ⚠️ Would frustrate developers with false positives

**Philosophy Alignment**: ⚠️ **3/5** (Moderate - concept good, full ban too strict)

### Implementation Complexity

**Option A: Escalate LFP1020 to error**:

```typescript
// Change severity from "warning" to "error"
defaultSeverity: "error"
```

**Problems**:
- Would break legitimate patterns (early returns, guard clauses)
- Too restrictive for practical code

**Option B: Selective enforcement**:

```typescript
// Only enforce for ADT types with discriminant
if (isDiscriminatedUnion(type) && !isEarlyReturn(node)) {
  ctx.report({
    severity: "error",
    message: "Use match() for discriminated unions"
  });
}
```

**Complexity**: Medium (requires type analysis to distinguish ADT if/else from other if/else)

**Option C: Fix LFP1007 exhaustiveness checking**:

**Current issues** (from `docs/KNOWN_ISSUES.md`):
> "LFP1007 exhaustiveness checking has 2 failing tests:
> - fail_extra_match_case: Doesn't detect extra cases
> - fail_non_exhaustive_match: Doesn't detect missing cases
>
> Root cause: TypeScript Compiler API limitations with typeToTypeNode() conversion"

**Fix approach**:
1. Use Type API directly instead of typeToTypeNode()
2. Extract union variants from Type instead of TypeNode
3. Compare with cases object keys

**Complexity**: Medium-High (requires TS internals expertise)

### Legitimate Use Cases for if/else

**Examples that should NOT be banned**:

```typescript
// 1. Early returns (guard clauses)
if (!user) return Result.err("User not found");
if (user.isBlocked) return Result.err("User blocked");

// 2. Null/undefined checks
if (value === null) throw new Error("Unexpected null");
if (cache === undefined) cache = new Map();

// 3. Boolean conditions
if (user.isAdmin) return adminDashboard();
if (count > MAX) return Result.err("Too many items");

// 4. Existence checks
if (cache.has(key)) return cache.get(key);
if (!Object.hasOwn(obj, prop)) return default;

// 5. Validation guards
if (input.length === 0) return Result.err("Empty input");
if (!emailRegex.test(input)) return Result.err("Invalid email");
```

**Only ban**: if/else chains that branch on ADT discriminant:

```typescript
// ❌ This should be banned
if (result.ok) {
  return result.value;
} else {
  return result.error;
}

// ❌ This should be banned
if (expr.type === "const") {
  return expr.value;
} else if (expr.type === "add") {
  return evaluate(expr.left) + evaluate(expr.right);
} else {
  return evaluate(expr.left) * evaluate(expr.right);
}

// ✅ This should be allowed (early return)
if (!result.ok) return result;

// ✅ This should be allowed (guard clause)
if (user === null) return Result.err("Not found");
```

### Benefits Analysis

**Current situation**:
- ✅ LFP1020 educates developers (warning)
- ✅ LFP1007 validates exhaustiveness (with known bugs)
- ⚠️ Developers can ignore warnings
- ⚠️ Exhaustiveness checking unreliable (2 failing tests)

**If escalated to error**:
- ✅ Forces match() usage for ADTs
- ❌ Too restrictive (breaks guards, early returns)
- ❌ Frustrates developers with false positives

**If bugs fixed**:
- ✅ Reliable exhaustiveness checking
- ✅ Catch missing cases at compile time
- ✅ Keep flexibility for legitimate if/else

### Recommendation

**⚠️ IMPROVE EXISTING, DON'T ESCALATE TO FULL BAN**

**Recommended actions**:

1. **✅ Fix LFP1007 exhaustiveness bugs** (Priority: High):
   - Use Type API directly instead of typeToTypeNode()
   - Target: 22/22 tests passing
   - See `docs/KNOWN_ISSUES.md` lines 17-70 for implementation guidance

2. **✅ Keep LFP1020 as warning** (not error):
   - Educates developers without being restrictive
   - Allows legitimate patterns (guards, early returns)

3. **✅ Add opt-in "strict mode"** (Future, v0.9.0+):
   ```json
   // lfts.config.json
   {
     "rules": {
       "no-imperative-branching": {
         "severity": "error",  // Opt-in strict mode
         "allowEarlyReturns": true,
         "allowGuardClauses": true
       }
     }
   }
   ```

4. **✅ Document best practices**:
   - Add section to LANG-SPEC.md on when to use match() vs if/else
   - Provide examples of legitimate if/else patterns

**Alternative approach (future consideration)**:

Consider using `ts-pattern` library more extensively:

```typescript
import { match as tsMatch, P } from "ts-pattern";

// More flexible pattern matching
const result = tsMatch(value)
  .with({ type: "const" }, (node) => node.value)
  .with({ type: "add" }, (node) => evaluate(node.left) + evaluate(node.right))
  .with({ type: "mul" }, (node) => evaluate(node.left) * evaluate(node.right))
  .exhaustive(); // Compile-time exhaustiveness!
```

Benefits:
- Better exhaustiveness checking (library handles it)
- More flexible patterns (guards, nested matching)
- No need to fix LFP1007 bugs (delegate to library)

---

## Proposal 3: Exception Prohibition

### Overview

**Goal**: Enforce that user code never throws exceptions. All errors must be `Result<T, E>` values. Allow catching only at top-level execution boundaries.

**Specific requirements**:
- Ban `throw` statements in user code (Gate/Policy rule)
- Allow `try/catch` only in designated top-level functions
- Convert all domain logic to return `Result<T, E>`
- Provide adapters for third-party libraries that throw

### Current State Analysis

**Exception usage in runtime** (`packages/lfts-type-runtime/mod.ts`):

**Total: 7 throws in 2,410 lines (0.3%)**

1. **Validation depth limit** (1 throw):
```typescript
// Line ~526
if (depth > MAX_DEPTH) {
  throw new Error(`Validation depth exceeded ${MAX_DEPTH} (possible circular reference)`);
}
```

**Category**: Unrecoverable programming error (infinite recursion)

2. **match() exhaustiveness failure** (1 throw):
```typescript
// Line ~1660
export function match<T extends { readonly type: string }, R>(...) {
  const handler = cases[tag];
  if (typeof handler !== "function") {
    throw new Error(`match: unhandled case '${String(tag)}'`);
  }
  return handler(value);
}
```

**Category**: Programming error (should be caught by LFP1007)

3. **Introspection errors** (2 throws in `introspection.ts`):
```typescript
// When using introspection with wrong schema type
throw new Error(`getProperties: expected OBJECT schema, got ${kind}`);
throw new Error(`getVariants: expected DUNION schema, got ${kind}`);
```

**Category**: Programming error (misuse of API)

4. **Pipeline errors** (3 throws in `pipeline.ts`):
```typescript
export class PipelineExecutionError<E = unknown> extends Error {
  constructor(
    message: string,
    public readonly errors: readonly E[],
    public readonly stages: readonly string[]
  ) {
    super(message);
    this.name = "PipelineExecutionError";
  }
}

// Used when pipeline.run() encounters Result.err
throw new PipelineExecutionError(...);
```

**Category**: Optional module (pipeline.ts is separate, experimental)

**Result-based patterns** (dominant):

```typescript
// 43 Result.ok/Result.err in examples
// Example: examples/09-mini-application/main.ts

function applyCommand(tasks: Task[], command: Command): CommandResult {
  return match(command, {
    add: ({ title }) => {
      if (!title.trim()) {
        return Result.err({ type: "invalid", message: "title is empty" });
      }
      const next = [...tasks, { id: nextId, title, done: false }];
      return Result.ok(next);
    },
    toggle: ({ id }) => {
      const index = tasks.findIndex((task) => task.id === id);
      if (index === -1) {
        return Result.err({ type: "not_found", message: `No task with id ${id}` });
      }
      const next = [...tasks];
      next[index] = { ...next[index], done: !next[index].done };
      return Result.ok(next);
    },
  });
}
```

**Try/catch usage**:
- Runtime: 7 catch blocks (mostly wrapping external APIs like URL parsing)
- Compiler: 4 catch blocks (file I/O, JSON.parse)
- Examples: Minimal (Deno file loading, Deno.errors.NotFound)

### Philosophy Alignment Assessment

**LFTS Philosophy**:
> "Surfaces errors as `Result` values (no exceptions)" - README.md

**Current alignment**: ✅ **4/5** (Good - already 99.7% exception-free)

**Remaining exceptions are intentional**:
- Unrecoverable errors (depth limit, circular refs)
- Programming errors (API misuse)
- Optional modules (pipeline.ts)

### Implementation Complexity

**Migration path to zero-throw**:

#### 1. match() exhaustiveness (1 throw)

**Current**:
```typescript
if (typeof handler !== "function") {
  throw new Error(`match: unhandled case '${String(tag)}'`);
}
```

**Option A: Return Result**:
```typescript
export function match<T extends { readonly type: string }, R>(
  value: T,
  cases: Record<string, (v: any) => R>
): Result<R, MatchError> {
  const tag = value.type;
  const handler = cases[tag];
  if (typeof handler !== "function") {
    return Result.err({
      type: "exhaustiveness_failure",
      variant: tag,
      availableCases: Object.keys(cases)
    });
  }
  return Result.ok(handler(value));
}
```

**Breaking change**: Yes - all match() calls must handle Result

**Option B: Keep throw, improve LFP1007**:
- Fix LFP1007 to catch all exhaustiveness bugs at compile time
- Runtime throw becomes unreachable (defensive check only)
- No breaking change

**Recommendation**: **Option B** (fix LFP1007, keep runtime throw as assertion)

#### 2. Introspection errors (2 throws)

**Current**:
```typescript
export function getProperties(schema: TypeObject): PropertyInfo[] {
  const kind = getKind(schema);
  if (kind !== "object") {
    throw new Error(`getProperties: expected OBJECT schema, got ${kind}`);
  }
  // ...
}
```

**Option A: Return Result**:
```typescript
export function getProperties(
  schema: TypeObject
): Result<PropertyInfo[], IntrospectionError> {
  const kind = getKind(schema);
  if (kind !== "object") {
    return Result.err({
      type: "wrong_schema_kind",
      expected: "object",
      actual: kind
    });
  }
  return Result.ok(properties);
}
```

**Breaking change**: Yes - all introspection functions return Result

**Option B: Keep throws (programming errors)**:
- These are API misuse errors (like calling array method on non-array)
- Should fail fast in development
- Can add TypeScript overloads for safety:

```typescript
// Type-safe overloads
function getProperties(schema: ObjectSchema): PropertyInfo[];
function getProperties(schema: TypeObject): PropertyInfo[] | never;
```

**Recommendation**: **Option B for v0.x**, **Option A for v1.0** (breaking change acceptable at major version)

#### 3. Validation depth limit (1 throw)

**Current**:
```typescript
if (depth > MAX_DEPTH) {
  throw new Error(`Validation depth exceeded ${MAX_DEPTH}`);
}
```

**Option: Return VError**:
```typescript
if (depth > MAX_DEPTH) {
  return createVError(
    buildPath(pathSegments),
    `Maximum nesting depth (${MAX_DEPTH}) exceeded`
  );
}
```

**Breaking change**: No - internal implementation detail

**Recommendation**: **Convert to VError** (safe, non-breaking)

#### 4. Pipeline errors (3 throws)

**Current**: Pipeline module throws `PipelineExecutionError`

**Option: Return Result from run()**:
```typescript
// Current
pipeline.run() // throws PipelineExecutionError on failure

// Proposed
pipeline.runSafe(): Result<T, PipelineError>
```

**Breaking change**: Only if removing `run()` - can add `runSafe()` alongside

**Recommendation**: **Add runSafe()**, deprecate `run()`, document migration path

### Benefits Analysis

**Current state benefits**:
- ✅ 99.7% exception-free already
- ✅ Result-based errors are dominant pattern
- ✅ Throws are for unrecoverable/programming errors (appropriate)

**If fully converted to Result**:
- ✅ 100% consistent error handling
- ✅ All errors capturable in types
- ✅ No runtime surprises
- ❌ Verbose API (Result<Result<T, E>, APIError>?)
- ❌ Breaking changes for introspection APIs

### Recommendation

**⏸️ DEFER TO v1.0, INCREMENTAL IMPROVEMENTS NOW**

**Immediate actions (v0.8.x)**:

1. **✅ Document current throws as "programming errors"**:
   - Add section to LANG-SPEC.md explaining the 7 throws
   - Categorize as "assertions" or "contract violations"
   - State that these represent bugs in user code, not recoverable errors

2. **✅ Make pipeline.ts exception-free** (Priority: Medium):
   - Add `runSafe(): Result<T, PipelineError>`
   - Deprecate `run()` in docs
   - Migration guide for existing users

3. **✅ Convert validation depth limit** (Priority: Low):
   - Change throw to return VError (non-breaking)
   - Simple 1-line change

**Future actions (v1.0)**:

4. **⏸️ Convert introspection APIs to Result** (Breaking change):
   ```typescript
   // v1.0 API
   getProperties(schema): Result<PropertyInfo[], IntrospectionError>
   getVariants(schema): Result<VariantInfo[], IntrospectionError>
   ```

5. **⏸️ Consider Result-based match()** (Breaking change):
   - Only if LFP1007 bugs prove unfixable
   - Compile-time exhaustiveness preferable to runtime Result

**Why defer to v1.0**:
- Only 7 throws remaining (minimal impact)
- Most are programming errors (should fail fast)
- Breaking changes acceptable at major version bump
- Current state already very clean (99.7% exception-free)

---

## Comparison Matrix

| Criteria | Generator Effects | Pattern Matching | Exception Prohibition |
|----------|-------------------|------------------|----------------------|
| **Philosophy Alignment** | ❌ Poor (1/5) | ⚠️ Moderate (3/5) | ✅ Good (4/5) |
| **Contradicts Design Docs** | Yes (explicit rejection) | No | No |
| **Implementation Effort** | High (3-4 weeks) | Medium (1-2 weeks) | Low (1-2 days) |
| **Bundle Size Impact** | +10-20KB | +0-1KB | +0KB |
| **Breaking Changes** | Yes (110+ functions) | Partial (if strict) | Yes (API changes) |
| **Migration Complexity** | Very High | Medium | Low |
| **Performance Impact** | Negative (regression) | Neutral | Neutral |
| **Developer Experience** | Negative (new paradigm) | Mixed (restrictive) | Positive (consistency) |
| **Problem Being Solved** | None (no pain point) | Existing bugs (LFP1007) | Consistency (99% → 100%) |
| **Alternative Solutions** | AbortController | Fix bugs + warnings | Document current throws |
| **Community Precedent** | Effect-TS, Effection | Elm, Rust, OCaml | Elm, Rust (panics) |
| **Test Coverage Impact** | High (rewrite needed) | Low (tests exist) | Low (minimal change) |
| **Recommendation** | ❌ **REJECT** | ⚠️ **IMPROVE EXISTING** | ⏸️ **DEFER TO v1.0** |

---

## Implementation Roadmap

### Immediate (v0.8.x - Next 2 weeks)

**Priority 1: Documentation**
- [ ] Document the 7 remaining throws as "programming errors/assertions"
- [ ] Add LANG-SPEC.md section: "When Exceptions Are Appropriate"
- [ ] Update EFFECTS_GUIDE.md with AbortController examples for cancellation

**Priority 2: Quick wins**
- [ ] Convert validation depth throw to VError (1-line change, non-breaking)
- [ ] Add `pipeline.runSafe()` alongside `run()` (exception-free alternative)

### Short-term (v0.9.0 - Next 1-2 months)

**Priority 1: Fix LFP1007 exhaustiveness bugs**
- [ ] Use Type API directly instead of typeToTypeNode()
- [ ] Target: 22/22 tests passing (currently 19/22)
- [ ] See `docs/KNOWN_ISSUES.md` lines 17-70 for implementation details

**Priority 2: Pattern matching improvements**
- [ ] Keep LFP1020 as warning (educate, don't enforce)
- [ ] Consider opt-in strict mode for pattern matching enforcement
- [ ] Evaluate ts-pattern library integration for better exhaustiveness

### Long-term (v1.0 - Future major version)

**Breaking changes acceptable at v1.0**:
- [ ] Convert introspection APIs to Result-based signatures
- [ ] Consider Result-based match() if LFP1007 unfixable
- [ ] Remove deprecated `pipeline.run()` (keep runSafe() only)
- [ ] Full exception prohibition (0 throws in runtime)

**Not planned**:
- ❌ Generator-based effects (rejected - violates philosophy)
- ❌ Full if/else ban (too restrictive)

---

## References

### Internal Documentation

- **Design Philosophy**: `/packages/lfts-type-runtime/README.md` (Simplicity Charter)
- **Effects Guide**: `/docs/EFFECTS_GUIDE.md` (AsyncResult patterns)
- **Known Issues**: `/docs/KNOWN_ISSUES.md` (LFP1007 bugs, lines 17-70)
- **Future Direction**: `/docs/FUTURE_DIRECTION.md` (explicit effect system rejection)
- **Language Spec**: `/docs/LANG-SPEC.md` (Light-FP rules)

### Policy Rules

- **LFP1007**: `/packages/lfts-type-compiler/src/policy/rules/exhaustive-match.ts`
- **LFP1020**: `/packages/lfts-type-compiler/src/policy/rules/no-imperative-branching.ts`
- **Test fixtures**: `/packages/lfts-type-compiler/src/testing/fixtures/`
  - `warn_imperative_branching/` - LFP1020 examples
  - `fail_extra_match_case/` - LFP1007 known issue
  - `fail_non_exhaustive_match/` - LFP1007 known issue

### Code References

- **Runtime**: `/packages/lfts-type-runtime/mod.ts` (2,410 lines, 7 throws)
- **Pipeline**: `/packages/lfts-type-runtime/pipeline.ts` (experimental, 3 throws)
- **Introspection**: `/packages/lfts-type-runtime/introspection.ts` (2 throws)
- **Examples**: `/examples/08-pattern-matching/` (match() usage)
- **Mini app**: `/examples/09-mini-application/main.ts` (Result patterns)

### External Inspiration

**Pattern matching**:
- Rust: `match` keyword with exhaustiveness checking
- Elm: `case` expressions (exhaustive)
- OCaml: `match` with pattern exhaustiveness
- TypeScript: `ts-pattern` library (https://github.com/gvergnaud/ts-pattern)

**Exception handling**:
- Rust: Result<T, E> everywhere, panics for programming errors
- Elm: No exceptions at all (all errors in types)
- Go: Explicit error returns (if err != nil)

**Effect systems** (NOT recommended for LFTS):
- Effect-TS: https://effect.website/
- Effection: https://frontside.com/effection
- ZIO (Scala): https://zio.dev/

---

## Conclusion

LFTS already has strong functional foundations (99.7% exception-free, Result-based errors, pattern matching support). The analysis shows:

1. **Generator-based effects**: ❌ Rejected outright - contradicts core philosophy, no benefits
2. **Enforced pattern matching**: ⚠️ Improve existing rules, fix bugs, keep flexible
3. **Exception prohibition**: ⏸️ Defer to v1.0, document current state, quick wins now

**Key insight**: LFTS doesn't need radical changes. The existing approach is sound. Focus should be on:
- Fixing known bugs (LFP1007 exhaustiveness)
- Documenting best practices
- Incremental improvements to consistency
- Maintaining the "composable primitives over frameworks" philosophy

**Recommendation for user**: Stay the course. The current design is well-aligned with stated goals. Resist the temptation to add complexity (generators) when simpler solutions exist (AbortController, AsyncResult, documented conventions).
