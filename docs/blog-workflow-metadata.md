---
title: Building Workflow Engines from Type Schemas
date: 2025-01-17
tags: [
  TypeScript,
  Workflows,
  Introspection,
  Light-FP,
  Retry,
  Concurrency,
  Dynamic-Workflows,
]
excerpt: Most workflow engines require YAML configs or decorators. What if your type schemas could define validation AND workflow steps? LFTS v0.13.0 adds dynamic workflows with conditional execution—steps that run only when runtime data says they should.
---

Recently, I spent some time evaluating workflow engines for a client's approval
system. Camunda needed Java and XML. AWS Step Functions locked us into their
ecosystem. Temporal wanted a dedicated cluster. All I needed was: validate
inputs, run some async steps, handle retries, conditionally skip stages based on
data. That's when I realized—LFTS schemas already had everything.

Here's the surprising bit: schema metadata makes workflows self-documenting.
Each step is just a function with typed inputs and outputs. The engine validates
transitions automatically. No YAML, no decorators, no magic. And with v0.12.0's
retry and parallel execution, plus v0.13.0's conditional stages, you get dynamic
workflows that adapt to runtime conditions.

> **Update (v0.14.0):** Runtime support for stage catalogs + HTMX fragments now
> ships in `stage-types.ts`. Wrap steps with `defineBackendFunctionStage()` /
> `defineFullStackHtmxStage()`, toss them into a `createStageCatalog()`, and the
> workflow graph, documentation, and router wiring stay perfectly aligned.

> **Update (v0.15.0):** MCP server support lets you expose workflow catalogs to
> AI agents—Claude Desktop, custom agents, anything that speaks the Model
> Context Protocol. Stage metadata becomes tool descriptions automatically.
> Conversational workflow invocation with full type safety. See the AI Agent
> Integration section below.

Let me show you how to build a PR review workflow with automatic retries,
concurrent steps, and conditional execution—all type-safe, all in ~150 lines.

## The Core Pattern

A workflow step is a function with typed inputs and outputs. The trick is
attaching metadata that describes what the step does:

```typescript
import { Result, t, withMetadata } from "lfts-runtime";

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
    stage: "open",
  },
);

const OpenPROutput$ = withMetadata(
  t.object({
    prId: t.string().pattern("^pr_[0-9]+$"),
    status: t.literal("open"),
    title: t.string(),
    checksRequired: t.number().min(1),
  }).bc,
  {
    name: "OpenPROutput",
    description: "Created PR with initial state",
    stage: "open",
  },
);
```

The `withMetadata()` wrapper adds custom properties to schemas without affecting
validation. You can attach stage names, descriptions, required
permissions—whatever makes sense for your domain.

## The Step Executor

Here's the cool part: you can build a generic executor that validates inputs and
outputs automatically:

```typescript
import { executeStep, validateSafe, type WorkflowStep } from "lfts-runtime";

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
      checksRequired: 3,
    });
  },
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

Your business logic never sees invalid data. Input validation happens before
execution, output validation after. If either fails, you get a typed error with
the exact stage that broke.

## Automatic Retry (v0.12.0)

This is where it gets interesting. Most workflow engines force you to write
retry logic by hand or configure it in separate YAML. LFTS lets you attach retry
config directly to step metadata:

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
      },
    },
  },
};

// Retry happens automatically during executeStep()
const result = await executeStep(flakyApiStep, request);
```

Look at this—the retry logic lives with the step definition. No separate
configuration file to keep in sync. The `shouldRetry` predicate gives you full
control: retry on timeouts, but not on auth failures. Exponential backoff is
automatic.

To me is interesting that this reuses `withRetry()` from the distributed module.
Same resilience primitives, just integrated into workflows. No duplicate code,
no surprises.

## Parallel Execution (v0.12.0)

Sequential workflows are fine for some things. But what if you need to fetch
user data, posts, and comments concurrently? Most engines make you write custom
orchestration code or use special parallel constructs.

LFTS gives you two modes: fail-fast and settle-all:

```typescript
import { executeStepsInParallel } from "lfts-runtime";

// Fail-fast mode - stops on first error
const result = await executeStepsInParallel([
  { step: fetchUserStep, input: { userId: "123" } },
  { step: fetchPostsStep, input: { userId: "123" } },
  { step: fetchCommentsStep, input: { userId: "123" } },
], { mode: "fail-fast" });

if (result.mode === "fail-fast" && result.result.ok) {
  const [user, posts, comments] = result.result.value;
  console.log("All steps succeeded:", { user, posts, comments });
}

// Settle-all mode - waits for all steps, collects partial results
const result2 = await executeStepsInParallel([
  { step: step1, input: data1 },
  { step: step2, input: data2 },
  { step: step3, input: data3 },
], { mode: "settle-all" });

if (result2.mode === "settle-all") {
  console.log(
    `${result2.successes.length} succeeded, ${result2.failures.length} failed`,
  );

  // Process partial results - maybe 2/3 services are enough
  result2.successes.forEach((value) => processSuccess(value));
  result2.failures.forEach((error) => logError(error));
}
```

Fail-fast is for when you need all results or nothing. Settle-all is for
graceful degradation—maybe your dashboard can show user info even if comments
failed to load.

The type safety here is beautiful. All steps in parallel execution must have the
same error type. The discriminated union return type forces you to handle both
modes explicitly. No runtime surprises.

## Dynamic Workflows with Conditional Execution (v0.13.0)

Here's where it gets really interesting. What if you need steps that only run
when runtime data says they should? Security scans only for auth-related PRs.
Performance tests only for optimization branches. Conditional merges based on
review status.

Most workflow engines make you write imperative if/else spaghetti or define
separate workflow variants. LFTS v0.13.0 gives you declarative conditionals with
`when` predicates:

```typescript
import {
  fromStage,
  graphBuilder,
  matchRoute,
} from "lfts-runtime/workflow-graph";

const dynamicPRWorkflow = graphBuilder<PRInput>()
  .seed(prData)
  // Always runs
  .stage({
    name: "openPR",
    step: openPRStep,
    resolve: (ctx) => ctx.seed,
  })
  // Conditional - only for security branches
  .stage({
    name: "securityScan",
    step: securityScanStep,
    dependsOn: ["openPR"],
    when: (ctx) => {
      const pr = ctx.get("openPR");
      return pr.branch.includes("security") || pr.branch.includes("auth");
    },
    resolve: fromStage("openPR"),
  })
  // Always runs
  .stage({
    name: "reviewPR",
    step: reviewPRStep,
    dependsOn: ["openPR"],
    resolve: fromStage("openPR"),
  })
  // Conditional merge - only if approved
  .stage({
    name: "mergePR",
    step: mergePRStep,
    dependsOn: ["reviewPR"],
    when: (ctx) => {
      const review = ctx.get("reviewPR");
      return review.status === "approved";
    },
    resolve: fromStage("reviewPR"),
  })
  // Conditional close - only if rejected
  .stage({
    name: "closePR",
    step: closePRStep,
    dependsOn: ["reviewPR"],
    when: (ctx) => {
      const review = ctx.get("reviewPR");
      return review.status === "rejected";
    },
    resolve: fromStage("reviewPR"),
  })
  .build();

const result = await dynamicPRWorkflow.run();

// Skipped stages visible in snapshots
result.value.snapshots.forEach((snap) => {
  console.log(`${snap.name}: ${snap.status}`);
  // Output: openPR: ok, securityScan: skipped, reviewPR: ok, mergePR: ok, closePR: skipped
});
```

Look at this—the workflow structure is static (you define all possible stages
upfront), but execution is dynamic (runtime data decides what actually runs).
Security scan gets skipped for regular feature branches. Merge runs only if
approved. Close runs only if rejected.

The `when` predicate is just a function that receives the workflow context. It
can access any completed stage's output via `ctx.get()`. Return `true` to run
the stage, `false` to skip it. TypeScript ensures you can't access stages that
haven't run yet.

### Pattern Matching for Routing

For discriminated unions (ADTs), there's a cleaner pattern than multiple
conditionals:

```typescript
import { matchRoute } from "lfts-runtime/workflow-graph";

type ReviewStatus =
  | { type: "approved"; approvals: number }
  | { type: "rejected"; reason: string }
  | { type: "needs_changes"; comments: string[] };

const review: ReviewStatus = { type: "approved", approvals: 2 };

const action = matchRoute(review, {
  approved: { nextStage: "merge", priority: "high" },
  rejected: { nextStage: "close", priority: "low" },
  needs_changes: { nextStage: "notify", priority: "medium" },
});
// action = { nextStage: "merge", priority: "high" }
```

