# 01 – Basic Validation

**Goal:** after completing this example you will be able to compile a simple Light-FP schema and validate JSON data against it.

## What you will learn

- Declaring domain types with plain TypeScript aliases
- Generating bytecode schemas with `typeOf<T>()`
- Validating unknown data with `validateSafe`
- Reading compiler diagnostics when input is invalid

## Project layout

```
01-basic-validation/
├─ src/
│  ├─ types.ts           // domain types (single source of truth)
│  └─ types.schema.ts    // schema roots: typeOf<T>() is rewritten to bytecode
├─ data/
│  ├─ user-valid.json
│  └─ user-invalid.json
└─ main.ts               // entry point – loads JSON and validates it
```

## Running the example

1. Compile the project (from `examples/01-basic-validation`):

   ```bash
   deno run -A ../../packages/lfts-type-compiler/src/cli.ts . --outDir ./build
   ```

   The compiler rewrites `typeOf<T>()` calls inside `src/types.schema.ts` and writes the emitted JS to `build/`.

2. Run the validation script (the compiler mirrored the folder structure inside `build/`):

   ```bash
   deno run -A build/examples/01-basic-validation/main.js
   ```

   Expected output:

   ```
   Valid user result:
   { ok: true, value: { id: "user-001", name: "Ada Lovelace", age: 36 } }

   Invalid user result:
   { ok: false, error: { path: "age", message: "expected number" } }

   Validation error message:
   age: expected number
   ```

## Common pitfalls

- Forgetting to run the compiler before executing `main.ts` will throw: `LFTS runtime: missing bytecode`. Always compile after editing schemas.
- Only `typeOf<T>()` calls in `*.schema.ts` are transformed; keep runtime code (like `main.ts`) free of schema definitions.
- Use canonical syntax (`type` aliases, `readonly`, etc.) – see `docs/LANG-SPEC.md` for the allowed surface.

## Further reading

- [Language Spec](../../docs/LANG-SPEC.md)
- [Validator Gaps](../../docs/VALIDATOR_GAPS.md)
- [Runtime API](../../packages/lfts-type-runtime/mod.ts)
