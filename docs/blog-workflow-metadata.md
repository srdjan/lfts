---
title: Metadata-Driven Workflows - Schemas as State Machines
date: 2025-01-17
tags: [TypeScript, Workflows, Introspection, State Machines, Light-FP]
excerpt: Most workflow engines require separate configuration files or decorators. What if your type schemas could define both validation AND workflow steps? LFTS metadata makes workflows self-documenting with zero overhead.
---

In Part 1, I showed how LFTS schemas expose their structure at runtime. Here's what surprised me: this same introspection makes building workflow engines trivial.

Instead of maintaining separate workflow definitions, you attach metadata to your schemas. Each workflow step becomes a schema with input/output contracts. The engine validates transitions automatically. No YAML files, no decorators, just pure functions and type metadata.

Let me show you how to build a PR review workflow in ~100 lines.

## The Core Pattern

A workflow step is just a function with typed inputs and outputs. The trick is attaching metadata that describes what the step does:

```typescript
import { t, withMetadata, inspect, Result, AsyncResult } from "lfts-runtime";

// Define schemas for each workflow stage
const OpenPRInput$ = withMetadata(
  t.object({
    title: t.string().minLength(10),
    description: t.string().minLength(20),
    branch: t.string().pattern("^feature/.*"),
  }),
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
  }),
  {
    name: "OpenPROutput",
    description: "Created PR with initial state",
    stage: "open"
  }
);
```

The `withMetadata()` wrapper adds custom properties to schemas without affecting validation. You can attach anything - stage names, descriptions, required permissions, whatever makes sense for your domain.

## Building the Step Executor

Here's the cool part: you can build a generic step executor that validates inputs and outputs automatically:

```typescript
type WorkflowStep<TIn, TOut, TErr> = {
  name: string;
  inputSchema: Type<TIn>;
  outputSchema: Type<TOut>;
  execute: (input: TIn) => AsyncResult<TOut, TErr>;
};

async function executeStep<TIn, TOut, TErr>(
  step: WorkflowStep<TIn, TOut, TErr>,
  input: unknown
): AsyncResult<TOut, WorkflowError | TErr> {
  // Validate input against schema
  const inputResult = step.inputSchema.validateSafe(input);
  if (!inputResult.ok) {
    return Result.err({
      type: "validation_failed" as const,
      stage: step.name,
      errors: inputResult.error
    });
  }

  // Execute the step
  const result = await step.execute(inputResult.value);
  if (!result.ok) {
    return Result.err(result.error);
  }

  // Validate output against schema
  const outputResult = step.outputSchema.validateSafe(result.value);
  if (!outputResult.ok) {
    return Result.err({
      type: "output_invalid" as const,
      stage: step.name,
      errors: outputResult.error
    });
  }

  return Result.ok(outputResult.value);
}
```

This means your business logic never sees invalid data. Input validation happens before execution, output validation after. If either fails, you get a typed error with the exact failure point.

## Adding Observability

The `inspect()` hook lets you observe validation without changing the schemas. Perfect for logging workflow transitions:

```typescript
function createObservableSchema<T>(
  schema: Type<T>,
  stageName: string
): Type<T> {
  return inspect(schema, (ctx) => {
    ctx.onSuccess((value) => {
      console.log(`✓ ${stageName}: validation passed`, {
        timestamp: new Date().toISOString(),
        properties: Object.keys(value as object)
      });
    });

    ctx.onFailure((errors) => {
      console.error(`✗ ${stageName}: validation failed`, {
        timestamp: new Date().toISOString(),
        errors: errors.map(e => e.message)
      });
    });
  });
}

// Wrap your schemas with observability
const ObservableOpenPRInput$ = createObservableSchema(
  OpenPRInput$,
  "OpenPR-Input"
);
```

Now every validation logs success or failure automatically. Zero overhead when validation passes (hooks only fire when needed), and you get detailed diagnostics when things break.

## The Complete PR Workflow

Here's a full three-stage workflow: open → review → merge. Each step validates its inputs/outputs and returns `Result<T, E>`:

