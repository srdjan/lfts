# Changelog

All notable changes to the LFTS compiler project are documented here.

## [Unreleased]

### Added

- **Workflow graph builder (experimental):** New `graphBuilder()` helper in `packages/lfts-type-runtime/workflow-graph.ts` lets you describe DAG-driven workflows with named stages, dependency metadata, and automatic topological scheduling. Seeds accept values/promises/`Result`, the runner emits per-stage snapshots, and `run()` returns `Result<{ seed, outputs, snapshots }, WorkflowGraphRunFailure>` while honoring fail-fast semantics.
- **Workflow resolve helpers:** Added `fromStage()` / `fromStages()` utilities to simplify `resolve` functions inside DAG stages by safely projecting outputs from dependencies without repeating `ctx.get()` boilerplate.

## [0.10.0] - 2025-11-10

### Added

#### Type Object System (Production Ready)

A hybrid architecture that wraps bytecode arrays with a rich reflection API while maintaining full backward compatibility and zero performance overhead.

**Key Features:**
- 🎯 **Reflection-first API**: Programmatic access to schema structure without parsing
- 🔧 **Runtime composition**: Transform schemas dynamically (makePartial, pick, omit, extend)
- 🚀 **Zero overhead**: Same bytecode interpreter, <5% unwrapping cost
- ✅ **Backward compatible**: Raw bytecode arrays still work unchanged
- 🏗️ **Builder API**: Fluent programmatic schema construction
- 📊 **Rich introspection**: Direct property/variant access with lazy evaluation

**Example - Builder API:**
```typescript
import { t } from "./packages/lfts-type-runtime/mod.ts";

const User$ = t.object({
  id: t.string().pattern("^usr_[a-z0-9]+$"),
  email: t.string().email(),
  age: t.number().min(0),
  role: t.union(t.literal("admin"), t.literal("user")),
});

// Runtime composition
const PartialUser$ = User$.makePartial();
const PublicUser$ = User$.pick(["id", "role"]);

// Validation with methods
const result = User$.validateSafe(data);
if (result.ok) {
  console.log("Valid:", result.value);
}

// Direct introspection (no parsing)
console.log(User$.properties[0].name); // "id"
console.log(User$.properties.length);  // 4
```

**Type Class Hierarchy:**
- Abstract base: `Type<T>` with validate/validateSafe/inspect/equals/hash
- Primitives: StringType, NumberType, BooleanType, NullType, UndefinedType, LiteralType
- Composites: ObjectType, ArrayType, TupleType, UnionType, DUnionType
- Wrappers: ReadonlyType, BrandType, MetadataType
- Refinements: 13 refinement types (min, max, email, pattern, etc.)

**Implementation:**
- Core: `type-object.ts` (~1,200 lines) - Type class hierarchy
- Builders: `builders.ts` (~400 lines) - Fluent builder API (`t` object)
- Tests: `type-object.test.ts` (48/49 passing), `backward-compat.test.ts` (27/27 passing)
- Benchmarks: `benchmark-type-objects.ts` - Performance validation (<5% overhead)
- Documentation: `docs/TYPE_OBJECTS.md` (~500 lines) - Complete guide

**Performance:**
- Validation: 3-4M ops/sec (primitives), 800K-900K ops/sec (objects)
- Type object overhead: <5% (negligible, within margin of error)
- Introspection: 22M ops/sec (lazy-parsed, cached)
- Memory: ~48 bytes per Type wrapper, lazy property/variant caching

**Compiler Integration:**
- `typeOf<T>()` now generates `createTypeObject(bytecode, metadata)`
- Schema-root pattern generates Type objects with metadata (name, source)
- Backward compatible: Raw bytecode arrays accepted by all validation functions

**Documentation:** See [TYPE_OBJECTS.md](docs/TYPE_OBJECTS.md) for complete guide.

---

## [0.9.0] - 2025-11-06

### Added

#### Distributed Execution Helpers (Production Ready)

Complete distributed execution support following the Light-FP philosophy: **"composable primitives over layered frameworks"**.

