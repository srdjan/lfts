# 04 – Result<T, E> Patterns

**Goal:** model conventional success/error flows using Light-FP result unions and validate both inputs and outputs.

## Key takeaways

- Represent `Result` as a discriminated union (`{ ok: true, value } | { ok: false, error }`)
- Use runtime helpers (`Result.ok`, `Result.err`, `Result.isOk`) for ergonomics
- Validate both request payloads and service responses

## Run it

```bash
cd examples/04-result-pattern
deno run -A ../../packages/lfts-type-compiler/src/cli.ts . --outDir ./build
deno run -A build/examples/04-result-pattern/main.js
```

## Output walkthrough

1. Valid credentials → validation passes → authentication returns `ok: true` → printed token.
2. Invalid payload → validation stops early with `{ ok: false, error: { path: "password", message: "expected string" } }`.

## Pitfalls

- Generics (`Result<User, Error>`) are not yet supported by the encoder; use explicit unions as shown.
- Always validate service results in tests – the compiler only guarantees the *shape* you emit.

## Links

- [Result helpers in the runtime](../../packages/lfts-type-runtime/mod.ts)
- [Effect guide (Result patterns)](../../docs/EFFECTS_GUIDE.md)