```typescript
// Define all schemas with metadata
const ReviewPRInput$ = withMetadata(
  t.object({
    prId: t.string().pattern("^pr_[0-9]+$"),
    status: t.literal("open"),
    approvals: t.number().min(0),
    checksRequired: t.number()
  }),
  { name: "ReviewPRInput", stage: "review" }
);

const ReviewPROutput$ = withMetadata(
  t.object({
    prId: t.string(),
    status: t.union(t.literal("approved"), t.literal("rejected")),
    approvals: t.number(),
    allChecksPassed: t.boolean()
  }),
  { name: "ReviewPROutput", stage: "review" }
);

const MergePRInput$ = withMetadata(
  t.object({
    prId: t.string(),
    status: t.literal("approved"),
    approvals: t.number().min(2),
    allChecksPassed: t.literal(true)
  }),
  { name: "MergePRInput", stage: "merge" }
);

const MergePROutput$ = withMetadata(
  t.object({
    prId: t.string(),
    status: t.literal("merged"),
    mergedAt: t.number(),
    commitSha: t.string().pattern("^[a-f0-9]{40}$")
  }),
  { name: "MergePROutput", stage: "merge" }
);

// Define workflow steps
const openPRStep: WorkflowStep<OpenPRInputType, OpenPROutputType, never> = {
  name: "OpenPR",
  inputSchema: ObservableOpenPRInput$,
  outputSchema: OpenPROutput$,
  execute: async (input) => {
    // Simulate PR creation
    const prId = `pr_${Math.floor(Math.random() * 10000)}`;
    return Result.ok({
      prId,
      status: "open" as const,
      title: input.title,
      checksRequired: 3
    });
  }
};

const reviewPRStep: WorkflowStep<ReviewPRInputType, ReviewPROutputType, never> = {
  name: "ReviewPR",
  inputSchema: ReviewPRInput$,
  outputSchema: ReviewPROutput$,
  execute: async (input) => {
    // Simulate review process
    const approved = input.approvals >= 2;
    return Result.ok({
      prId: input.prId,
      status: approved ? "approved" as const : "rejected" as const,
      approvals: input.approvals,
      allChecksPassed: true
    });
  }
};

const mergePRStep: WorkflowStep<MergePRInputType, MergePROutputType, never> = {
  name: "MergePR",
  inputSchema: MergePRInput$,
  outputSchema: MergePROutput$,
  execute: async (input) => {
    // Simulate merge
    return Result.ok({
      prId: input.prId,
      status: "merged" as const,
      mergedAt: Date.now(),
      commitSha: "a".repeat(40) // Mock commit SHA
    });
  }
};

// Run the workflow
async function runPRWorkflow(initialData: unknown) {
  const openResult = await executeStep(openPRStep, initialData);
  if (!openResult.ok) {
    return openResult;
  }

  const reviewInput = {
    ...openResult.value,
    approvals: 2 // Simulate approvals
  };

  const reviewResult = await executeStep(reviewPRStep, reviewInput);
  if (!reviewResult.ok) {
    return reviewResult;
  }

  if (reviewResult.value.status === "rejected") {
    return Result.err({
      type: "workflow_stopped" as const,
      reason: "PR was rejected during review"
    });
  }

  return await executeStep(mergePRStep, reviewResult.value);
}

// Usage
const prData = {
  title: "Add user authentication feature",
  description: "Implements OAuth2 flow with Google provider",
  branch: "feature/oauth-integration"
};

const result = await runPRWorkflow(prData);

if (result.ok) {
  console.log("PR merged successfully!", result.value);
} else {
  console.error("Workflow failed:", result.error);
}
```

Look at what happened here: the workflow is self-validating. You can't pass a PR from "open" to "merge" without going through "review" - the schemas enforce the state machine. Try to merge a PR with only 1 approval? Schema validation catches it before your business logic runs.

## Schema-Driven Workflow Introspection

To me is interesting that you can introspect the workflow itself by examining schema metadata:

```typescript
function analyzeWorkflow(steps: WorkflowStep<any, any, any>[]) {
  return steps.map(step => {
    const inputInfo = step.inputSchema.inspect();
    const outputInfo = step.outputSchema.inspect();

    return {
      name: step.name,
      inputFields: inputInfo.kind === "object"
        ? inputInfo.properties.map(p => ({
            name: p.name,
            required: !p.optional,
            constraints: getRefinements(p.type).map(r => r.kind)
          }))
        : [],
      outputFields: outputInfo.kind === "object"
        ? outputInfo.properties.map(p => p.name)
        : []
    };
  });
}

// Generate workflow documentation automatically
const workflowDocs = analyzeWorkflow([openPRStep, reviewPRStep, mergePRStep]);
console.log(JSON.stringify(workflowDocs, null, 2));
```

This generates documentation from your schemas. No manual docs to keep in sync. Schema changes automatically update your workflow analysis.

## Real Talk: When This Works and When It Doesn't

**Where this shines:**
- Multi-step processes with clear state transitions (approvals, fulfillment, onboarding)
- Type-safe workflows without YAML/JSON config sprawl
- Teams that want workflow logic in code, not external DSLs
- Debugging - you see exactly which validation failed and why

**Where it falls short:**
- Complex branching (nested conditionals get messy fast)
- Long-running workflows that need persistence (you need to add your own state storage)
- Dynamic workflows where steps change based on runtime conditions
- Visual workflow designers (non-technical users won't write schemas)

For simple linear workflows with validation-heavy steps, this pattern is surprisingly elegant. For orchestrating dozens of microservices with complex retry logic and compensation, you probably want Temporal or a real workflow engine.

The sweet spot: internal tools, approval flows, data pipelines. Places where type safety matters more than visual designers.

---

This workflow engine is ~100 lines including observability. Compare that to setting up Camunda or AWS Step Functions. No XML, no separate config files, just TypeScript types doing double duty as both validation and workflow definition.

The pattern works because LFTS schemas are just data. You can pass them around, attach metadata, inspect them at runtime. They're not magic compiler constructs - they're values you can reason about.

Full code example lives in `examples/workflow-metadata/` (coming in v0.10.0). Works with Deno and Node, zero dependencies beyond LFTS runtime.

_Been using this pattern for a client's document approval workflow. Replaced 300 lines of hand-rolled validation with 50 lines of schemas. Perfect music for this kind of refactoring: Keith Jarrett's Köln Concert. Complex patterns that somehow feel inevitable._
