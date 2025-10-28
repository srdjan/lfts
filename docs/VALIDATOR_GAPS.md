# Standalone Validator — Known Gaps (v0.2.0)

This lists the **known missing features** in the built-in validator compared to a production-ready schema runtime.

**Recent improvements (v0.2.0)**:
- ✅ DUNION discriminated union fast-path with O(1) tag lookup (40x-1600x speedup)
- ✅ Lazy path construction (eliminates string concat overhead on happy path)

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
- **No object refinements**: required-vs-optional is supported, but **no excess-property policy**
  (e.g., forbid unknown keys), and **no dependency/oneOf/allOf** style constraints.
- **No deep `readonly` enforcement** at runtime (compile-time only).
- **No brand-carrying runtime checks** beyond wrapping the inner type.

## Error reporting
- **First-failure only**: we stop on the first error; no aggregation of multiple errors.
- **Union messages** are generic (“no union alternative matched”) without best-match hints.
- **Path is included**, but **no schema source mapping** (e.g., pointing to exact `typeOf<T>()` property node).

## Performance & ergonomics
- **Limited memoization**: DUNION tag maps are WeakMap-cached (✅ v0.2.0), but general sub-schema memoization not yet implemented.
- **Partial JIT/optimized dispatch**: DUNION uses O(1) tag lookup (✅ v0.2.0), but general UNION still uses sequential try/catch.
- **No stable schema hash** for caching / versioning / compatibility checks.
- **No JSON Schema export** and **no serializer specialization** (serialize = validate + identity).
- **No plugin hooks** for custom validators/refinements.

## Interop & tooling
- **No schema registry** or cross-module sharing contract (we inline bytecode at call sites).
- **No source map for schemas** (see error reporting above).

---

## Suggested next steps

### High Priority
1. **Excess-property policy**: Optional strict/loose object validation flag to catch unknown keys.
2. **Error aggregation**: Collect multiple failures with a limit and clear formatting.
3. **UNION optimization**: Use Result types instead of exception-based backtracking (2-5x speedup expected).

### Medium Priority
4. **General schema memoization**: Hash-based cache for sub-schemas beyond DUNION (10-20% speedup for READONLY/BRAND-heavy schemas).
5. **Tuple rest/optional**: Extend bytecode and encoder for richer tuples.
6. **Refinements**: Add minimal `Op.REFINE` with known set (min/max, length, regex).

### Low Priority
7. **Stable schema hash**: Enable caching, versioning, compatibility checks.
8. **Source mapping**: Emit lightweight node-spans from `typeOf<T>()` to properties for better error messages.
9. **Recursive types**: Support self-referential types (trees, graphs) with cycle detection.

### Performance Note
Current DUNION optimization (v0.2.0) provides 40x-1600x speedup for ADT validation. For most use cases, JavaScript runtime performance is now sufficient. Consider WASM only if benchmarks show specific bottlenecks after implementing remaining JavaScript optimizations (#3-4 above).
