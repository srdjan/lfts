# Standalone Validator — Gaps & Next Steps (Iteration 1)

This lists the **known missing features** in the built-in validator compared to a production-ready schema runtime.

## Type surface & semantics
- **No recursive/self-referential types** (e.g., trees, graphs).
- **No generics** instantiation or type parameter substitution.
- **No mapped / conditional / template-literal types**.
- **No index signatures** (e.g., `{[k: string]: T}`) and **no dictionary/object-unknown keys**.
- **No discriminated union fast-path** (we try each alternative; no keyed guard).
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
- **No memoization** of sub-schemas; repeated substructures are re-validated each time.
- **No JIT/optimized dispatch** for hot paths (e.g., discriminant switch for unions).
- **No stable schema hash** for caching / versioning / compatibility checks.
- **No JSON Schema export** and **no serializer specialization** (serialize = validate + identity).
- **No plugin hooks** for custom validators/refinements.

## Interop & tooling
- **No schema registry** or cross-module sharing contract (we inline bytecode at call sites).
- **No source map for schemas** (see error reporting above).

---

### Suggested next steps
1. **Discriminated unions**: permit a configurable discriminant key; short-circuit on tag match.
2. **Excess-property policy**: optional strict/loose object validation flag.
3. **Tuple rest/optional**: extend bytecode and encoder for richer tuples.
4. **Refinements**: add a minimal `Op.REFINE` with a known set (min/max, length, regex).
5. **Error aggregation**: collect multiple failures with a limit and clear formatting.
6. **Schema memoization**: hash-based cache for subtrees; speeds recursive configs once added.
7. **Source mapping**: emit lightweight node-spans from `typeOf<T>()` to properties, enabling codeframes at runtime errors.