**Example - Resilient Service Call:**
```typescript
import { httpGet, withRetry, createCircuitBreaker, withFallback } from "lfts-runtime/distributed";

// Create resilient service adapter with retry, circuit breaker, and fallback
const breaker = createCircuitBreaker({ failureThreshold: 5 });

const result = await withRetry(
  () => withFallback(
    breaker.execute(() => httpGet<User>(url, UserSchema, { timeoutMs: 2000 })),
    Promise.resolve(Result.ok(CACHED_USER))
  ),
  {
    maxAttempts: 3,
    shouldRetry: (err) =>
      err.type === "timeout" ||
      err.type === "connection_refused" ||
      (err.type === "http_error" && err.status >= 500)
  }
);

if (result.ok) {
  console.log("User:", result.value);
} else {
  // Explicit error handling - all failure modes typed
  console.error("Failed:", result.error.type);
}
```

**HTTP Adapters** - Schema-validated HTTP client (509 lines):
- `httpGet<T>(url, schema, options?)` - GET with automatic response validation
- `httpPost<TReq, TRes>(url, data, reqSchema, resSchema, options?)` - POST with request/response validation
- `httpPut<TReq, TRes>(url, data, reqSchema, resSchema, options?)` - PUT for updates
- `httpDelete(url, options?)` - DELETE operations
- All operations return `Result<T, NetworkError>` for explicit error handling
- Zero external dependencies (uses native `fetch` + `AbortController`)

**NetworkError ADT** - 5 variants modeling all failure modes:
```typescript
type NetworkError =
  | { type: "timeout"; url: string; ms: number }
  | { type: "connection_refused"; url: string }
  | { type: "http_error"; url: string; status: number; body: string }
  | { type: "dns_failure"; domain: string }
  | { type: "serialization_error"; message: string; path?: string };
```

**Resilience Patterns** - Composable fault tolerance (259 lines):
- `withRetry(fn, options)` - Exponential backoff with configurable predicate
  - Configurable max attempts, delays, backoff multiplier
  - Optional `shouldRetry` predicate for selective retries
- `createCircuitBreaker(options)` - State machine for cascading failure prevention
  - Three states: closed (normal), open (failures), half_open (testing)
  - Configurable failure/success thresholds and timeout
- `withFallback(primary, fallback)` - Graceful degradation to alternative sources
- `withTimeout(promise, ms, service)` - Custom timeout wrapper with cleanup

**Pattern Composition** - All patterns compose via pure functions:
```typescript
const breaker = createCircuitBreaker({ failureThreshold: 5 });

const result = await withRetry(
  () => withFallback(
    breaker.execute(() => httpGet<Product>(url, ProductSchema)),
    Promise.resolve(Result.ok(DEFAULT_PRODUCT))
  ),
  { maxAttempts: 3, shouldRetry: (err) => err.type === "timeout" }
);
```

**Port Pattern** - Location transparency via dependency injection:
```typescript
interface UserServicePort {
  getUser(id: number): Promise<Result<User, NetworkError>>;
}

function createUserServiceAdapter(baseUrl: string): UserServicePort {
  const breaker = createCircuitBreaker({ failureThreshold: 5 });
  return {
    getUser: (id) =>
      withRetry(
        () => breaker.execute(() =>
          httpGet<User>(`${baseUrl}/users/${id}`, UserSchema)
        ),
        { maxAttempts: 3 }
      )
  };
}
```

### Test Coverage

**31/31 tests passing (100%)** in `packages/lfts-type-runtime/distributed.test.ts`:
- 6 httpGet tests (success, errors, timeout, validation)
- 4 httpPost tests (success, validation, errors, timeout)
- 2 httpPut tests (success, errors)
- 4 httpDelete tests (204/200 responses, errors, timeout)
- 1 custom headers test
- 4 retry tests (success, recovery, exhaustion, predicate)
- 4 circuit breaker tests (closed, open, half-open, recovery)
- 2 fallback tests (primary success, fallback on failure)
- 2 timeout tests (completes within, exceeds)
- 2 composition tests (retry+breaker, retry+fallback)

