# 03 – Unions & ADTs

**Goal:** learn how Light-FP enforces exhaustive discriminated unions and reports detailed validation errors.

## Key concepts

- Tagged unions using the canonical `type` property
- Structural validation of each variant
- Aggregating multiple union-related failures

## Run the example

```bash
cd examples/03-unions-adt
deno run -A ../../packages/lfts-type-compiler/src/cli.ts . --outDir ./build
deno run -A build/examples/03-unions-adt/main.js
```

## What to observe

- Valid scenes pass with `{ ok: true }`.
- Invalid scenes report errors such as:

  ```
  - shapes[0].radius: expected number
  - shapes[1].type: unexpected tag "triangle"; expected one of: "circle", "square", "rectangle"
  ```

- Missing or extra cases in code using `match()` will be caught by the compiler (see example 08).

## Tips

- All union variants must be object literals for the ADT optimization (`Op.DUNION`).
- Tags must be string literals; using a dynamic string moves the schema back to a slower generic union.

## References

- [Language Spec – Discriminated Unions](../../docs/LANG-SPEC.md)
- [Validator Bytecode Reference](../../docs/BYTECODE_REFERENCE.md)
