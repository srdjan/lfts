---
title: Building Workflow Engines from Type Schemas
date: 2025-01-17
tags: [TypeScript, Workflows, Introspection, Light-FP, Retry, Concurrency]
excerpt: Most workflow engines require YAML configs or decorators. What if your type schemas could define validation AND workflow steps? LFTS v0.12.0 adds automatic retry and parallel execution—still zero dependencies, still just pure functions.
---

I spent two weeks evaluating workflow engines for a client's approval system. Camunda needed Java and XML. AWS Step Functions locked us into their ecosystem. Temporal wanted a dedicated cluster. All I needed was: validate inputs, run some async steps, handle retries. That's when I realized—LFTS schemas already had everything.

Here's the surprising bit: schema metadata makes workflows self-documenting. Each step is just a function with typed inputs and outputs. The engine validates transitions automatically. No YAML, no decorators, no magic. And with v0.12.0, retry and parallel execution work out of the box.

Let me show you how to build a PR review workflow in ~100 lines, with automatic retries and concurrent steps.

## The Core Pattern

A workflow step is a function with typed inputs and outputs. The trick is attaching metadata that describes what the step does:

```typescript
import { t, withMetadata, Result } from "lfts-runtime";

// Define schemas for each workflow stage
const OpenPRInput$ = withMetadata(
  t.object({
    title: t.string().minLength(10),
    description: t.string().minLength(20),
    branch: t.string().pattern("^feature/.*"),
  }).bc,
  {
    name: "OpenPRInput",
    description: "Initial PR creation data",
    stage: "open"
  }
);

const OpenPROutput$ = withMetadata(
  t.object({
    prId: t.string().pattern("^pr_[0-9]+$"),
    status: t.literal("open"),
    title: t.string(),
    checksRequired: t.number().min(1)
  }).bc,
  {
    name: "OpenPROutput",
    description: "Created PR with initial state",
    stage: "open"
  }
);
```

The `withMetadata()` wrapper adds custom properties to schemas without affecting validation. You can attach stage names, descriptions, required permissions—whatever makes sense for your domain.

## The Step Executor

Here's the cool part: you can build a generic executor that validates inputs and outputs automatically:

```typescript
import { validateSafe, executeStep, type WorkflowStep } from "lfts-runtime";

type WorkflowError =
  | { type: "validation_failed"; stage: string; errors: ValidationError }
  | { type: "output_invalid"; stage: string; errors: ValidationError }
  | { type: "workflow_stopped"; reason: string };

const openPRStep: WorkflowStep<OpenPRInput, OpenPROutput, never> = {
  name: "OpenPR",
  inputSchema: OpenPRInput$,
  outputSchema: OpenPROutput$,
  execute: async (input) => {
    // Your business logic here - input is already validated
    const prId = `pr_${Math.floor(Math.random() * 10000)}`;

    return Result.ok({
      prId,
      status: "open" as const,
      title: input.title,
      description: input.description,
      branch: input.branch,
      checksRequired: 3
    });
  }
};

// Execute with automatic validation
const result = await executeStep(openPRStep, prData);
if (result.ok) {
  console.log("Step succeeded:", result.value);
} else {
  // Explicit error handling with exact failure point
  console.error("Step failed:", result.error);
}
```

Your business logic never sees invalid data. Input validation happens before execution, output validation after. If either fails, you get a typed error with the exact stage that broke.

## Automatic Retry (v0.12.0)

This is where it gets interesting. Most workflow engines force you to write retry logic by hand or configure it in separate YAML. LFTS lets you attach retry config directly to step metadata:

```typescript
import { type RetryConfig } from "lfts-runtime";

const flakyApiStep: WorkflowStep<ApiRequest, ApiResponse, NetworkError> = {
  name: "CallExternalAPI",
  inputSchema: ApiRequest$,
  outputSchema: ApiResponse$,
  execute: async (input) => {
    // Potentially flaky API call
    return await httpGet<ApiResponse>(url, ApiResponse$);
  },
  metadata: {
    retry: {
      maxAttempts: 3,
      initialDelayMs: 100,
      backoffMultiplier: 2,
      maxDelayMs: 5000,
      shouldRetry: (error, attempt) => {
        // Only retry transient errors
        return error.type === "timeout" || error.type === "connection_refused";
      }
    }
  }
};

// Retry happens automatically during executeStep()
const result = await executeStep(flakyApiStep, request);
```

Look at this—the retry logic lives with the step definition. No separate configuration file to keep in sync. The `shouldRetry` predicate gives you full control: retry on timeouts, but not on auth failures. Exponential backoff is automatic.

To me is interesting that this reuses `withRetry()` from the distributed module. Same resilience primitives, just integrated into workflows. No duplicate code, no surprises.

## Parallel Execution (v0.12.0)

