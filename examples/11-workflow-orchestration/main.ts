// examples/11-workflow-orchestration/main.ts
// Demo application showcasing all workflow orchestration patterns

import {
  stateMachine,
  type WorkflowError,
  type WorkflowStep,
  executeStep,
  executeStepsInParallel,
  Result,
  t,
} from "../../packages/lfts-type-runtime/mod.ts";
import {
  generateWorkflowDocs,
  generateWorkflowDiagram,
  generateWorkflowTests,
} from "../../packages/lfts-codegen/mod.ts";
import type { OpenPRInput, PRState } from "./types.ts";
import {
  runPRWorkflow,
  runDynamicPRWorkflow,
  openPRStep,
  reviewPRStep,
  mergePRStep,
  analyzePRWorkflow,
  createPRWorkflowRegistry,
  createObservableWorkflow,
} from "./pr-workflow.ts";

/**
 * Demo 1: Basic workflow execution
 */
async function demo1_BasicWorkflow() {
  console.log("═══════════════════════════════════════════════════════");
  console.log("Demo 1: Basic Workflow Execution");
  console.log("═══════════════════════════════════════════════════════\n");

  const prData: OpenPRInput = {
    title: "Add user authentication feature",
    description: "Implements OAuth2 flow with Google provider for user login",
    branch: "feature/oauth-integration",
  };

  const result = await runPRWorkflow(prData);

  if (result.ok) {
    console.log("Final result:", {
      prId: result.value.prId,
      status: result.value.status,
      mergedAt: new Date(result.value.mergedAt).toISOString(),
      commitSha: result.value.commitSha.slice(0, 8),
    });
  } else {
    console.error("Workflow failed:", result.error);
  }
}

/**
 * Demo 2: Workflow analysis and introspection
 */
function demo2_WorkflowAnalysis() {
  console.log("\n═══════════════════════════════════════════════════════");
  console.log("Demo 2: Workflow Analysis & Introspection");
  console.log("═══════════════════════════════════════════════════════\n");

  const analysis = analyzePRWorkflow();

  console.log("Workflow Structure:\n");
  for (const step of analysis) {
    console.log(`Step: ${step.name}`);
    console.log(`  Input fields (${step.inputFields.length}):`);
    for (const field of step.inputFields) {
      const constraints = field.constraints.length > 0
        ? ` [${field.constraints.join(", ")}]`
        : "";
      console.log(`    - ${field.name}${field.required ? " (required)" : ""}${constraints}`);
    }
    console.log(`  Output fields (${step.outputFields.length}):`);
    for (const field of step.outputFields) {
      console.log(`    - ${field}`);
    }
    if (step.metadata) {
      console.log(`  Metadata:`, step.metadata);
    }
    console.log("");
  }
}

/**
 * Demo 3: Workflow registry for discovery
 */
function demo3_WorkflowRegistry() {
  console.log("═══════════════════════════════════════════════════════");
  console.log("Demo 3: Workflow Registry");
  console.log("═══════════════════════════════════════════════════════\n");

  const registry = createPRWorkflowRegistry();

  console.log("All registered steps:");
  for (const step of registry.all()) {
    console.log(`  - ${step.name} (stage: ${step.metadata?.stage})`);
  }

  console.log("\nSteps requiring admin permissions:");
  const adminSteps = registry.find((step) =>
    step.metadata?.permissions?.includes("admin")
  );
  for (const step of adminSteps) {
    console.log(`  - ${step.name}`);
  }

  console.log("\nFind step by name:");
  const reviewStep = registry.findByName("ReviewPR");
  if (reviewStep) {
    console.log(`  Found: ${reviewStep.name}`);
  }
}

/**
 * Demo 4: State machine for PR workflow
 */
