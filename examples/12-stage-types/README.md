# Example 12: Stage Catalogs + HTMX Fragments

Goals:
- Register backend + full-stack stages with `defineBackendFunctionStage` / `defineFullStackHtmxStage`
- List stages via a catalog and mount HTMX routes from metadata
- Use `graphBuilder.stageFromDefinition()` so workflows operate on stage definitions directly

Run it:
```bash
deno run -A main.ts
```

What to look for:
- Console output logs backend verification running for every seed, while the HTMX stage only runs when `requiresHuman` is true.
- Registered HTMX routes are printed so you can hand them to whatever router powers your HTTP adapter.
- Snapshots show skipped stages, highlighting how `{ when: ... }` cooperates with prebuilt stage kinds.
