# Standalone Validator — Known Gaps (v0.4.x)

This document tracks the remaining gaps in the built-in validator relative to a production-ready runtime. It reflects the current Deno runtime shipped with LFTS v0.4.x.

**Recent improvements**
- ✅ **Refinements**: numeric min/max/integer/range, string length/pattern/email/url, array min/max items.
- ✅ **Error aggregation**: `validateAll()` collects multiple failures (configurable cap).
- ✅ **Strict objects**: optional excess-property policy on `enc.obj([...], true)`.
- ✅ **DUNION fast path**: O(1) discriminant lookup with WeakMap cache.
- ✅ **Union optimisations**: result-based validation eliminates throw/catch overhead.
- ✅ **Lazy paths**: only build dotted paths when needed.

## Type surface & semantics
- **No recursive/self-referential types** (e.g., trees, graphs).
- **No generics** instantiation or type parameter substitution.
- **No mapped / conditional / template-literal types**.
- **No index signatures** (e.g., `{[k: string]: T}`) and **no dictionary/object-unknown keys**.
- **No tuple optional/rest elements** (only fixed-length tuples).
- **No function types in schemas** (by design; rejected by policy, not supported in runtime).
- **No `bigint`, `symbol`, `Date`, `Buffer`, or branded-special primitives** beyond `string/number/boolean/null/undefined/literal`.
- **Readonly** is shallow: runtime treats `READONLY` as pass-through (compile-time only).

## Validation constraints & refinements
- ✅ Numeric refinements: `Op.REFINE_MIN`, `Op.REFINE_MAX`, `Op.REFINE_INTEGER`, `Op.REFINE_PATTERN` (range via min/max nesting).
- ✅ String refinements: min/max length, regex pattern, email, URL.
- ✅ Array refinements: min/max items.
- ❌ Missing refinements: exclusivity (`>`, `<`), multiples, string format families (UUID, ISO dates), array uniqueness and per-index rules.
- ❌ No composite constraints (`oneOf`, `allOf`, property dependencies).
- ❌ No brand-aware runtime checks beyond structural `Op.BRAND`.

## Error reporting
- ✅ `validateAll()` aggregates errors with configurable `maxErrors`.
- **Union diagnostics** remain generic (“no union alternative matched”) without nearest-match hints.
- **Paths** include array indices and property names, but **no schema source mapping** (no link back to original `typeOf<T>()` location).

## Performance & ergonomics
- **Memoization**: DUNION tag maps + BRAND/READONLY wrapper caches exist, but there is no general sub-schema cache or hash-based lookup.
- **Schema identity**: No stable schema hash for memoised validation/serialization or compatibility checks.
- **Interop**: No JSON Schema export, no serializer specialisation, no plugin hook architecture.

## Interop & tooling
- **No schema registry** or cross-module sharing contract (we inline bytecode at call sites).
- **No source map for schemas** (see error reporting above).

---

## Suggested next steps

### High Priority
1. **Discriminated union diagnostics**: Provide “best alternative” hints when unions fail.
2. **Source mapping**: Emit minimal spans from bytecode back to `typeOf<T>()` properties.
3. **Schema identity**: stable hash / memo cache for repeat validations.

### Medium Priority
4. **Recursive & dictionary types**: Extend bytecode/runtime with cycle detection and index signatures.
5. **Tuple optional/rest elements**: Add bytecode encoding for variadic tuples.
6. **Advanced refinements**: unique arrays, exclusive bounds, extended string format helpers.

### Low Priority
7. **Plugin hooks**: Allow custom validators/refinements to register with runtime.
8. **Serializer specialisation**: Generate faster encode/serialize paths.
9. **JSON Schema / OpenAPI export**: Emit metadata for external tooling.

### Performance Note
Recent optimisations already in place:
- **DUNION**: 40x–1600x faster ADT validation with cached tag map.
- **UNION**: 2–5x faster through result-based branching.
- **Lazy paths**: No string concatenation on the happy path.
- **Wrapper cache**: BRAND/READONLY nodes reuse inner schemas via WeakMap.

For most use cases the JavaScript implementation is sufficient; consider WASM/FFI specialisation only after closing the medium-priority items above.
