# LFTS Tutorial Examples

This directory contains a progressive series of runnable examples. Work through them in order for the smoothest learning curve.

| #  | Folder                     | Focus                                                   |
|----|----------------------------|---------------------------------------------------------|
| 01 | `01-basic-validation`      | Primitive/object schemas and boundary validation        |
| 02 | `02-optional-readonly`     | Optional fields, readonly collections, aggregated errors|
| 03 | `03-unions-adt`            | Discriminated unions (ADTs) and detailed diagnostics    |
| 04 | `04-result-pattern`        | Modelling `Result<T, E>` style flows                    |
| 05 | `05-branded-types`         | Nominal typing with brands                              |
| 06 | `06-ports`                 | Validating capability ports                             |
| 07 | `07-async-result`          | Async error handling with `AsyncResult` helpers         |
| 08 | `08-pattern-matching`      | Exhaustive `match()` usage over ADTs                    |
| 09 | `09-mini-application`      | Putting it all together in a tiny hexagonal script      |
| 10 | `10-distributed-execution` | Resilient HTTP helpers, retries, and capability wiring   |
| 11 | `11-workflow-orchestration`| Workflow graphs, conditional stages, DAG snapshots      |
| 12 | `12-stage-types`           | Stage catalogs with backend + HTMX-driven UI components  |

## Usage pattern

For every example:

```bash
cd examples/NN-example-name
# Compile TypeScript → JavaScript with bytecode literals
deno run -A ../../packages/lfts-type-compiler/src/cli.ts . --outDir ./build
# Execute the compiled program
deno run -A build/main.js
```

Each example folder contains a `README.md` with learning objectives, walkthrough, and links to the relevant docs (`LANG-SPEC.md`, `EFFECTS_GUIDE.md`, etc.).

The examples favour composable primitives, explicit schemas, and validated ports—mirroring the Light-FP philosophy outlined in `docs/FUTURE_DIRECTION.md`.