Sequential workflows are fine for some things. But what if you need to fetch user data, posts, and comments concurrently? Most engines make you write custom orchestration code or use special parallel constructs.

LFTS gives you two modes: fail-fast and settle-all:

```typescript
import { executeStepsInParallel } from "lfts-runtime";

// Fail-fast mode - stops on first error
const result = await executeStepsInParallel([
  { step: fetchUserStep, input: { userId: "123" } },
  { step: fetchPostsStep, input: { userId: "123" } },
  { step: fetchCommentsStep, input: { userId: "123" } }
], { mode: "fail-fast" });

if (result.mode === "fail-fast" && result.result.ok) {
  const [user, posts, comments] = result.result.value;
  console.log("All steps succeeded:", { user, posts, comments });
}

// Settle-all mode - waits for all steps, collects partial results
const result2 = await executeStepsInParallel([
  { step: step1, input: data1 },
  { step: step2, input: data2 },
  { step: step3, input: data3 }
], { mode: "settle-all" });

if (result2.mode === "settle-all") {
  console.log(`${result2.successes.length} succeeded, ${result2.failures.length} failed`);

  // Process partial results - maybe 2/3 services are enough
  result2.successes.forEach(value => processSuccess(value));
  result2.failures.forEach(error => logError(error));
}
```

Fail-fast is for when you need all results or nothing. Settle-all is for graceful degradation—maybe your dashboard can show user info even if comments failed to load.

The type safety here is beautiful. All steps in parallel execution must have the same error type. The discriminated union return type forces you to handle both modes explicitly. No runtime surprises.

## Observability Without Mutation

The `inspect()` hook lets you observe validation without changing schemas. Perfect for logging workflow transitions:

```typescript
import { inspect, createObservableSchema } from "lfts-runtime";

function createObservableSchema<T>(
  schema: TypeObject,
  stageName: string
): TypeObject {
  const inspected = inspect(schema, (ctx) => {
    ctx.onSuccess((value) => {
      console.log(`✓ ${stageName}: validation passed`, {
        timestamp: new Date().toISOString(),
        properties: Object.keys(value)
      });
    });

    ctx.onFailure((error) => {
      console.error(`✗ ${stageName}: validation failed`, {
        timestamp: new Date().toISOString(),
        error: error.message
      });
    });
  });

  return inspected.schema;
}

// Wrap your schemas with observability
const ObservableInput$ = createObservableSchema(OpenPRInput$, "OpenPR-Input");
```

Every validation logs success or failure automatically. Zero overhead when validation passes (hooks only fire when needed). You get detailed diagnostics when things break.

## Complete PR Workflow with Retry and Parallel Steps

Here's a real workflow that shows all the pieces together:

```typescript
// Step 1: Open PR (basic validation)
const openPRStep: WorkflowStep<OpenPRInput, OpenPROutput, never> = {
  name: "OpenPR",
  inputSchema: OpenPRInput$,
  outputSchema: OpenPROutput$,
  execute: async (input) => {
    const prId = `pr_${Math.floor(Math.random() * 10000)}`;
    return Result.ok({
      prId,
      status: "open" as const,
      title: input.title,
      description: input.description,
      branch: input.branch,
      checksRequired: 3
    });
  }
};

// Step 2: Review PR (with retry for flaky CI systems)
const reviewPRStep: WorkflowStep<ReviewPRInput, ReviewPROutput, ReviewError> = {
  name: "ReviewPR",
  inputSchema: ReviewPRInput$,
  outputSchema: ReviewPROutput$,
  execute: async (input) => {
    // Run CI checks (might be flaky)
    const checksResult = await runCIChecks(input.prId);
    if (!checksResult.ok) {
      return Result.err({ type: "checks_failed", failedChecks: checksResult.error });
    }

    // Check approvals
    if (input.approvals < 2) {
      return Result.err({ type: "insufficient_approvals", required: 2, actual: input.approvals });
    }

    return Result.ok({
      prId: input.prId,
      status: "approved" as const,
      approvals: input.approvals,
      allChecksPassed: true
    });
  },
  metadata: {
    retry: {
      maxAttempts: 3,
      initialDelayMs: 1000,
      shouldRetry: (error) => error.type === "checks_failed"  // Retry CI failures, not approval issues
    }
  }
};

// Step 3: Merge PR (fetch multiple things in parallel)
const mergePRStep: WorkflowStep<MergePRInput, MergePROutput, MergeError> = {
  name: "MergePR",
  inputSchema: MergePRInput$,
  outputSchema: MergePROutput$,
  execute: async (input) => {
    // Fetch multiple pieces of data concurrently
    const parallelResult = await executeStepsInParallel([
      { step: fetchBranchInfoStep, input: { prId: input.prId } },
      { step: fetchConflictsStep, input: { prId: input.prId } },
      { step: fetchReviewersStep, input: { prId: input.prId } }
    ], { mode: "fail-fast" });

    if (parallelResult.mode === "fail-fast" && !parallelResult.result.ok) {
      return Result.err({ type: "preflight_failed", reason: parallelResult.result.error });
    }

    // All checks passed, perform merge
    const commitSha = await performMerge(input.prId);

    return Result.ok({
      prId: input.prId,
      status: "merged" as const,
      mergedAt: Date.now(),
      commitSha
    });
  }
};

// Run the workflow
async function runPRWorkflow(initialData: unknown) {
  // Step 1: Open
  const openResult = await executeStep(openPRStep, initialData);
  if (!openResult.ok) return openResult;

  // Step 2: Review (with automatic retry)
  const reviewInput = { ...openResult.value, approvals: 2 };
  const reviewResult = await executeStep(reviewPRStep, reviewInput);
  if (!reviewResult.ok) return reviewResult;

  if (reviewResult.value.status === "rejected") {
    return Result.err({
      type: "workflow_stopped" as const,
      reason: "PR was rejected during review"
    });
  }

  // Step 3: Merge (with parallel preflight checks)
  return await executeStep(mergePRStep, reviewResult.value);
}
```

