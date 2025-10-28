# Standalone Validator — Known Gaps (v0.2.0)

This lists the **known missing features** in the built-in validator compared to a production-ready schema runtime.

**Recent improvements (v0.2.0)**:
- ✅ DUNION discriminated union fast-path with O(1) tag lookup (40x-1600x speedup)
- ✅ Lazy path construction (eliminates string concat overhead on happy path)
- ✅ UNION Result-based validation (2-5x speedup, eliminates try/catch overhead)
- ✅ Excess-property policy (optional strict mode for objects)

## Type surface & semantics
- **No recursive/self-referential types** (e.g., trees, graphs).
- **No generics** instantiation or type parameter substitution.
- **No mapped / conditional / template-literal types**.
- **No index signatures** (e.g., `{[k: string]: T}`) and **no dictionary/object-unknown keys**.
- **No tuple optional/rest elements** (only fixed-length tuples).
- **No function types in schemas** (by design; rejected by policy, not supported in runtime).
- **No `bigint`, `symbol`, `Date`, `Buffer`, or branded-special primitives** beyond `string/number/boolean/null/undefined/literal`.

## Validation constraints & refinements
- **No numeric refinements**: min/max, integer-only, exclusive bounds, multiples.
- **No string refinements**: min/max length, regex patterns, specific formats (email/uuid/url).
- **No array refinements**: min/max items, uniqueItems, item-by-index rules.
- **Limited object refinements**: required-vs-optional is supported, **excess-property policy is supported** (✅ v0.2.0 - optional strict mode), but **no dependency/oneOf/allOf** style constraints.
- **No deep `readonly` enforcement** at runtime (compile-time only).
- **No brand-carrying runtime checks** beyond wrapping the inner type.

## Error reporting
- **First-failure only**: we stop on the first error; no aggregation of multiple errors.
- **Union messages** are generic (“no union alternative matched”) without best-match hints.
- **Path is included**, but **no schema source mapping** (e.g., pointing to exact `typeOf<T>()` property node).

## Performance & ergonomics
- **Limited memoization**: DUNION tag maps are WeakMap-cached (✅ v0.2.0), but general sub-schema memoization not yet implemented.
- **Optimized dispatch**: DUNION uses O(1) tag lookup (✅ v0.2.0), UNION uses Result-based validation (✅ v0.2.0 - eliminates try/catch overhead).
- **No stable schema hash** for caching / versioning / compatibility checks.
- **No JSON Schema export** and **no serializer specialization** (serialize = validate + identity).
- **No plugin hooks** for custom validators/refinements.

## Interop & tooling
- **No schema registry** or cross-module sharing contract (we inline bytecode at call sites).
- **No source map for schemas** (see error reporting above).

---

## Suggested next steps

### High Priority
1. **Error aggregation**: Collect multiple failures with a limit and clear formatting (only remaining high-priority item).

### Medium Priority
2. **General schema memoization**: Hash-based cache for sub-schemas beyond DUNION (10-20% speedup for READONLY/BRAND-heavy schemas).
3. **Tuple rest/optional**: Extend bytecode and encoder for richer tuples.
4. **Refinements**: Add minimal `Op.REFINE` with known set (min/max, length, regex).

### Low Priority
5. **Stable schema hash**: Enable caching, versioning, compatibility checks.
6. **Source mapping**: Emit lightweight node-spans from `typeOf<T>()` to properties for better error messages.
7. **Recursive types**: Support self-referential types (trees, graphs) with cycle detection.

### Performance Note
Current optimizations (v0.2.0) provide significant performance improvements:
- **DUNION**: 40x-1600x speedup for ADT validation
- **UNION**: 2-5x speedup with Result-based validation
- **Lazy paths**: Eliminates string concat overhead on happy path

For most use cases, JavaScript runtime performance is now sufficient. Consider WASM only if benchmarks show specific bottlenecks after implementing remaining JavaScript optimizations (#2 above).
