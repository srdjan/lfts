# Changelog

All notable changes to the LFP compiler project are documented here.

## [Unreleased - v0.3.0]

### Added
- **UNION Result-Based Validation**: Eliminated exception-based backtracking (2-5x speedup)
  - New `validateWithResult()` internal function returns `VError | null`
  - Zero overhead for successful validations
  - Fully backward compatible with existing public API

- **Excess-Property Policy**: Optional strict mode for object validation
  - New `strict` parameter: `enc.obj(props, strict?: boolean)`
  - Strict mode rejects unknown properties with precise error paths
  - Backward compatible: defaults to loose mode
  - Use cases: API validation, configuration files, security

- **Refinement System**: Runtime validation constraints for numbers, strings, and arrays
  - **Number refinements**: `min`, `max`, `integer`
  - **String refinements**: `minLength`, `maxLength`
  - **Array refinements**: `minItems`, `maxItems`
  - Composable: chain multiple refinements (e.g., `refine.min(refine.max(enc.num(), 100), 0)`)
  - Works with all validation APIs: `validate()`, `validateSafe()`, `validateAll()`
  - Compatible with READONLY and BRAND wrappers
  - Note: Regex patterns not supported (by design, LFP language limitation)

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
- Updated [docs/BYTECODE_REFERENCE.md](docs/BYTECODE_REFERENCE.md) with UNION and strict mode details
- Updated [docs/VALIDATOR_GAPS.md](docs/VALIDATOR_GAPS.md) - marked completed features
- Added usage examples and test files

## [v0.2.0]

### Added
- **DUNION Discriminated Union Optimization**: O(1) tag lookup (40x-1,600x speedup)
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
- Minimal Light-FP TS subset (Deno-only) with compiler-enforced policies and transforms
- ADTs with strict `'type'` discriminant + exhaustive `match()` policy
- Built-in validator for pruned bytecode (no external deps)
- Canonical single-syntax enforcement rules (LFP1008–LFP1015)
- Demo CLI with `StoragePort` (file adapter) and end-to-end tests


### Polished v0.1.0
- Added `deno task release` to package a versioned zip under `out/`.
- All policy diagnostics now include **Quick fix** suggestions with copy-pasteable hints.
- Updated docs to mention release flow.


## v0.2.0
- **Zero-exposure schema roots**: use `export type NameSchema = Name` in `*.schema.ts` files; the compiler generates `export const Name$ = [...]`.
- New transformer `schema-root-rewriter` (runs before `typeOf` rewriter).
- Demo app and examples updated to the new pattern.
- `typeOf<T>()` remains supported (in `*.schema.ts` only, `LFP1016`) for migration; slated for deprecation in a later release.