This is type-safe routing for ADTs. The compiler enforces exhaustiveness—you
must handle all variants. Throws a descriptive error at runtime if you miss a
case (though TypeScript won't let you compile if you do).

To me is interesting that this works with async predicates too:

```typescript
.stage({
  name: "expensiveCheck",
  step: expensiveCheckStep,
  when: async (ctx) => {
    const pr = ctx.get("openPR");
    const config = await fetchProjectConfig(pr.projectId);
    return config.enableExpensiveChecks && pr.branch.startsWith("release/");
  },
  resolve: fromStage("openPR")
})
```

The predicate can be async, can call external services, can return
`Result<boolean, E>` for explicit error handling. If the predicate returns
`Result.err()`, the stage gets skipped (treated as false). No exceptions, all
errors typed.

### Observability for Conditional Stages

Skipped stages show up in execution snapshots with a dedicated `skipped` status:

```typescript
const result = await workflow.run();

if (result.ok) {
  for (const snap of result.value.snapshots) {
    const icon = snap.status === "ok"
      ? "✓"
      : snap.status === "skipped"
      ? "⊘"
      : "✗";
    console.log(`${icon} ${snap.name}: ${snap.status} (${snap.durationMs}ms)`);
  }
}

// Output:
// ✓ openPR: ok (120ms)
// ⊘ securityScan: skipped (1ms)
// ✓ reviewPR: ok (150ms)
// ✓ mergePR: ok (300ms)
// ⊘ closePR: skipped (0ms)
```

You see exactly which stages ran and which were skipped. The timing data shows
predicate evaluation overhead (typically <1ms). Dependent stages still execute
even if their dependencies were skipped—the DAG structure handles this
automatically.

## Observability Without Mutation

The `inspect()` hook lets you observe validation without changing schemas.
Perfect for logging workflow transitions:

```typescript
import { createObservableSchema, inspect } from "lfts-runtime";

function createObservableSchema<T>(
  schema: TypeObject,
  stageName: string,
): TypeObject {
  const inspected = inspect(schema, (ctx) => {
    ctx.onSuccess((value) => {
      console.log(`✓ ${stageName}: validation passed`, {
        timestamp: new Date().toISOString(),
        properties: Object.keys(value),
      });
    });

    ctx.onFailure((error) => {
      console.error(`✗ ${stageName}: validation failed`, {
        timestamp: new Date().toISOString(),
        error: error.message,
      });
    });
  });

  return inspected.schema;
}

// Wrap your schemas with observability
const ObservableInput$ = createObservableSchema(OpenPRInput$, "OpenPR-Input");
```

Every validation logs success or failure automatically. Zero overhead when
validation passes (hooks only fire when needed). You get detailed diagnostics
when things break.

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
      checksRequired: 3,
    });
  },
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
      return Result.err({
        type: "checks_failed",
        failedChecks: checksResult.error,
      });
    }

    // Check approvals
    if (input.approvals < 2) {
      return Result.err({
        type: "insufficient_approvals",
        required: 2,
        actual: input.approvals,
      });
    }

    return Result.ok({
      prId: input.prId,
      status: "approved" as const,
      approvals: input.approvals,
      allChecksPassed: true,
    });
  },
  metadata: {
    retry: {
      maxAttempts: 3,
      initialDelayMs: 1000,
      shouldRetry: (error) => error.type === "checks_failed", // Retry CI failures, not approval issues
    },
  },
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
      { step: fetchReviewersStep, input: { prId: input.prId } },
    ], { mode: "fail-fast" });

    if (parallelResult.mode === "fail-fast" && !parallelResult.result.ok) {
      return Result.err({
        type: "preflight_failed",
        reason: parallelResult.result.error,
      });
    }

    // All checks passed, perform merge
    const commitSha = await performMerge(input.prId);

    return Result.ok({
      prId: input.prId,
      status: "merged" as const,
      mergedAt: Date.now(),
      commitSha,
    });
  },
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
      reason: "PR was rejected during review",
    });
  }

  // Step 3: Merge (with parallel preflight checks)
  return await executeStep(mergePRStep, reviewResult.value);
}
```

Look at what happened here: the workflow is self-validating. You can't pass a PR
from "open" to "merge" without going through "review"—the schemas enforce the
state machine. Try to merge a PR with only 1 approval? Schema validation catches
it before your business logic runs.

The retry happens automatically on CI failures, but not on insufficient
approvals (because retrying won't help there). The merge step fetches three
pieces of data concurrently before performing the merge. All with explicit error
types, no exceptions, no surprises.

## Schema Introspection for Documentation

You can introspect the workflow itself by examining schema metadata:

```typescript
import { analyzeWorkflow, getRefinements, introspect } from "lfts-runtime";

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

