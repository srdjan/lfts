# LFP Demo CLI

A small CLI app that demonstrates the Light-FP TypeScript subset:

- **Canonical schemas** with `typeOf<T>()` compiled to bytecode
- **ADTs** with strict `'type'` discriminant and **exhaustive** `match(...)`
- **Ports/Capabilities** via `@port` interfaces (method signatures only)
- **Structural branding** for IDs
- **Optional properties** with `?`
- **Readonly arrays** (`readonly T[]`)
- **Builtin validator** used at the edges (parse/IO)

## Commands

Run after building:

```bash
deno task build
deno task demo -- help
deno task demo -- add --name "Buy milk"
deno task demo -- list
deno task demo -- complete --id <ID_FROM_LIST>
```

You can also pipe JSON commands:

```bash
echo '{ "type": "add", "name": "Demo task" }' | deno task demo
```



## Persistence via StoragePort

We added a `StoragePort` and a file-based adapter:
- On startup, the app loads `./tasks.json` if present.
- On `add` and `complete`, it saves the `TaskList` in canonical JSON.

Run E2E tests (build + run CLI):

```bash
deno test -A demo_cli/tests/e2e.test.ts
```
