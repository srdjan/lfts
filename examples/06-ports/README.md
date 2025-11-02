# 06 – Ports & Capabilities

**Goal:** validate effectful collaborators (ports) before handing them to pure application logic.

## Concepts

- Declare `@port` interfaces for capabilities
- Generate port schemas with `enc.port` (until automatic generation lands)
- Use `validatePort` to ensure structural compliance at runtime

## Run it

```bash
cd examples/06-ports
deno run -A ../../packages/lfts-type-compiler/src/cli.ts . --outDir ./build
deno run -A build/examples/06-ports/main.js
```

Expected output shows `{ ok: true }` for the valid in-memory implementation and `{ ok: false, error: { type: "wrong_arity", ... } }` for the broken version.

## Tips

- Ports communicate capabilities across module boundaries while keeping core logic pure.
- Keep method signatures simple (no `this`, no classes, no side-effectful globals).
- Combine with branded types and Results for richer contracts.

## References

- [Effect guide – Ports](../../docs/EFFECTS_GUIDE.md)
- [Validator API – validatePort](../../packages/lfts-type-runtime/mod.ts)
