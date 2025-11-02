# 09 – Mini Application

**Goal:** tie together schemas, brands, ADTs, ports, `Result`, and `match()` in a small end-to-end script.

## Features demonstrated

- Branded identifiers and canonical schemas (`Task` / `Command`)
- Port validation for infrastructure (`TaskStorePort`, `ClockPort`)
- Result-based command processing with exhaustive pattern matching
- Validation of both inbound commands and outbound results

## Run it

```bash
cd examples/09-mini-application
deno run -A ../../packages/lfts-type-compiler/src/cli.ts . --outDir ./build
deno run -A build/examples/09-mini-application/main.js
```

Observe the console output as each command is validated, applied, and persisted. The final task list reflects the cumulative changes.

## Common pitfalls

- Forgetting to re-run the compiler after editing schemas – the runtime will complain about missing bytecode.
- Leaving ports unvalidated – always guard effectful collaborators at the boundary.
- Returning ad-hoc objects from domain logic – validate outputs before wiring them into the UI or transport layer.

## Next steps

- Extend commands to support due dates with refinements (Example 07 inspiration)
- Split core logic into pure modules and inject the port implementations from `main.ts`

## References

- Examples 01–08
- [Future Direction](../../docs/FUTURE_DIRECTION.md)
- [Effects Guide](../../docs/EFFECTS_GUIDE.md)
