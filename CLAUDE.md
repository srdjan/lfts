# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with
code in this repository.

## Project Overview

This is a **Light-FP TypeScript compiler** prototype that enforces a minimal
functional programming subset and compiles `typeOf<T>()` calls into
Deepkit-compatible bytecode literals. The compiler performs three passes:

1. **Gate pass** - Rejects disallowed syntax (OOP constructs, decorators,
   mapped/conditional types)
2. **Policy pass** - Enforces semantic rules (ports discipline, data-only
   schemas, canonical forms)
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
```

## Test Suite Status

**Current**: 17/20 tests passing (85% pass rate)

The compiler test suite has 20 golden tests in
[packages/lfts-type-compiler/src/testing/fixtures/](packages/lfts-type-compiler/src/testing/fixtures/).
As of the latest refactoring work:

- ✅ **17 tests passing** - All core LFTS rules are working correctly
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

## Runtime Performance (v0.3.0)

The LFTS runtime validator has been optimized for high-performance validation:

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

### Performance Characteristics

- **ADT validation**: 8-16M ops/sec (DUNION with caching)
- **Union validation**: 50-200K ops/sec (Result-based, no exceptions)
- **Deep validation**: Optimized path construction
- **Batch validation**: Suitable for high-throughput APIs

See [docs/BYTECODE_REFERENCE.md](docs/BYTECODE_REFERENCE.md) for detailed
performance analysis and
[packages/lfts-type-runtime/benchmark.ts](packages/lfts-type-runtime/benchmark.ts)
for benchmarks.

## Architecture

### Package Structure

- **`packages/lfts-type-spec/`** - Bytecode opcodes (`Op` enum) and encoding
  helpers
- **`packages/lfts-type-compiler/`** - Main compiler with three passes:
  - `gate/` - Syntax gating (bans OOP, decorators, advanced TS features)
  - `policy/` - Semantic rules enforcement via pluggable rules
  - `transform/` - AST transformers for `typeOf<T>()` and schema-root rewriting
- **`packages/lfts-type-runtime/`** - Runtime validator using bytecode (thin
  wrapper around @deepkit/type concepts)
- **`deno_example/`** - Minimal working example
- **`demo_cli/`** - Full CLI app demonstrating all LFTS patterns

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

### ADT Requirements

- Discriminant must be `'type'` with string literal values (LFP1006)
- All `match(value, cases)` calls must handle all variants exactly (LFP1007)

### Schema Files (`*.schema.ts`)

Two patterns for defining schemas:

1. **Explicit** (pre-v0.2.0):
   ```ts
   import { typeOf } from "../packages/lfts-type-runtime/mod.ts";
   import type { User } from "./types.ts";
   export const User$ = typeOf<User>();
   ```

2. **Zero-exposure roots** (v0.2.0+):
   ```ts
   import type { User } from "./types.ts";
   export type UserSchema = User; // compiler emits: export const User$ = [...]
   ```

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
- No refinements (min/max, regex, etc.)
- First-failure only error reporting
- No excess property checking

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

## Language Specification

Full spec in [LANG-SPEC.md](docs/LANG-SPEC.md). Key points:

- **Allowed**: primitives, arrays, tuples, objects, unions, readonly,
  intersections (for branding only)
- **Disallowed**: classes, decorators, `this`, mapped/conditional types,
  generics (in schemas)
- All policies enforced at compile time, not via linter