This generates documentation from your schemas. No manual docs to keep in sync.
Schema changes automatically update your workflow analysis. You can feed this to
diagram generators, test scaffolding, OpenAPI specs—whatever you need.

## AI Agent Integration (v0.15.0)

Here's where it gets really interesting. What if AI agents could discover and
invoke your workflows conversationally? Not through function calling with
hand-written descriptions, but by reading the same metadata that makes your
workflows self-documenting?

The Model Context Protocol (MCP) is Anthropic's open standard for tool
integration. LFTS v0.15.0 ships an MCP server that exposes workflow catalogs to
any MCP-compatible agent—Claude Desktop, custom agents, whatever. The cool part:
stage metadata becomes tool descriptions automatically.

```typescript
import { createMcpServer } from "lfts-mcp-server";

// Create MCP server from your catalog
const server = createMcpServer(catalog, {
  name: "pr-workflows",
  includeMetadata: true,
  includeRetryInfo: true,
});

// List tools (for MCP protocol)
const tools = server.listTools();
// [
//   {
//     name: "ReviewPR",
//     description: "Review PR with CI checks and approval validation...\n\n**Owners:** platform-team\n**Tags:** pr, critical\n**Retry:** 3 attempts, exponential backoff...",
//     inputSchema: { type: "object", properties: {...}, required: [...] }
//   }
// ]

// Execute tool
const result = await server.callTool("ReviewPR", {
  prId: "pr_123",
  approvals: 2,
});

if (result.success) {
  console.log(result.data); // Typed output
  console.log(result.metadata.durationMs); // Execution timing
}
```

The metadata you already wrote for documentation? It now powers AI tool
descriptions. Owners, tags, retry policies, links to runbooks—all visible to the
agent. No duplicate configuration.

### Conversational Workflow Invocation

Imagine talking to Claude Desktop about your workflows:

**You:** "I need to review PR 456 that just came in."

**Claude:** _[Discovers `ReviewPR` tool in catalog, reads description and retry
config]_
_[Calls tool with validated parameters]_
"I've reviewed PR 456. The CI checks passed after 1 retry (flaky test), and it
has 2 approvals. Status is approved. Would you like me to merge it?"

**You:** "Yes, merge it."

**Claude:** _[Calls `MergePR` tool]_
"Merged successfully. Commit SHA: abc123. The workflow ran preflight checks in
parallel before merging."

Look at this—the agent understood the workflow structure by reading stage
metadata. It knew retry happened automatically. It explained what happened behind
the scenes. All because your stages were self-documenting from day one.

### Resource Browsing

Agents can also browse the catalog to discover workflows:

```typescript
// List all payment-related workflows
const paymentStages = server.readResource("lfts://catalog/tags/payment");

// Filter backend stages only
const backendStages = server.readResource(
  "lfts://catalog/kinds/backend_function",
);

// Get catalog statistics
const stats = server.readResource("lfts://catalog/stats");
// { totalStages: 10, backendStages: 7, htmxStages: 3, tags: [...], owners: [...] }
```

To me is interesting that this uses the same catalog you built for your
application. No separate API layer, no duplicate definitions. The agent sees what
your code sees.

### Integration Example

Here's how you expose workflows to Claude Desktop:

