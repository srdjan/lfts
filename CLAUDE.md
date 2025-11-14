# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with
code in this repository.

## Project Overview

This is a **Light-FP TypeScript compiler** prototype that enforces a minimal
functional programming subset and compiles `typeOf<T>()` calls into
Deepkit-compatible bytecode literals.

**Current Version**: v0.9.0 (Released 2025-11-06)

**Key Philosophy**: "Composable primitives over layered frameworks" - LFTS provides minimal, composable building blocks rather than heavy abstractions. All error handling is explicit via `Result<T, E>` types, no magic or decorators, and strict enforcement of functional programming discipline.

**Essential Documentation:**
- [LANG-SPEC.md](docs/LANG-SPEC.md) - **START HERE** - Light-FP language specification and rules
- [FEATURES.md](docs/FEATURES.md) - Currently implemented features (comprehensive)
- [BYTECODE_REFERENCE.md](docs/BYTECODE_REFERENCE.md) - Bytecode format, opcodes, and performance analysis
- [EFFECTS_GUIDE.md](docs/EFFECTS_GUIDE.md) - Effect handling with ports and AsyncResult
- [DISTRIBUTED_GUIDE.md](docs/DISTRIBUTED_GUIDE.md) - Distributed execution with HTTP adapters and resilience patterns
- [CLI.md](docs/CLI.md) - Command-line tools (list-schemas, find-schema, generate-index)
- [KNOWN_ISSUES.md](docs/KNOWN_ISSUES.md) - Known limitations and workarounds
- [VALIDATOR_GAPS.md](docs/VALIDATOR_GAPS.md) - Runtime validator limitations
- [SCHEMA_GENERATION.md](docs/SCHEMA_GENERATION.md) - Why explicit schemas vs runtime reflection
- [FUTURE_DIRECTION.md](docs/FUTURE_DIRECTION.md) - Planned features and roadmap
- [CONTRIBUTING.md](CONTRIBUTING.md) - Contribution guidelines and Light-FP discipline
- [CHANGELOG.md](CHANGELOG.md) - Version history and release notes

**What's New in v0.9.0:**
- ✅ **Distributed execution helpers** - Production-ready HTTP adapters with schema validation
- ✅ **Resilience patterns** - Retry, circuit breaker, fallback, timeout (all composable)
- ✅ **NetworkError ADT** - 5 variants modeling all network failure modes
- ✅ **31/31 tests passing** - Complete test coverage for distributed features
- ✅ **Example 10** - Complete distributed execution tutorial
- ✅ **Zero dependencies** - Uses native `fetch` + `AbortController`

The compiler performs three passes:

1. **Gate pass** - Rejects disallowed syntax (OOP constructs, decorators, mapped/conditional types)
2. **Policy pass** - Enforces semantic rules (ports discipline, data-only schemas, canonical forms)
3. **Transform pass** - Rewrites `typeOf<T>()` → bytecode literals

## Development Commands

```bash
# Build the example project (runs full compiler pipeline)
deno task build

# Run the compiled output
deno task start

# Run compiler golden tests
deno task test

# Run demo CLI application
deno task demo

# Run demo app tests
deno task test:app
deno task test:app:all

# Create release package
deno task release

# Run performance benchmarks
deno run -A packages/lfts-type-runtime/benchmark.ts
deno run -A packages/lfts-type-runtime/benchmark-union.ts

# CLI tools (v0.8.0+)
deno task lfts:list              # List all schemas in project
deno task lfts:find User         # Find schemas by name
deno task lfts:index --dir src   # Generate barrel exports

# OOP safeguards (v0.9.0+)
deno task lint                   # Lint + check for OOP constructs
./scripts/install-hooks.sh       # Install pre-commit hooks
deno run -A scripts/check-no-oop.ts  # Scan for banned OOP patterns
```

## Test Suite Status

**Current**: 19/22 tests passing (86% pass rate) - All core features working

**Distributed execution**: 31/31 tests passing (100% pass rate) - Production ready

