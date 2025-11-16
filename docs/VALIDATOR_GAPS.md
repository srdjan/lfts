# Standalone Validator — Known Gaps (v0.9.0)

_Last reviewed: November 16, 2025_

This document tracks the remaining deltas between the shipping LFTS runtime (v0.9.0)
and the desired “production-ready” validator. It supplements
[docs/FUTURE_DIRECTION.md](FUTURE_DIRECTION.md) and the release notes by focusing
specifically on runtime capabilities, ergonomics, and diagnostics.

## Recent Improvements (Since v0.8.0)

- ✅ **Type Object System (v0.10.0 dev branch)** – Builder API, rich
  introspection, and zero-overhead schema wrappers are implemented and fully
  documented; legacy bytecode arrays remain supported.
- ✅ **Pipeline extraction (v0.9.0)** – Optional helper moved to
  `packages/lfts-type-runtime/pipeline.ts`, keeping the core `mod.ts` surface
  lean and composable.
- ✅ **Distributed helpers (v0.9.0)** – HTTP + resilience helpers follow the
  “composable primitives over layered frameworks” ethos and return
  `Result<T, NetworkError>` end-to-end.
- ✅ **Refinements & Aggregation** – Numeric/string refinements, array min/max,
  and `validateAll()` error aggregation are all stable and documented.
- ✅ **Performance guardrails** – DUNION caching, lazy error paths, and
  result-based unions are the default fast path; tree-shaking keeps optional
  modules out of core bundles.

## Current Gaps

### 1. Type Surface & Semantics

- ❌ **Recursive / self-referential schemas** – Cyclic graphs and trees are still
  unsupported at runtime; compiler forbids them entirely.
- ❌ **Generics, mapped, conditional, and template literal types** – These
  constructs remain compile-only and cannot be reified into runtime schemas.
- ❌ **Index signatures / dictionaries** – `{ [k: string]: T }` and unbounded
  object keys remain unsupported, partly to avoid prototype-pollution vectors.
- ❌ **Function types** – Policies still reject function-valued schemas; this is
  intentional but should be called out whenever users request RPC-like types.
- ⚠️ **Readonly semantics** – Runtime treats `READONLY` as pass-through (compile
  time only). Documented in README, but runtime enforcement remains shallow.

### 2. Validation Constraints & Refinements

- ✅ **Available today:** numeric min/max/integer/range, string length/pattern/
  email/url, array min/max items, structural brands.
- ❌ **Missing refinements:** exclusive bounds (`>` `<`), multiples, UUID/timezone
  formats, string pattern families (ISO date, ULID), array uniqueness,
  per-index tuple rules, and cross-field constraints (`oneOf`, property dependencies).
- ⚠️ **Composite constraints:** There is no `allOf`/`oneOf` composition at runtime;
  developers must encode these rules manually via custom ports or post-validators.
- ⚠️ **Brand-aware runtime checks:** Brands are purely structural; there’s no
  runtime enforcement beyond shape validation.

### 3. Error Reporting & Diagnostics

- ⚠️ **Union diagnostics** – Errors still read “no union alternative matched”
  without “closest match” hints. Feature is prioritized (see FUTURE_DIRECTION
  high-priority item #1) but not implemented yet.
- ⚠️ **Source mapping** – There is no link back to the originating
  `typeOf<T>()` or `.schema.ts` location, so large schemas are hard to debug.
- ⚠️ **Path metadata** – Paths include dotted keys and indices, but there is no
  schema hash or identifier to correlate repeated failures across services.
- ✅ **Aggregation** – `validateAll()` collects multiple errors with a configurable
  `maxErrors`, which dramatically improves DX for data ingest workflows.

### 4. Performance, Memory & Observability

- ✅ **Throughput:** Benchmarked at 8–16M ops/sec for DUNION-heavy workloads and
  22M ops/sec for cold-path introspection (see `docs/TYPE_OBJECTS.md`).
- ✅ **Memory:** Type-object wrappers (~48 B per schema) and caches (~24 B per
  property) are predictable and lazily allocated.
- ⚠️ **Long-running soak tests:** No automated soak/perf test exists to detect
  memory leaks when thousands of schemas are validated in-process. Add a
  stress harness before 1.0.
- ⚠️ **Schema identity / memoization:** There is still no stable schema hash to
  cache validation plans or deduplicate serialized forms.
- ⚠️ **Observability hooks:** `inspect()` exists, but there is no first-class
  event stream for validation timings or structured failures.

### 5. Tooling & Ecosystem

- ⚠️ **JSON Schema / OpenAPI export:** Not yet available. This limits interop
  with downstream tooling and swagger-based clients.
- ⚠️ **Schema registry / cache artifacts:** Compiler emits bytecode inline; there
  is no `.lfts-cache` story yet (still listed as a future enhancement).
- ⚠️ **Plugin/refinement hooks:** Runtime cannot register user-defined
  refinements or encoders, forcing bespoke forks for advanced scenarios.
- ⚠️ **AsyncResult + pipeline alignment:** `pipeline.ts` still throws
  `PipelineExecutionError` on `.run()` and lacks the proposed `.runSafe()`.
- ✅ **Light-FP enforcement:** No OOP constructs, ports/capabilities discipline,
  and “composable primitives over layered frameworks” remain core design guardrails.

## Prioritized Backlog

| Priority | Gap | Notes / Next Step |
| --- | --- | --- |
| **High** | Union diagnostics with “closest match” hints | Needed for DX; influences release readiness. |
| **High** | Source mapping from bytecode back to schema | Enables actionable errors and tooling. |
| **High** | Pipeline `.runSafe()` / zero-throw guarantee | Aligns optional module with Result-first philosophy. |
| **Medium** | Schema identity + memoized validation plans | Unlocks caching and dedup across services. |
| **Medium** | Advanced refinements (exclusive bounds, UUID, uniqueness) | Frequently requested; easy wins once opcodes exist. |
| **Medium** | JSON Schema / OpenAPI export | Required for integration with external systems. |
| **Low** | Plugin/refinement hook architecture | Nice-to-have once high-priority items land. |

## Release Considerations

- **Documentation alignment:** README, CLAUDE, and CHANGELOG already describe
  the pipeline subpath import. Any other doc referencing `import { pipe } from
  "./mod.ts"` is now incorrect and must be updated before GA.
- **Philosophy check:** Distributed helpers, pipeline extraction, and the runtime
  README consistently reiterate “composable primitives over layered frameworks.”
  Keep this language in every new guide to avoid regressions.
- **Upgrade guidance:** Continue pointing users at CHANGELOG + README sections
  for migration steps (pipeline import, no core API removals). If additional
  breaking changes arise, append clear “Before / After” snippets here.

## Appendix: Mapping to Future Direction

- FUTURE_DIRECTION high-priority items 1–3 map to the “High” row above.
- Incremental compilation and schema caching appear under “Tooling & Ecosystem”.
- Any additional throws (depth limit, pipeline) should be tracked alongside the
  zero-throw initiative referenced in the roadmap.