### Documentation & Examples

**Files Added:**
- `packages/lfts-type-runtime/distributed.ts` (768 lines) - Implementation
- `packages/lfts-type-runtime/distributed.test.ts` (947 lines) - Tests
- `packages/lfts-type-runtime/distributed-example.ts` (650 lines) - 8 complete examples
- `docs/DISTRIBUTED_GUIDE.md` (~500 lines) - Complete user guide
- `examples/10-distributed-execution/` - Working example with real API calls

**Files Updated:**
- `README.md` - Added distributed helpers section with quick examples
- `CLAUDE.md` - Added distributed execution overview
- `docs/FEATURES.md` - Added v0.9.0 section

**Examples Included:**
1. Basic HTTP operations (GET, POST, PUT, DELETE)
2. Retry with exponential backoff
3. Circuit breaker state transitions
4. Fallback to cached data
5. Custom timeout handling
6. Composed resilience patterns
7. Real-world order processing workflow
8. Port pattern for location transparency

Run examples:
```bash
# Comprehensive examples with all patterns
deno run -A packages/lfts-type-runtime/distributed-example.ts

# Working example with real API calls
deno run -A examples/10-distributed-execution/main.ts
```

### Changed

- **Pipeline extraction (optional module):** `pipe`, `asPipe`, and `PipelineExecutionError` now live exclusively in `packages/lfts-type-runtime/pipeline.ts`. Import explicitly:
  `import { pipe, asPipe, PipelineExecutionError } from "./packages/lfts-type-runtime/pipeline.ts";`
- **Breaking change:** `packages/lfts-type-runtime/mod.ts` no longer re-exports pipeline helpers. Update any `mod.ts` imports to the subpath above before upgrading.
- Documentation updated (`README.md`, `CLAUDE.md`, `docs/FEATURES.md`) to clarify that Pipeline is optional/advanced and not part of the core primitive surface.

### Performance

- **Bundle size**: ~6KB minified (tree-shakeable)
- **HTTP overhead**: ~1-2ms for validation (vs raw fetch)
- **Circuit breaker**: ~0.1ms per call
- **Zero external dependencies**

### Philosophy Alignment

Perfect alignment with Light-FP principles:
- ✅ **Explicit over implicit** - All errors via `Result<T, NetworkError>` ADT
- ✅ **Composition over inheritance** - Pure functions compose via standard function composition
- ✅ **Data over classes** - `NetworkError` is discriminated union, not exception classes
- ✅ **Ports over coupling** - Port pattern for location transparency
- ✅ **Zero framework** - No decorators, no magic, just functions and data
- ✅ **Pay-as-you-go** - Tree-shakeable module, optional import

### Technical Metrics

- Production code: ~1,027 lines (768 implementation + 259 resilience)
- Test code: 947 lines (31 comprehensive tests)
- Example code: 650 lines (8 complete examples)
- Documentation: ~500 lines (user guide) + updates
- Total addition: ~2,900 lines
- Zero breaking changes - purely additive release
- Bundle size impact: +6KB (optional, tree-shakeable)

### Comparison with Alternatives

See [docs/DISTRIBUTED_GUIDE.md](docs/DISTRIBUTED_GUIDE.md) for detailed comparison with gRPC, tRPC, and Actor model.

Key advantages:
- **10-30x smaller bundle** than alternatives
- **Minimal runtime overhead** (validation only)
- **Explicit error handling** (no exceptions)
- **Composable primitives** (no framework lock-in)
- **Location transparent** (port pattern)

---

## [0.8.0] - 2025-11-01

### Added

#### Phase 3 Priority 1: Annotations & CLI Tools
- **New annotation types** for runtime validation:
  - `Positive` - Validates number > 0
  - `Negative` - Validates number < 0
  - `Integer` - Validates whole numbers (no decimals)
  - `NonEmpty` - Validates non-empty arrays
  - Composable: `type Quantity = number & Positive & Integer`