The compiler test suite has 22 golden tests in
[packages/lfts-type-compiler/src/testing/fixtures/](packages/lfts-type-compiler/src/testing/fixtures/).
As of v0.8.0:

- ✅ **19 tests passing** - All core LFTS rules + utility types + const enums working
- ❌ **3 tests failing** - Known limitations documented in
  [KNOWN_ISSUES.md](docs/KNOWN_ISSUES.md)

### Known Failing Tests (Expected Failures)

These 3 test failures are documented limitations, not regressions:

1. **fail_extra_match_case** (LFP1007) - Exhaustive match checking doesn't work
   due to TypeScript Compiler API limitations
2. **fail_non_exhaustive_match** (LFP1007) - Same root cause as above
3. **fail_type_only_import** (LFP1013) - Type-only import detection needs AST
   navigation improvements

See [KNOWN_ISSUES.md](docs/KNOWN_ISSUES.md) for detailed technical analysis and
potential fixes for future contributors.

### What Works

All essential LFTS enforcement rules are functional:

- Port interface validation and discipline
- ADT discriminated union validation
- Data schema purity (no functions, no null)
- Interface vs type alias enforcement
- Schema canonical forms (Array<T> → T[], etc.)
- Brand helper detection
- typeOf usage restrictions
- No assertions in schema files
- **Utility types (v0.8.0)**: Partial, Required, Pick, Omit, Record, Readonly
- **Const enums (v0.8.0)**: Numeric and string const enums expand to literal unions

## Runtime Performance and Features (v0.2.0 - v0.6.0)

The LFTS runtime validator has been optimized for high-performance validation and includes developer-friendly introspection capabilities:

### Optimizations Implemented

1. **DUNION Tag Caching** (v0.2.0): **40x-1,600x speedup** for ADT validation
   - WeakMap-based O(1) tag lookup
   - Automatic for all discriminated unions
   - Example: 20-variant ADT validates at 15.9M ops/sec vs 10K ops/sec with
     UNION

2. **Lazy Path Construction** (v0.2.0): **5-15% overall speedup**
   - Build error paths only when validation fails
   - Zero overhead on success path (80%+ of validations)

3. **UNION Result-Based Validation** (v0.3.0): **2-5x speedup**
   - Eliminates exception-based backtracking
   - Explicit error returns instead of try/catch
   - Example: 5-variant union validates at 50,990 ops/sec

4. **Excess-Property Policy** (v0.3.0): **Optional strict mode**
   - Reject unknown object properties
   - Usage: `enc.obj(props, true)` for strict mode
   - Minimal overhead (<5%) when enabled

5. **Prebuilt Type Annotations** (v0.4.0): **Clean nominal typing and runtime refinements**
   - **Nominal**: Compile-time branding (`string & Nominal`) - zero runtime cost
   - **String refinements**: `Email`, `Url`, `Pattern<P>`, `MinLength<N>`, `MaxLength<N>`
   - **Numeric refinements**: `Min<N>`, `Max<N>`, `Range<Min, Max>`
   - Composable: `string & MinLength<3> & MaxLength<20> & Email`
   - Replaces verbose `{ readonly __brand: "UserId" }` pattern
   - Addresses VALIDATOR_GAPS.md "No refinements" limitation

6. **Runtime Introspection Hooks** (v0.4.0): **Observability without mutation**
   - `inspect(schema, configure)` - Wrap schemas with success/failure hooks
   - `withMetadata(schema, metadata)` - Attach schema name and source location
   - Zero cost when not used (opt-in wrapper pattern)
   - Multiple hooks per event, errors caught to prevent breaking validation
   - Example: `inspect(UserSchema, ctx => ctx.onFailure(err => log(err)))`

### Performance Characteristics

- **ADT validation**: 8-16M ops/sec (DUNION with caching)
- **Union validation**: 50-200K ops/sec (Result-based, no exceptions)
- **Deep validation**: Optimized path construction
- **Batch validation**: Suitable for high-throughput APIs

