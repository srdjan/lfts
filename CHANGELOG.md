# Changelog

## v0.1.0 (initial internal release)
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