function demo4_StateMachine() {
  console.log("\n═══════════════════════════════════════════════════════");
  console.log("Demo 4: State Machine");
  console.log("═══════════════════════════════════════════════════════\n");

  const prFSM = stateMachine<PRState>({ type: "open", prId: "pr_123", approvals: 0 })
    .transition("addApproval", "open", "reviewing", (state) => ({
      type: "reviewing",
      prId: state.prId,
      approvals: state.approvals + 1,
      checksRequired: 3,
    }))
    .transition("approve", "reviewing", "approved", (state) => ({
      type: "approved",
      prId: state.prId,
      approvals: state.approvals,
      checksPassedAt: Date.now(),
    }), (state) => state.approvals >= 2)  // Guard: require 2 approvals
    .transition("merge", "approved", "merged", (state) => ({
      type: "merged",
      prId: state.prId,
      mergedAt: Date.now(),
      commitSha: "a".repeat(40),
    }))
    .transition("close", "open", "closed", (state, reason: string) => ({
      type: "closed",
      prId: state.prId,
      reason,
    }))
    .build();

  console.log("Initial state:", prFSM.getState());
  console.log("Valid events:", prFSM.getValidEvents());

  // Transition through workflow
  console.log("\n1. Add approval...");
  prFSM.transition("addApproval");
  console.log("   State:", prFSM.getState().type);

  console.log("\n2. Try to approve (should fail - not enough approvals)...");
  const approveResult1 = prFSM.transition("approve");
  if (!approveResult1.ok) {
    console.log("   ✗ Failed:", approveResult1.error.type);
  }

  console.log("\n3. Add another approval...");
  prFSM.transition("addApproval");
  console.log("   State:", prFSM.getState().type);

  console.log("\n4. Approve (should succeed)...");
  const approveResult2 = prFSM.transition("approve");
  if (approveResult2.ok) {
    console.log("   ✓ Approved:", prFSM.getState().type);
  }

  console.log("\n5. Merge...");
  const mergeResult = prFSM.transition("merge");
  if (mergeResult.ok) {
    console.log("   ✓ Merged:", prFSM.getState().type);
  }
}

/**
 * Demo 5: Code generation (docs, diagrams, tests)
 */
async function demo5_CodeGeneration() {
  console.log("\n═══════════════════════════════════════════════════════");
  console.log("Demo 5: Code Generation");
  console.log("═══════════════════════════════════════════════════════\n");

  const steps = [openPRStep, reviewPRStep, mergePRStep];

  // Generate documentation
  console.log("1. Generating Markdown documentation...");
  const docs = generateWorkflowDocs(steps, {
    title: "GitHub PR Review Workflow",
    includeConstraints: true,
  });
  console.log(`   Generated ${docs.split("\n").length} lines`);
  console.log(`   Preview:\n`);
  console.log(docs.split("\n").slice(0, 15).join("\n"));
  console.log("   ...\n");

  // Generate diagram
  console.log("2. Generating Mermaid flowchart...");
  const diagram = generateWorkflowDiagram(steps, {
    direction: "LR",
    includeFields: true,
  });
  console.log(`   Generated ${diagram.split("\n").length} lines`);
  console.log(`   Preview:\n`);
  console.log(diagram.split("\n").slice(0, 12).join("\n"));
  console.log("   ...\n");

  // Generate tests
  console.log("3. Generating test scaffolding...");
  const tests = generateWorkflowTests(steps, {
    framework: "deno",
    includeValidationTests: true,
  });
  console.log(`   Generated ${tests.split("\n").length} lines`);
  console.log(`   Preview:\n`);
  console.log(tests.split("\n").slice(0, 12).join("\n"));
  console.log("   ...\n");

  console.log("✓ All artifacts generated successfully");
  console.log("  (In production, write these to files with Deno.writeTextFile)");
}

/**
 * Demo 6: Error handling scenarios
 */
async function demo6_ErrorHandling() {
  console.log("\n═══════════════════════════════════════════════════════");
  console.log("Demo 6: Error Handling");
  console.log("═══════════════════════════════════════════════════════\n");

  console.log("Scenario 1: Invalid input (title too short)");
  const invalidPR = {
    title: "Fix",  // Too short (< 10 chars)
    description: "Fixes a bug in the authentication module",
    branch: "feature/auth-fix",
  };

  const result1 = await runPRWorkflow(invalidPR);
  if (!result1.ok && (result1.error as WorkflowError).type === "validation_failed") {
    const error = result1.error as WorkflowError;
    console.log(`✗ Validation failed at stage: ${error.stage}`);
    console.log(`  Error:`, error.errors);
  }

  console.log("\nScenario 2: Invalid branch pattern");
  const invalidBranch = {
    title: "Add new feature",
    description: "This adds a completely new feature",
    branch: "main",  // Should start with "feature/"
  };

  const result2 = await runPRWorkflow(invalidBranch);
  if (!result2.ok && (result2.error as WorkflowError).type === "validation_failed") {
    const error = result2.error as WorkflowError;
    console.log(`✗ Validation failed at stage: ${error.stage}`);
  }
}

/**
 * Demo 7: Automatic retry with exponential backoff
 */