```typescript
import { Server } from "@modelcontextprotocol/sdk/server";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio";

// Create LFTS MCP server
const lftsServer = createMcpServer(catalog);

// Wrap with MCP protocol server
const mcpServer = new Server(
  { name: "pr-workflows", version: "1.0.0" },
  { capabilities: { tools: {}, resources: {} } },
);

// Register handlers
mcpServer.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: lftsServer.listTools(),
}));

mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
  const result = await lftsServer.callTool(
    request.params.name,
    request.params.arguments,
  );

  if (result.success) {
    return {
      content: [{ type: "text", text: JSON.stringify(result.data) }],
    };
  } else {
    throw new McpError(
      ErrorCode.InternalError,
      JSON.stringify(result.error),
    );
  }
});

// Start stdio transport (for Claude Desktop)
const transport = new StdioServerTransport();
await mcpServer.connect(transport);
```

Add this to your Claude Desktop config, and your workflows become
conversational. The agent can list available operations, read descriptions with
retry policies and owners, validate parameters against schemas, and invoke
workflows with typed results.

The pattern works because LFTS workflows were already metadata-driven. Adding MCP
support was just exposing what was already there. Same philosophy: schemas as
data, metadata as documentation, composition over configuration.

Full example lives in `examples/13-mcp-server/` with payment workflows, catalog
browsing, and error handling. Works with Deno and Node, zero dependencies beyond
LFTS runtime.

## Real Talk: When This Works and When It Doesn't

**Where this shines:**

- Multi-step processes with clear state transitions (approvals, fulfillment,
  onboarding)
- Type-safe workflows without YAML/JSON config sprawl
- Teams that want workflow logic in code, not external DSLs
- API orchestration with retry and parallel steps (v0.12.0 nails this)
- **Dynamic workflows with conditional execution (v0.13.0 makes this elegant)**
- **AI agent integration (v0.15.0)—conversational workflow invocation with Claude
  Desktop or custom agents**
- Conditional stages based on runtime data—security scans, A/B testing, feature
  flags
- Debugging—you see exactly which validation failed and which stages were
  skipped
- Testing—every step is just a function with typed inputs/outputs
- Observability—snapshots show timing, status, and execution paths

**Where it falls short:**

- Long-running workflows that need persistence (you need to add your own state
  storage—Postgres, Redis, whatever)
- Deeply nested conditionals (more than 2-3 levels of branching gets messy)
- Visual workflow designers for non-technical users (they won't write schemas)
- Saga patterns with complex compensation logic (doable but not ergonomic yet)
- Workflows with hundreds of stages (the DAG approach works best with 5-20
  stages)

The sweet spot: internal tools, approval flows, data pipelines, API aggregation,
conditional orchestration. Places where type safety, explicit error handling,
and runtime adaptability matter more than visual designers.

With v0.13.0's conditional stages, this covers most of what I used to reach for
Step Functions or Temporal for. The remaining gaps are persistence and
compensation logic—but those are orthogonal concerns you can layer on top.

---

This workflow engine is ~150 lines including observability, retry, parallel
execution, and conditional stages. Compare that to setting up Camunda or AWS
Step Functions. No XML, no separate config files, just TypeScript types doing
triple duty as validation, workflow definition, and documentation.

The pattern works because LFTS schemas are just data. You can pass them around,
attach metadata, inspect them at runtime. They're not magic compiler
constructs—they're values you can reason about.

What surprised me most: adding conditional workflows to v0.13.0 took one
afternoon. The DAG execution engine already had everything needed—just added
`when` predicates and a `skipped` status. The `matchRoute()` helper for
discriminated unions came for free because LFTS already had ADT support. When
your foundation is composable primitives, features compound naturally.

The v0.12.0 retry and parallel execution? Also built on existing primitives.
Retry reuses `withRetry()` from the distributed module. Parallel execution is
just `Promise.all()` with Result checking. No duplicate code, no
reimplementation. Same patterns everywhere.

Full working example lives in `examples/11-workflow-orchestration/` with 9
complete demos including dynamic workflows. Run `deno run -A main.ts` to see all
patterns in action—retry, parallel execution, conditional stages, pattern
matching, the whole thing. Works with Deno and Node, zero dependencies beyond
LFTS runtime.

_Working on this while listening to Bill Evans' Sunday at the Village Vanguard.
That's the vibe here—complex patterns that feel inevitable once you see them.
Simple on surface, depth underneath._
