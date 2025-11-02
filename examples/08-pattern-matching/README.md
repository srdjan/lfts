# 08 – Pattern Matching

**Goal:** evaluate ADTs using the `match()` helper and rely on compiler checks for exhaustiveness.

## Learning points

- `match(value, cases)` dispatches on the `type` discriminant.
- Missing or extra cases produce compile-time diagnostics (LFP1007).
- Keep evaluation pure – recursion composes naturally in Light-FP.

## Run it

```bash
cd examples/08-pattern-matching
deno run -A ../../packages/lfts-type-compiler/src/cli.ts . --outDir ./build
deno run -A build/examples/08-pattern-matching/main.js
```

Output should show the expression JSON and the computed numeric result (`13`).

## Tips

- Commented code in `main.ts` illustrates the quick feedback loop: adding an unused `sub` case or omitting one of the required tags will fail compilation.
- Combine with Example 03 to see how ADTs are validated before evaluation.

## References

- [Language Spec – `match()` rule](../../docs/LANG-SPEC.md)
- [Known Issues – Exhaustive matching](../../docs/KNOWN_ISSUES.md)