async function demo7_AutomaticRetry() {
  console.log("\n═══════════════════════════════════════════════════════");
  console.log("Demo 7: Automatic Retry (v0.12.0)");
  console.log("═══════════════════════════════════════════════════════\n");

  let attemptCount = 0;

  // Flaky step that fails first 2 attempts
  const flakyApiStep: WorkflowStep<
    { userId: string },
    { userId: string; data: string },
    { type: "transient" } | { type: "permanent" }
  > = {
    name: "FlakyAPICall",
    inputSchema: t.object({ userId: t.string() }).bc,
    outputSchema: t.object({
      userId: t.string(),
      data: t.string(),
    }).bc,
    execute: async (input) => {
      attemptCount++;
      console.log(`  Attempt ${attemptCount}...`);

      if (attemptCount < 3) {
        // Simulate transient failure
        return Result.err({ type: "transient" as const });
      }

      // Success on 3rd attempt
      return Result.ok({
        userId: input.userId,
        data: "User profile fetched successfully",
      });
    },
    metadata: {
      retry: {
        maxAttempts: 3,
        initialDelayMs: 50,
        backoffMultiplier: 2,
        shouldRetry: (error, attempt) => {
          // Only retry transient errors
          return error.type === "transient";
        },
      },
    },
  };

  console.log("Executing flaky API call with automatic retry...\n");
  const result = await executeStep(flakyApiStep, { userId: "user_123" });

  if (result.ok) {
    console.log(`\n✓ Success after ${attemptCount} attempts`);
    console.log("  Result:", result.value);
  } else {
    console.log("\n✗ Failed after all retry attempts");
    console.log("  Error:", result.error);
  }

  // Reset for next demo
  attemptCount = 0;

  console.log("\n\nTesting permanent error (no retry)...\n");
  const permanentErrorStep: WorkflowStep<
    { userId: string },
    { data: string },
    { type: "transient" } | { type: "permanent" }
  > = {
    name: "PermanentError",
    inputSchema: t.object({ userId: t.string() }).bc,
    outputSchema: t.object({ data: t.string() }).bc,
    execute: async (input) => {
      attemptCount++;
      console.log(`  Attempt ${attemptCount}...`);
      return Result.err({ type: "permanent" as const });
    },
    metadata: {
      retry: {
        maxAttempts: 3,
        initialDelayMs: 50,
        shouldRetry: (error) => error.type === "transient",
      },
    },
  };

  const result2 = await executeStep(permanentErrorStep, { userId: "user_456" });
  if (!result2.ok) {
    console.log("\n✓ Correctly stopped after 1 attempt (permanent error)");
    console.log("  Error:", result2.error);
  }
}

/**
 * Demo 8: Parallel execution with fail-fast and settle-all modes
 */
