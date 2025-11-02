# 05 – Branded Types

**Goal:** add nominal semantics to primitives using structural brands.

## Highlights

- Define branded strings via intersection (`string & { __brand: "UserId" }`)
- Keep runtime validation structural (still checks the underlying string type)
- Centralise brand creation in helper functions (`makeUserId`)

## Run it

```bash
cd examples/05-branded-types
deno run -A ../../packages/lfts-type-compiler/src/cli.ts . --outDir ./build
deno run -A build/examples/05-branded-types/main.js
```

You should see the valid payload hydrated into a `User` object, followed by a failed validation for the invalid payload (`id` is not a string).

## Notes & pitfalls

- Brands are compile-time only: they prevent accidental mixing of types in your code, but runtime validation still checks only the underlying primitive. Combine brands with refinements (see example 07) for stronger guarantees.
- Canonical brand syntax is an intersection with a type literal containing `__brand`.

## References

- [Language Spec – Branding](../../docs/LANG-SPEC.md)
- [Bytecode Reference – BRAND opcode](../../docs/BYTECODE_REFERENCE.md)
