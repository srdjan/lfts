# 02 – Optional & Readonly Types

**Goal:** understand how optional properties and readonly collections behave under LFTS validation.

## Learning objectives

- Declare optional (`prop?`) and readonly (`readonly`) properties
- Validate immutable arrays (`readonly string[]`)
- Observe how `validateAll` aggregates multiple failures

## Run it

From `examples/02-optional-readonly`:

```bash
deno run -A ../../packages/lfts-type-compiler/src/cli.ts . --outDir ./build
deno run -A build/examples/02-optional-readonly/main.js
```

Expected console output (abbreviated):

```
Valid profile:
{ ok: true, value: { ... } }

Invalid profile errors:
{ ok: false, errors: [
  { path: "tags[1]", message: "expected string" },
  { path: "address.country", message: "expected string" }
] }
```

## Pitfalls to watch for

- `readonly string[]` must be expressed exactly like this; `ReadonlyArray<string>` is rejected by the compiler gate.
- Optional objects (like `address?`) validate recursively—nested optional fields still produce precise error paths.
- `validateAll` collects *all* issues up to the default cap (100). Use it when you need rich diagnostics.

## References

- [Language Spec – Canonical Syntax](../../docs/LANG-SPEC.md)
- [Validator Guide](../../docs/VALIDATOR_GAPS.md)