Look at what happened here: the workflow is self-validating. You can't pass a PR from "open" to "merge" without going through "review"—the schemas enforce the state machine. Try to merge a PR with only 1 approval? Schema validation catches it before your business logic runs.

The retry happens automatically on CI failures, but not on insufficient approvals (because retrying won't help there). The merge step fetches three pieces of data concurrently before performing the merge. All with explicit error types, no exceptions, no surprises.

## Schema Introspection for Documentation

You can introspect the workflow itself by examining schema metadata:

```typescript
import { analyzeWorkflow, introspect, getRefinements } from "lfts-runtime";

const analysis = analyzeWorkflow([openPRStep, reviewPRStep, mergePRStep]);

console.log(JSON.stringify(analysis, null, 2));
// [
//   {
//     "name": "OpenPR",
//     "inputFields": [
//       { "name": "title", "required": true, "constraints": ["minLength"] },
//       { "name": "description", "required": true, "constraints": ["minLength"] },
//       { "name": "branch", "required": true, "constraints": ["pattern"] }
//     ],
//     "outputFields": ["prId", "status", "title", "checksRequired"],
//     "metadata": { "stage": "open", "permissions": ["user", "admin"] }
//   },
//   ...
// ]
```

This generates documentation from your schemas. No manual docs to keep in sync. Schema changes automatically update your workflow analysis. You can feed this to diagram generators, test scaffolding, OpenAPI specs—whatever you need.

## Real Talk: When This Works and When It Doesn't

**Where this shines:**
- Multi-step processes with clear state transitions (approvals, fulfillment, onboarding)
- Type-safe workflows without YAML/JSON config sprawl
- Teams that want workflow logic in code, not external DSLs
- API orchestration with retry and parallel steps (the v0.12.0 additions nail this)
- Debugging—you see exactly which validation failed and why
- Testing—every step is just a function with typed inputs/outputs

**Where it falls short:**
- Complex branching with deeply nested conditionals (gets messy fast)
- Long-running workflows that need persistence (you need to add your own state storage—Postgres, Redis, whatever)
- Dynamic workflows where steps change based on runtime conditions (you can hack it, but it fights the design)
- Visual workflow designers for non-technical users (they won't write schemas)
- Saga patterns with complex compensation logic (doable but not ergonomic yet)

For simple linear workflows with validation-heavy steps, this pattern is surprisingly elegant. For orchestrating dozens of microservices with complex compensation, you probably want Temporal or a real workflow engine.

The sweet spot: internal tools, approval flows, data pipelines, API aggregation. Places where type safety and explicit error handling matter more than visual designers.

---

This workflow engine is ~100 lines including observability, retry, and parallel execution. Compare that to setting up Camunda or AWS Step Functions. No XML, no separate config files, just TypeScript types doing triple duty as validation, workflow definition, and documentation.

The pattern works because LFTS schemas are just data. You can pass them around, attach metadata, inspect them at runtime. They're not magic compiler constructs—they're values you can reason about.

What surprised me most: adding retry and parallel execution to v0.12.0 took ~6 hours. Most of that was writing tests. The actual implementation reused existing primitives (`withRetry()` from distributed module, `Promise.all()` with Result checking). When your foundation is composable primitives, new features come almost for free.

Full working example lives in `examples/11-workflow-orchestration/` with 8 complete demos. Run `deno run -A main.ts` to see all patterns in action. Works with Deno and Node, zero dependencies beyond LFTS runtime.

_Working on this while listening to Bill Evans' Sunday at the Village Vanguard. That's the vibe here—complex patterns that feel inevitable once you see them. Simple on surface, depth underneath._