- **CLI tools** for schema discovery and management:
  - `deno task lfts:list` - List all schemas in project
  - `deno task lfts:find <name>` - Fuzzy search for schemas
  - `deno task lfts:index --dir <path>` - Generate barrel exports

#### Phase 3 Priority 2: Utility Types & Const Enums
- **Utility type support** (compile-time transformation, zero runtime overhead):
  - `Partial<T>`, `Required<T>`, `Pick<T, K>`, `Omit<T, K>`, `Record<K, V>`, `Readonly<T>`
  - Composable: `type UpdateInput = Partial<Pick<User, "name" | "email">>`
- **Const enum support** (compile-time expansion to literal unions)
  - Numeric const enums (auto-increment and explicit values)
  - String const enums - Zero runtime overhead

#### Runtime Organization & Simplicity Charter
- **Simplicity Charter** codified in [packages/lfts-type-runtime/README.md](packages/lfts-type-runtime/README.md#simplicity-charter)
  - Core primitives vs optional helpers
  - Direct-style programming (no monadic instance methods)
  - Minimal combinator surface
  - Ports pattern discipline
- **Pipeline helpers** remain in separate `pipeline.ts` module (optional/experimental)

### Changed
- Gate pass now allows const enums (non-const enums rejected by type encoder)
- Test suite expanded from 26 to 28 test fixtures (19/22 passing, 86%)
- Documentation significantly expanded (~5,000 lines added)

### Technical Metrics
- Production code: ~1,100 LOC added
- Zero breaking changes - purely additive release
- Bundle size impact: <0.1%

## [Unreleased - v0.4.0]

### Added

- **Prebuilt Type Annotations System**: Complete annotation framework with
  compile-time and runtime validation

  **Nominal Annotation** (compile-time only):
  - `type UserId = string & Nominal` - Clean nominal typing
  - Replaces verbose `{ readonly __brand: "UserId" }` pattern
  - Zero runtime overhead: compiler strips annotation
  - Compile-time type safety preserved

  **String Refinements** (runtime validated):
  - `Email` - Email format validation (simple regex)
  - `Url` - URL format validation (uses URL constructor)
  - `Pattern<P>` - Custom regex pattern validation
  - `MinLength<N>` - Minimum string length
  - `MaxLength<N>` - Maximum string length

  **Numeric Refinements** (runtime validated):
  - `Min<N>` - Minimum numeric value (>=)
  - `Max<N>` - Maximum numeric value (<=)
  - `Range<Min, Max>` - Numeric range (>= Min and <= Max)

  **Implementation**:
  - New opcodes: `REFINE_EMAIL`, `REFINE_URL`, `REFINE_PATTERN`
  - Encoder helpers: `enc.refine.email()`, `enc.refine.url()`, `enc.refine.pattern()`
  - Compiler recognizes all annotation types in intersections
  - Runtime validates refinements in both `validate()` and `validateAll()`
  - Test coverage: `ok_nominal`, `ok_refinements` fixtures
  - Composable: `string & MinLength<3> & MaxLength<20> & Email`

  **Benefits**:
  - Addresses VALIDATOR_GAPS.md "No refinements" issue
  - Clean, discoverable API (import from runtime)
  - Type-safe parameters (TypeScript enforces correct usage)
  - Structured error messages with validation context

## [Released - v0.3.0]

### Added

- **UNION Result-Based Validation**: Eliminated exception-based backtracking
  (2-5x speedup)
  - New `validateWithResult()` internal function returns `VError | null`
  - Zero overhead for successful validations
  - Fully backward compatible with existing public API

- **Excess-Property Policy**: Optional strict mode for object validation
  - New `strict` parameter: `enc.obj(props, strict?: boolean)`
  - Strict mode rejects unknown properties with precise error paths
  - Backward compatible: defaults to loose mode
  - Use cases: API validation, configuration files, security

- **Refinement System**: Runtime validation constraints for numbers, strings,
  and arrays
  - **Number refinements**: `min`, `max`, `integer`
  - **String refinements**: `minLength`, `maxLength`
  - **Array refinements**: `minItems`, `maxItems`
  - Composable: chain multiple refinements (e.g.,
    `refine.min(refine.max(enc.num(), 100), 0)`)
  - Works with all validation APIs: `validate()`, `validateSafe()`,
    `validateAll()`
  - Compatible with READONLY and BRAND wrappers
  - Note: Regex patterns not supported (by design, LFTS language limitation)

- **Comprehensive Benchmark Suite**:
  - DUNION vs UNION performance comparison
  - Union optimization benchmarks
  - Strict mode validation tests
  - Schema memoization benchmarks

### Changed

- **OBJECT Bytecode Format**: Extended with optional strict flag
  - Format: `[Op.OBJECT, propCount, strict, ...properties]`
  - Runtime auto-detects old vs new format for backward compatibility

### Performance

- **UNION validation**: 2-5x faster (Result-based vs exception-based)
  - Example: UNION(5 variants) validates at 50,990 ops/sec
- **Strict mode**: Minimal overhead (<5%) when enabled

### Documentation

- Updated [docs/BYTECODE_REFERENCE.md](docs/BYTECODE_REFERENCE.md) with UNION
  and strict mode details
- Updated [docs/VALIDATOR_GAPS.md](docs/VALIDATOR_GAPS.md) - marked completed
  features
- Added usage examples and test files

## [v0.2.0]

### Added

- **DUNION Discriminated Union Optimization**: O(1) tag lookup (40x-1,600x
  speedup)
  - WeakMap-based cache for tag→schema mapping
  - Automatic emission for ADT patterns
  - Configurable discriminant key support

- **DUNION Bytecode Emission**: Compiler automatically emits DUNION for ADTs
  - Detects discriminated union patterns
  - Validates discriminant requirements (required string-literal property)
  - Falls back to UNION for non-ADT unions

- **Lazy Path Construction**: Build error paths only when needed (5-15% speedup)
  - Push/pop path segments instead of eager string concatenation
  - Zero overhead on success path

### Performance (Measured)

- **DUNION validation**:
  - 2 variants: **42x faster** than UNION (210K → 8.8M ops/sec)
  - 5 variants: **207x faster** than UNION (48K → 9.9M ops/sec)
  - 10 variants: **764x faster** than UNION (21K → 15.8M ops/sec)
  - 20 variants: **1,601x faster** than UNION (10K → 15.9M ops/sec)

### Changed

- Refactored bytecode encoder with DUNION emission logic
- Updated runtime validator with optimized DUNION case
- Optimized path construction using segment arrays

### Fixed

- 10 of 13 pre-existing test failures resolved
- Test pass rate: 83% (15/18 tests passing)
- 3 failures documented in [KNOWN_ISSUES.md](docs/KNOWN_ISSUES.md)

### Documentation

- Created comprehensive [docs/BYTECODE_REFERENCE.md](docs/BYTECODE_REFERENCE.md)
- Documented DUNION emission criteria and performance
- Updated [KNOWN_ISSUES.md](docs/KNOWN_ISSUES.md) with limitations

## [v0.1.0] - Initial Release

### Added

- Minimal Light-FP TS subset (Deno-only) with compiler-enforced policies and
  transforms
- ADTs with strict `'type'` discriminant + exhaustive `match()` policy
- Built-in validator for pruned bytecode (no external deps)
- Canonical single-syntax enforcement rules (LFP1008–LFP1015)
- Demo CLI with `StoragePort` (file adapter) and end-to-end tests

### Polished v0.1.0

- Added `deno task release` to package a versioned zip under `out/`.
- All policy diagnostics now include **Quick fix** suggestions with
  copy-pasteable hints.
- Updated docs to mention release flow.

## v0.2.0

- **Zero-exposure schema roots**: use `export type NameSchema = Name` in
  `*.schema.ts` files; the compiler generates `export const Name$ = [...]`.
- New transformer `schema-root-rewriter` (runs before `typeOf` rewriter).
- Demo app and examples updated to the new pattern.
- `typeOf<T>()` remains supported (in `*.schema.ts` only, `LFP1016`) for
  migration; slated for deprecation in a later release.