See [docs/BYTECODE_REFERENCE.md](docs/BYTECODE_REFERENCE.md) for detailed
performance analysis and
[packages/lfts-type-runtime/benchmark.ts](packages/lfts-type-runtime/benchmark.ts)
for benchmarks.

## Distributed Execution Helpers (v0.9.0)

LFTS provides optional distributed execution helpers in [packages/lfts-type-runtime/distributed.ts](packages/lfts-type-runtime/distributed.ts) following the Light-FP philosophy: **composable primitives over layered frameworks**.

### Core Components

**HTTP Adapters** - Schema-validated HTTP client (509 lines):
- `httpGet<T>` - GET with automatic response validation
- `httpPost<TReq, TRes>` - POST with request/response validation
- `httpPut<TReq, TRes>` - PUT for updates
- `httpDelete` - DELETE operations
- All return `Result<T, NetworkError>` for explicit error handling
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
- `withRetry` - Exponential backoff with configurable predicate
- `createCircuitBreaker` - State machine (closed/open/half_open) for cascading failure prevention
- `withFallback` - Graceful degradation to alternative sources
- `withTimeout` - Custom timeout wrapper with cleanup

### Test Coverage

[packages/lfts-type-runtime/distributed.test.ts](packages/lfts-type-runtime/distributed.test.ts) - **31/31 tests passing** (947 lines):
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

### Usage Examples

**Basic HTTP:**
```typescript
const result = await httpGet<User>(url, UserSchema, { timeoutMs: 5000 });

if (result.ok) {
  console.log("User:", result.value);
} else {
  // Explicit error handling
  if (result.error.type === "timeout") { ... }
}
```

**Resilience Composition:**
```typescript
const breaker = createCircuitBreaker({ failureThreshold: 5 });

const result = await withRetry(
  () => breaker.execute(() => httpGet<User>(url, UserSchema)),
  {
    maxAttempts: 3,
    shouldRetry: (err) => err.type === "timeout" || err.type === "connection_refused"
  }
);
```

**Port Pattern (Location Transparency):**
```typescript
interface UserServicePort {
  getUser(id: number): Promise<Result<User, NetworkError>>;
}

function createUserServiceAdapter(baseUrl: string): UserServicePort {
  const breaker = createCircuitBreaker({ failureThreshold: 5 });

  return {
    getUser: (id) =>
      withRetry(
        () => breaker.execute(() => httpGet<User>(`${baseUrl}/users/${id}`, UserSchema)),
        { maxAttempts: 3 }
      )
  };
}
```

### Files

- `packages/lfts-type-runtime/distributed.ts` - Main implementation (768 lines)
- `packages/lfts-type-runtime/distributed.test.ts` - Comprehensive tests (947 lines, 31/31 passing)
- `packages/lfts-type-runtime/distributed-example.ts` - 8 complete examples (650 lines)
- `docs/DISTRIBUTED_GUIDE.md` - User guide (~500 lines)

### Performance

- **Bundle size**: ~6KB minified (tree-shakeable)
- **HTTP overhead**: ~1-2ms for validation (vs raw fetch)
- **Circuit breaker**: ~0.1ms per call
- **Zero external dependencies**

### Running Examples

```bash
# Run comprehensive example suite (8 examples)
deno run -A packages/lfts-type-runtime/distributed-example.ts

# Run tests
deno test --allow-net packages/lfts-type-runtime/distributed.test.ts
```

See [docs/DISTRIBUTED_GUIDE.md](docs/DISTRIBUTED_GUIDE.md) for complete documentation, best practices, and comparison with alternatives (gRPC, tRPC, Actor model).

## Architecture

### Package Structure

- **`packages/lfts-type-spec/`** - Bytecode opcodes (`Op` enum) and encoding helpers
- **`packages/lfts-type-compiler/`** - Main compiler with three passes:
  - `gate/` - Syntax gating (bans OOP, decorators, advanced TS features)
  - `policy/` - Semantic rules enforcement via pluggable rules
  - `transform/` - AST transformers for `typeOf<T>()` and schema-root rewriting
