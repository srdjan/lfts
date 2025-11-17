# Example 11: Workflow Orchestration

This example demonstrates LFTS workflow orchestration primitives for building schema-driven, type-safe workflows.

## What This Example Shows

1. **Workflow Steps** - Schema-validated workflow execution with automatic input/output validation
2. **State Machines** - Finite state machines for workflow state management
3. **Workflow Analysis** - Runtime introspection of workflow structure
4. **Observable Workflows** - Built-in observability hooks for debugging
5. **Workflow Registry** - Discovery and querying of workflow steps
6. **Code Generation** - Generate documentation, diagrams, and tests from workflow definitions

## Files

- `types.ts` - Domain types (PR types, workflow states)
- `schemas.ts` - Runtime schemas for validation
- `pr-workflow.ts` - Complete GitHub PR review workflow
- `main.ts` - Demo application showing all patterns

## Running the Example

```bash
# From the repository root
deno run -A examples/11-workflow-orchestration/main.ts
```

## What You'll Learn

### 1. Basic Workflow Step Execution

```typescript
const openPRStep: WorkflowStep<OpenPRInput, OpenPROutput, never> = {
  name: "OpenPR",
  inputSchema: OpenPRInput$,
  outputSchema: OpenPROutput$,
  execute: async (input) => {
    // Business logic here
    return Result.ok({ prId: "pr_123", status: "open", ...input });
  }
};

const result = await executeStep(openPRStep, {
  title: "Add feature",
  description: "Implements new feature",
  branch: "feature/new-feature"
});

if (result.ok) {
  console.log("PR opened:", result.value.prId);
} else {
  // Validation errors or execution errors
  console.error("Step failed:", result.error);
}
```

### 2. Multi-Step Workflow Chaining

```typescript
// Step 1: Open PR
const openResult = await executeStep(openPRStep, prData);
if (!openResult.ok) return openResult;

// Step 2: Review PR (using output from Step 1)
const reviewInput = {
  ...openResult.value,
  approvals: 2
};
const reviewResult = await executeStep(reviewPRStep, reviewInput);
if (!reviewResult.ok) return reviewResult;

// Step 3: Merge PR (using output from Step 2)
if (reviewResult.value.status === "approved") {
  return await executeStep(mergePRStep, reviewResult.value);
}
```

### 3. Workflow with State Machine

```typescript
const prStateMachine = stateMachine<PRState>({ type: "open", approvals: 0 })
  .transition("approve", "open", "reviewing", (state) => ({
    type: "reviewing",
    approvals: state.approvals + 1
  }))
  .transition("merge", "reviewing", "merged", (state) => ({
    type: "merged",
    mergedAt: Date.now()
  }), (state) => state.approvals >= 2)  // Guard: require 2 approvals
  .build();

// Try to transition
const result = prStateMachine.transition("approve");
if (result.ok) {
  console.log("New state:", result.value.type);
} else {
  console.error("Invalid transition:", result.error);
}
```

### 4. Observable Workflows for Debugging

```typescript
const observableStep = inspectStep(openPRStep, {
  logInput: true,
  logOutput: true
});

// Validation events automatically logged to console:
// ✓ OpenPR-Input: validation passed { timestamp: ..., properties: [...] }
// ✓ OpenPR-Output: validation passed { timestamp: ..., properties: [...] }
const result = await executeStep(observableStep, data);
```

### 5. Workflow Analysis and Introspection

```typescript
const analysis = analyzeWorkflow([openPRStep, reviewPRStep, mergePRStep]);

console.log(JSON.stringify(analysis, null, 2));
// [
//   {
//     name: "OpenPR",
//     inputFields: [
//       { name: "title", required: true, constraints: ["minLength"] },
//       { name: "description", required: true, constraints: ["minLength"] },
//       { name: "branch", required: true, constraints: ["pattern"] }
//     ],
//     outputFields: ["prId", "status", "title", "checksRequired"]
//   },
//   ...
// ]
```

### 6. Workflow Registry for Discovery

```typescript
const registry = createWorkflowRegistry();

registry.register(openPRStep, { stage: "open", permissions: ["user"] });
registry.register(reviewPRStep, { stage: "review", permissions: ["admin"] });
registry.register(mergePRStep, { stage: "merge", permissions: ["admin"] });

// Find steps by permission
const adminSteps = registry.find(step =>
  step.metadata?.permissions?.includes("admin")
);

// Find by name
const reviewStep = registry.findByName("ReviewPR");
```

### 7. Code Generation (Documentation, Diagrams, Tests)

```typescript
import {
  generateWorkflowDocs,
  generateWorkflowDiagram,
  generateWorkflowTests
} from "lfts-codegen";

// Generate Markdown documentation
const docs = generateWorkflowDocs([openPRStep, reviewPRStep, mergePRStep], {
  title: "GitHub PR Workflow",
  includeConstraints: true
});
await Deno.writeTextFile("workflow-docs.md", docs);

// Generate Mermaid flowchart
const diagram = generateWorkflowDiagram([openPRStep, reviewPRStep, mergePRStep], {
  direction: "LR",
  includeFields: true
});
await Deno.writeTextFile("workflow-diagram.md", diagram);

// Generate test scaffolding
const tests = generateWorkflowTests([openPRStep, reviewPRStep, mergePRStep], {
  framework: "deno",
  includeValidationTests: true
});
await Deno.writeTextFile("workflow.test.ts", tests);
```

## Philosophy

This example demonstrates the Light-FP approach to workflow orchestration:

- **Schema-driven** - Input/output schemas define workflow contracts
- **Explicit validation** - All data validated before and after each step
- **Type-safe** - TypeScript ensures correctness at compile time
- **Composable** - Pure functions combine naturally
- **Observable** - Built-in hooks for monitoring and debugging
- **No framework magic** - Just functions and data structures

## Comparison with Other Workflow Systems

### vs. Temporal
- **LFTS**: Lightweight, schema-driven, runs in-process
- **Temporal**: Heavy orchestration, requires infrastructure, distributed by default

### vs. AWS Step Functions
- **LFTS**: Code-first, type-safe, runs anywhere
- **Step Functions**: JSON-based, vendor lock-in, AWS-only

### vs. BPMN/Camunda
- **LFTS**: Minimal, functional, developer-focused
- **BPMN**: Visual designer, XML-based, enterprise-focused

### When to use LFTS Workflows
- Internal tools and admin workflows
- Approval flows and document processing
- Data pipelines with validation
- Multi-step business processes in a single service

### When NOT to use LFTS Workflows
- Long-running distributed sagas (use Temporal)
- Complex branching with 20+ decision points
- Visual workflow designer for non-technical users

## Next Steps

- Add compensation/rollback actions
- Implement parallel step execution
- Add metrics and SLA tracking
- Build a workflow execution dashboard
- Integrate with state machine for complex flows

## Related Examples

- [04-result-pattern](../04-result-pattern/) - Result<T, E> pattern
- [07-async-result](../07-async-result/) - AsyncResult combinators
- [09-mini-application](../09-mini-application/) - Complete LFTS application

## See Also

- [docs/blog-workflow-metadata.md](../../docs/blog-workflow-metadata.md) - Detailed blog post
- [packages/lfts-type-runtime/workflow.ts](../../packages/lfts-type-runtime/workflow.ts) - Implementation
- [packages/lfts-codegen/workflow.ts](../../packages/lfts-codegen/workflow.ts) - Code generators