async function demo8_ParallelExecution() {
  console.log("\n═══════════════════════════════════════════════════════");
  console.log("Demo 8: Parallel Execution (v0.12.0)");
  console.log("═══════════════════════════════════════════════════════\n");

  // Define steps for parallel execution
  const fetchUserStep: WorkflowStep<
    { userId: string },
    { userId: string; name: string },
    { type: "not_found" }
  > = {
    name: "FetchUser",
    inputSchema: t.object({ userId: t.string() }).bc,
    outputSchema: t.object({ userId: t.string(), name: t.string() }).bc,
    execute: async (input) => {
      await new Promise((resolve) => setTimeout(resolve, 50)); // Simulate delay
      return Result.ok({ userId: input.userId, name: "Alice" });
    },
  };

  const fetchPostsStep: WorkflowStep<
    { userId: string },
    { userId: string; posts: number },
    { type: "not_found" }
  > = {
    name: "FetchPosts",
    inputSchema: t.object({ userId: t.string() }).bc,
    outputSchema: t.object({ userId: t.string(), posts: t.number() }).bc,
    execute: async (input) => {
      await new Promise((resolve) => setTimeout(resolve, 30)); // Simulate delay
      return Result.ok({ userId: input.userId, posts: 42 });
    },
  };

  const fetchCommentsStep: WorkflowStep<
    { userId: string },
    { userId: string; comments: number },
    { type: "not_found" }
  > = {
    name: "FetchComments",
    inputSchema: t.object({ userId: t.string() }).bc,
    outputSchema: t.object({ userId: t.string(), comments: t.number() }).bc,
    execute: async (input) => {
      await new Promise((resolve) => setTimeout(resolve, 40)); // Simulate delay
      return Result.ok({ userId: input.userId, comments: 128 });
    },
  };

  console.log("Scenario 1: Fail-fast mode (all succeed)\n");
  const result1 = await executeStepsInParallel(
    [
      { step: fetchUserStep, input: { userId: "user_123" } },
      { step: fetchPostsStep, input: { userId: "user_123" } },
      { step: fetchCommentsStep, input: { userId: "user_123" } },
    ],
    { mode: "fail-fast" }
  );

  if (result1.mode === "fail-fast" && result1.result.ok) {
    console.log("✓ All steps succeeded in parallel");
    console.log("  User:", result1.result.value[0]);
    console.log("  Posts:", result1.result.value[1]);
    console.log("  Comments:", result1.result.value[2]);
  }

  console.log("\n\nScenario 2: Fail-fast mode (one fails)\n");
  const failingStep: WorkflowStep<
    { userId: string },
    { data: string },
    { type: "not_found" }
  > = {
    name: "FailingStep",
    inputSchema: t.object({ userId: t.string() }).bc,
    outputSchema: t.object({ data: t.string() }).bc,
    execute: async () => Result.err({ type: "not_found" as const }),
  };

  const result2 = await executeStepsInParallel(
    [
      { step: fetchUserStep, input: { userId: "user_123" } },
      { step: failingStep, input: { userId: "user_123" } },
      { step: fetchPostsStep, input: { userId: "user_123" } },
    ],
    { mode: "fail-fast" }
  );

  if (result2.mode === "fail-fast" && !result2.result.ok) {
    console.log("✓ Stopped on first error (fail-fast)");
    console.log("  Error:", result2.result.error);
  }

  console.log("\n\nScenario 3: Settle-all mode (partial failures)\n");
  const result3 = await executeStepsInParallel(
    [
      { step: fetchUserStep, input: { userId: "user_123" } },
      { step: failingStep, input: { userId: "user_123" } },
      { step: fetchPostsStep, input: { userId: "user_123" } },
      { step: fetchCommentsStep, input: { userId: "user_123" } },
    ],
    { mode: "settle-all" }
  );

  if (result3.mode === "settle-all") {
    console.log(
      `✓ Completed all steps: ${result3.successes.length} succeeded, ${result3.failures.length} failed`
    );
    console.log("  Successes:");
    result3.successes.forEach((value) => {
      console.log("    -", value);
    });
    console.log("  Failures:");
    result3.failures.forEach((error) => {
      console.log("    -", error);
    });
  }
}

/**
 * Demo 9: Dynamic Workflows with Conditional Stages (v0.13.0)
 */
async function demo9_DynamicWorkflows() {
  console.log("\n═══════════════════════════════════════════════════════");
  console.log("Demo 9: Dynamic Workflows (v0.13.0)");
  console.log("═══════════════════════════════════════════════════════\n");

  console.log("Scenario 1: Security-related branch (auth)\n");
  const securityPR: OpenPRInput = {
    title: "Implement OAuth2 authentication",
    description: "Adds OAuth2 flow for user authentication",
    branch: "feature/oauth-auth",
  };

  await runDynamicPRWorkflow(securityPR);

  console.log("\n\nScenario 2: Regular feature branch\n");
  const regularPR: OpenPRInput = {
    title: "Add user profile page",
    description: "Implements user profile UI components",
    branch: "feature/user-profile",
  };

  await runDynamicPRWorkflow(regularPR);
}

/**
 * Main entry point - run all demos
 */
async function main() {
  console.log("\n╔═══════════════════════════════════════════════════════╗");
  console.log("║  LFTS Workflow Orchestration - Complete Demo Suite   ║");
  console.log("╚═══════════════════════════════════════════════════════╝\n");

  try {
    await demo1_BasicWorkflow();
    demo2_WorkflowAnalysis();
    demo3_WorkflowRegistry();
    demo4_StateMachine();
    await demo5_CodeGeneration();
    await demo6_ErrorHandling();
    await demo7_AutomaticRetry();
    await demo8_ParallelExecution();
    await demo9_DynamicWorkflows();

    console.log("\n╔═══════════════════════════════════════════════════════╗");
    console.log("║  All demos completed successfully! ✨                 ║");
    console.log("╚═══════════════════════════════════════════════════════╝\n");
  } catch (error) {
    console.error("\n❌ Demo failed:", error);
    Deno.exit(1);
  }
}

// Run the demo
if (import.meta.main) {
  main();
}