- **`packages/lfts-type-runtime/`** - Runtime validator using bytecode (thin wrapper around @deepkit/type concepts)
  - Includes distributed execution helpers (`distributed.ts`, `distributed.test.ts`, `distributed-example.ts`)
- **`packages/lfts-cli/`** - CLI tools for schema management (list, find, generate-index)
- **`packages/lfts-codegen/`** - Code generation utilities
- **`packages/release/`** - Release packaging scripts
- **`deno_example/`** - Minimal working example
- **`examples/`** - Progressive tutorial examples (01-10, see below)
- **`scripts/`** - Development scripts (OOP checker, git hooks)

### Compiler Pipeline

The compiler entry point is
[packages/lfts-type-compiler/src/compiler.ts](packages/lfts-type-compiler/src/compiler.ts):

1. **Gate** ([gate/gate.ts](packages/lfts-type-compiler/src/gate/gate.ts)) -
   Walks AST to ban:
   - OOP: `class`, `extends`, `implements`, `constructor`, `new`, `super`,
     `this`
   - Decorators (legacy or TC39)
   - Advanced types: mapped, conditional, template-literal, `keyof`, indexed
     access, recursive types

2. **Policy**
   ([policy/engine.ts](packages/lfts-type-compiler/src/policy/engine.ts)) - Runs
   pluggable rules in `policy/rules/`:
   - Port discipline (LFP1001, LFP1002, LFP1012)
   - Data purity (LFP1003)
   - ADT correctness (LFP1006, LFP1007)
   - Canonical syntax enforcement (LFP1008-LFP1016)

3. **Transform**
   ([transform/typeOf-rewriter.ts](packages/lfts-type-compiler/src/transform/typeOf-rewriter.ts)) -
   Replaces `typeOf<T>()` with bytecode literals

### Policy Rules System

Rules live in `packages/lfts-type-compiler/src/policy/rules/`. Each rule exports
a `Rule` object with:

- `meta` - Rule ID (LFTS####), name, severity, description
- `analyzeDeclaration?` - Called on declarations (interfaces, types)
- `analyzeUsage?` - Called on all nodes

To add a new rule:

1. Create file in `policy/rules/my-rule.ts`
2. Export rule object implementing `Rule` interface
3. Import and push to `rules` array in
   [policy/context.ts](packages/lfts-type-compiler/src/policy/context.ts)

### Bytecode Format

Bytecode is represented as nested arrays. See
[packages/lfts-type-spec/src/mod.ts](packages/lfts-type-spec/src/mod.ts) for
opcodes and encoding helpers:

- Primitives: `[Op.STRING]`, `[Op.NUMBER]`, etc.
- Literals: `[Op.LITERAL, value]`
- Arrays: `[Op.ARRAY, elementType]`
- Tuples: `[Op.TUPLE, length, ...elementTypes]`
- Objects: `[Op.OBJECT, propCount, Op.PROPERTY, name, isOptional, type, ...]`
- Unions: `[Op.UNION, altCount, ...alternatives]`
- Discriminated unions:
  `[Op.DUNION, tagKey, variantCount, tag1, schema1, tag2, schema2, ...]`
- Readonly: `[Op.READONLY, innerType]`
- Brand: `[Op.BRAND, tag, innerType]`

### Runtime Validation

The runtime
([packages/lfts-type-runtime/mod.ts](packages/lfts-type-runtime/mod.ts))
provides:

- `typeOf<T>()` - Dev shim (replaced by compiler with bytecode)
- `validate(schema, value)` - Validates value against bytecode schema
- `serialize(schema, value)` - Currently just validates + identity
- `match(value, cases)` - Exhaustive pattern matching for ADTs

## Light-FP Language Rules

### Canonical Syntax (Enforced by Compiler)

**One way to express each concept:**

- Data objects: `type` aliases only (LFP1008)
- Optional properties: `prop?:` never `prop: T | undefined` (LFP1009)
- Arrays: `T[]` never `Array<T>` (LFP1015)
- Readonly arrays: `readonly T[]` never `ReadonlyArray<T>` (LFP1015)
- Brands: `T & { readonly __brand: "Tag" }` never helper functions (LFP1010)
- Nullability: no `null` in schemas, use `?` for absence (LFP1011)
- Ports: method signatures only, no property functions (LFP1012)
- Type imports: `import type` when type-only (LFP1013)
- Assertions: no `as` in schema files (LFP1014)
- `typeOf<T>()`: only in `*.schema.ts` files (LFP1016)

### Supported Type System Features (v0.8.0)

**Utility Types** - TypeScript built-in utility types are supported and resolve at compile time:
- `Partial<T>` - Makes all properties optional
- `Required<T>` - Makes all properties required
- `Pick<T, K>` - Selects subset of properties
- `Omit<T, K>` - Excludes properties
- `Record<K, V>` - Creates object with uniform property types
- `Readonly<T>` - Makes properties readonly (compile-time only)

**Const Enums** - Expand to literal unions at compile time:
```typescript
const enum Status { Pending, Active, Completed }
// Expands to: 0 | 1 | 2

const enum Color { Red = "red", Blue = "blue" }
// Expands to: "red" | "blue"
```

**Note**: Regular enums are not supported (only `const enum`). See [PHASE3_PRIORITY2_COMPLETE.md](docs/PHASE3_PRIORITY2_COMPLETE.md) for details.

### ADT Requirements

- Discriminant must be `'type'` with string literal values (LFP1006)
- All `match(value, cases)` calls must handle all variants exactly (LFP1007)

### Schema Files (`*.schema.ts`)

Two patterns for defining schemas. **The schema-root pattern is recommended** for most use cases:

1. **Schema-Root Pattern** (v0.2.0+, **Recommended**):
   ```ts
   import type { User } from "./types.ts";

   // Compiler automatically generates: export const User$ = [bytecode]
   export type UserSchema = User;
   ```
   **Benefits**: Minimal ceremony, no `typeOf` import needed, clear naming convention

2. **Explicit `typeOf<T>()`** (pre-v0.2.0, for complex scenarios):
   ```ts
   import { typeOf } from "../packages/lfts-type-runtime/mod.ts";
   import type { User } from "./types.ts";

   export const User$ = typeOf<User>();
   ```
   **Benefits**: Explicit transformation visible in source, works for dynamic compositions

**Why explicit schemas?** See [docs/SCHEMA_GENERATION.md](docs/SCHEMA_GENERATION.md) for detailed rationale on why LFTS uses explicit compile-time transformation rather than pervasive runtime reflection (like Deepkit). Key reasons:
- ✅ Enforces Light-FP subset (Gate/Policy passes run before transformation)
- ✅ Minimal bundle size (only validated types ship to production, 60-80% smaller)
- ✅ Ports discipline (can prevent ports in data schemas)
- ✅ No decorators, no magic, no compiler patching
- ✅ Tree-shakeable (dead code elimination removes unused schemas)

### Ports/Capabilities Pattern

Ports define dependency interfaces and must:

- Be TypeScript interfaces (not types)
- Have suffix `Port` or `Capability` (configurable in `lfts.config.json`)
- Contain only method signatures (LFP1012)
- Not appear in data schemas (LFP1002)

Example:

```ts
// ports/storage.ts
export interface StoragePort {
  load(): Promise<Data>;
  save(data: Data): Promise<void>;
}
```

## Testing

### Golden Tests

Compiler tests use a golden test pattern in
[packages/lfts-type-compiler/src/testing/golden.ts](packages/lfts-type-compiler/src/testing/golden.ts):

- Test fixtures in `packages/lfts-type-compiler/src/testing/fixtures/`
- Each fixture has `src/` directory and `test.json` with expected diagnostics
- Naming: `ok_*` (should pass) or `fail_*` (should produce specific errors)

To add a test:

1. Create `fixtures/fail_my_test/src/a.ts` with test code
2. Create `fixtures/fail_my_test/test.json`:
   ```json
   {
     "expected": [
       { "id": "LFP1234", "message": "partial match of error" }
     ]
   }
   ```
3. Run `deno task test`

### Known Limitations

See [VALIDATOR_GAPS.md](docs/VALIDATOR_GAPS.md) for runtime validator
limitations:

- No recursive/self-referential types
- No generics, mapped/conditional types
- Limited error reporting (first-failure by default, use `validateAll()` for multiple errors)
- Excess property checking requires explicit strict mode

## Configuration

`lfts.config.json` configures policy rules:

```json
{
  "rules": {
    "port-interface": {
      "enabled": true,
      "suffixes": ["Port", "Capability"],
      "portDirs": ["deno_example/src/ports"],
      "requireTag": false
    },
    "ports-not-in-data": { "enabled": true },
    "data-no-functions": { "enabled": true }
  }
}
```

## Key Principles for AI Assistants

When working with this codebase, always follow these principles:

1. **No OOP Ever**: Never suggest classes, `this`, inheritance, or decorators. Use pure functions and type aliases.

2. **Explicit Over Implicit**: Prefer explicit error handling with `Result<T, E>` over exceptions. All failure modes should be typed.

3. **Canonical Syntax**: Use the canonical form for all constructs (e.g., `T[]` not `Array<T>`, `prop?:` not `prop: T | undefined`).

4. **Schema Files**: When working with schemas, use the schema-root pattern (`export type FooSchema = Foo`) unless there's a specific need for explicit `typeOf<T>()`.

5. **Port Pattern**: For dependencies, always use port interfaces (suffix with `Port` or `Capability`) rather than direct imports.

6. **Test Coverage**: Any new feature or fix should include golden tests in `packages/lfts-type-compiler/src/testing/fixtures/`.

7. **Documentation First**: When adding features, update relevant documentation files (FEATURES.md, LANG-SPEC.md, etc.) alongside code changes.

8. **Zero Magic**: No decorators, no reflection at runtime, no compiler patching. Everything should be explicit and inspectable.

## Common Development Workflows

### Building and Testing

```bash
# Full build and run cycle
deno task build && deno task start

# Run compiler tests
deno task test

# Run distributed execution tests
deno test --allow-net packages/lfts-type-runtime/distributed.test.ts

# Lint and check for OOP violations
deno task lint

# Install git hooks for automatic checking
./scripts/install-hooks.sh
```

### Working with Examples

```bash
# Compile and run a specific example
cd examples/05-branded-types
deno run -A ../../packages/lfts-type-compiler/src/cli.ts . --outDir ./build
deno run -A build/main.js

# Run distributed execution examples
deno run -A packages/lfts-type-runtime/distributed-example.ts
```

### Using CLI Tools

```bash
# List all schemas in project
deno task lfts:list

# Find specific schema
deno task lfts:find User

# Generate barrel exports (index.ts)
deno task lfts:index --dir src
```

### Creating a Release

```bash
# Package for release (creates dist/ with bundled artifacts)
deno task release
```

## Quick Reference

### File Naming Conventions

- `*.schema.ts` - Schema definition files (only place `typeOf<T>()` is allowed)
- `*.types.ts` - Type definitions (no runtime code)
- `*Port.ts` or `*Capability.ts` - Port interface definitions
- `*.test.ts` - Test files

### Policy Rule IDs

- **LFP1001-LFP1002**: Port discipline (interfaces, naming, no ports in data)
- **LFP1003**: Data purity (no functions in schemas)
- **LFP1006-LFP1007**: ADT correctness (discriminant, exhaustive matching)
- **LFP1008-LFP1016**: Canonical syntax enforcement (type vs interface, optional syntax, etc.)

### Bytecode Opcodes

Most common opcodes (see [packages/lfts-type-spec/src/mod.ts](packages/lfts-type-spec/src/mod.ts)):
- `Op.STRING`, `Op.NUMBER`, `Op.BOOLEAN`, `Op.ANY`, `Op.UNKNOWN`, `Op.UNDEFINED`, `Op.NULL`, `Op.VOID`
- `Op.LITERAL`, `Op.ARRAY`, `Op.TUPLE`, `Op.OBJECT`, `Op.PROPERTY`
- `Op.UNION`, `Op.DUNION` (discriminated union - use for ADTs)
- `Op.READONLY`, `Op.BRAND`
- `Op.INTERSECTION` (only for branding)

## Important Patterns

### Adding a New Policy Rule

1. Create `packages/lfts-type-compiler/src/policy/rules/my-rule.ts`:
   ```ts
   import { Rule, RuleContext } from "../context.ts";

   export const myRule: Rule = {
     meta: {
       id: "LFP1234",
       name: "my-rule-name",
       defaultSeverity: "error",
       defaultOptions: {},
       description: "Rule description",
     },
     analyzeUsage(node, ctx) {
       // Check node and call ctx.report() on violations
     },
   };
   ```

2. Import and register in
   [packages/lfts-type-compiler/src/policy/context.ts](packages/lfts-type-compiler/src/policy/context.ts):
   ```ts
   import { myRule } from "./rules/my-rule.ts";
   rules.push(..., myRule);
   ```

3. Add test fixture and run `deno task test`

### Adding a New Bytecode Operation

1. Add opcode to `Op` enum in
   [packages/lfts-type-spec/src/mod.ts](packages/lfts-type-spec/src/mod.ts)
2. Add encoder helper to `enc` object
3. Add validator case in
   [packages/lfts-type-runtime/mod.ts](packages/lfts-type-runtime/mod.ts)
   `validateWith()` function
4. Add transformer logic in
   [packages/lfts-type-compiler/src/transform/typeOf-rewriter.ts](packages/lfts-type-compiler/src/transform/typeOf-rewriter.ts)

## Tutorial Examples

The `examples/` directory contains 10 progressive, runnable examples. Work through them in order:

| #  | Folder                     | Focus                                                   |
|----|----------------------------|---------------------------------------------------------|
| 01 | `01-basic-validation`      | Primitive/object schemas and boundary validation        |
| 02 | `02-optional-readonly`     | Optional fields, readonly collections, aggregated errors|
| 03 | `03-unions-adt`            | Discriminated unions (ADTs) and detailed diagnostics    |
| 04 | `04-result-pattern`        | Modelling `Result<T, E>` style flows                    |
| 05 | `05-branded-types`         | Nominal typing with brands                              |
| 06 | `06-ports`                 | Validating capability ports                             |
| 07 | `07-async-result`          | Async error handling with `AsyncResult` helpers         |
| 08 | `08-pattern-matching`      | Exhaustive `match()` usage over ADTs                    |
| 09 | `09-mini-application`      | Putting it all together in a tiny hexagonal script      |
| 10 | `10-distributed-execution` | HTTP adapters, resilience patterns, circuit breakers    |

Each example can be compiled and run:
```bash
cd examples/NN-example-name
deno run -A ../../packages/lfts-type-compiler/src/cli.ts . --outDir ./build
deno run -A build/main.js
```

## OOP Safeguards

This codebase strictly enforces **Light-FP principles** and prohibits all OOP constructs:

**Banned constructs:**
- ❌ `class`, `extends`, `implements`, `constructor`, `new` (except built-ins like `Map`, `Error`)
- ❌ `this`, `super`
- ❌ Decorators (legacy or TC39)

**Multiple layers of protection:**

1. **Deno Lint** - `deno task lint` checks before commit
2. **Pre-commit Hook** - Install with `./scripts/install-hooks.sh` (checks on every commit)
3. **CI Pipeline** - GitHub Actions runs checks on all PRs
4. **Custom Checker** - `scripts/check-no-oop.ts` scans entire codebase for violations

See [CONTRIBUTING.md](CONTRIBUTING.md) for full Light-FP guidelines and contribution workflow.

## Language Specification

Full spec in [LANG-SPEC.md](docs/LANG-SPEC.md). Key points:

- **Allowed**: primitives, arrays, tuples, objects, unions, readonly, intersections (for branding only)
- **Disallowed**: classes, decorators, `this`, mapped/conditional types, generics (in schemas)
- All policies enforced at compile time, not via linter
