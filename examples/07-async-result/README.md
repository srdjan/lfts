# 07 – AsyncResult Helpers

**Goal:** compose asynchronous computations that can fail using `AsyncResult` utilities.

## Highlights

- Wrap side effects with `AsyncResult.try`
- Sequence dependent async steps with `AsyncResult.andThen`
- Keep errors as data (`Result.err`) instead of throwing

## Run it

```bash
cd examples/07-async-result
deno run -A ../../packages/lfts-type-compiler/src/cli.ts . --outDir ./build
deno run -A build/examples/07-async-result/main.js
```

Expected output shows a successful load (with `ok: true`) and a failing load for the missing file producing a `network` error.

## Tips

- Always validate data at the boundary – even parsed JSON still needs schema validation.
- `AsyncResult` returns `Promise<Result<...>>`; you can still use plain `await` + ternaries when it reads better.

## References

- [Effect Guide – AsyncResult](../../docs/EFFECTS_GUIDE.md)
