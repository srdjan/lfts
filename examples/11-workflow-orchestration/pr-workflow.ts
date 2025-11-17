// examples/11-workflow-orchestration/pr-workflow.ts
// Complete GitHub PR review workflow implementation

import {
  Result,
  type WorkflowStep,
  executeStep,
  analyzeWorkflow,
  createWorkflowRegistry,
  inspectStep,
} from "../../packages/lfts-type-runtime/mod.ts";
import type {
  OpenPRInput,
  OpenPROutput,
  ReviewPRInput,
  ReviewPROutput,
  MergePRInput,
  MergePROutput,
  PRWorkflowError,
} from "./types.ts";
import {
  OpenPRInput$,
  OpenPROutput$,
  ReviewPRInput$,
  ReviewPROutput$,
  MergePRInput$,
  MergePROutput$,
} from "./schemas.ts";

/**
 * Step 1: Open a new Pull Request
 *
 * Validates PR metadata and creates the PR with required checks.
 */
export const openPRStep: WorkflowStep<OpenPRInput, OpenPROutput, never> = {
  name: "OpenPR",
  inputSchema: OpenPRInput$,
  outputSchema: OpenPROutput$,
  execute: async (input) => {
    // Simulate PR creation
    const prId = `pr_${Math.floor(Math.random() * 10000)}`;

    console.log(`📝 Opening PR: "${input.title}" (${input.branch})`);

    // Simulate async operation
    await new Promise((resolve) => setTimeout(resolve, 100));

    return Result.ok({
      prId,
      status: "open" as const,
      title: input.title,
      description: input.description,
      branch: input.branch,
      checksRequired: 3, // CI, lint, tests
    });
  },
  metadata: {
    stage: "open",
    permissions: ["user", "admin"],
    timeout: 5000,
  },
};

/**
 * Step 2: Review Pull Request
 *
 * Checks for required approvals and validates CI checks.
 */
export const reviewPRStep: WorkflowStep<ReviewPRInput, ReviewPROutput, PRWorkflowError> = {
  name: "ReviewPR",
  inputSchema: ReviewPRInput$,
  outputSchema: ReviewPROutput$,
  execute: async (input) => {
    console.log(`🔍 Reviewing PR ${input.prId} (${input.approvals} approvals)`);

    // Simulate async review process
    await new Promise((resolve) => setTimeout(resolve, 150));

    // Check if PR has enough approvals
    if (input.approvals < 2) {
      return Result.err({
        type: "insufficient_approvals" as const,
        required: 2,
        actual: input.approvals,
      });
    }

    // Simulate running checks
    const allChecksPassed = Math.random() > 0.1; // 90% success rate

    if (!allChecksPassed) {
      return Result.err({
        type: "checks_failed" as const,
        failedChecks: ["lint", "tests"],
      });
    }

    const status = input.approvals >= 2 && allChecksPassed ? "approved" : "rejected";

    console.log(`${status === "approved" ? "✅" : "❌"} PR ${input.prId} ${status}`);

    return Result.ok({
      prId: input.prId,
      status: status as "approved" | "rejected",
      approvals: input.approvals,
      allChecksPassed,
    });
  },
  metadata: {
    stage: "review",
    permissions: ["admin"],
    timeout: 10000,
  },
};

/**
 * Step 3: Merge Pull Request
 *
 * Merges the approved PR and generates commit SHA.
 */
export const mergePRStep: WorkflowStep<MergePRInput, MergePROutput, PRWorkflowError> = {
  name: "MergePR",
  inputSchema: MergePRInput$,
  outputSchema: MergePROutput$,
  execute: async (input) => {
    console.log(`🚀 Merging PR ${input.prId}...`);

    // Simulate async merge operation
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Generate mock commit SHA (40 hex characters)
    const commitSha = Array.from({ length: 40 }, () =>
      Math.floor(Math.random() * 16).toString(16)
    ).join("");

    console.log(`🎉 PR ${input.prId} merged! Commit: ${commitSha.slice(0, 8)}`);

    return Result.ok({
      prId: input.prId,
      status: "merged" as const,
      mergedAt: Date.now(),
      commitSha,
    });
  },
  metadata: {
    stage: "merge",
    permissions: ["admin"],
    timeout: 15000,
  },
};

/**
 * Complete PR workflow pipeline
 *
 * Executes all three steps in sequence with proper error handling.
 */
export async function runPRWorkflow(prData: OpenPRInput) {
  console.log("\n🔄 Starting PR Workflow...\n");

  // Step 1: Open PR
  const openResult = await executeStep(openPRStep, prData);
  if (!openResult.ok) {
    console.error("❌ Failed to open PR:", openResult.error);
    return openResult;
  }

  console.log(`✓ Step 1 complete: PR ${openResult.value.prId} opened\n`);

  // Step 2: Review PR (simulate adding approvals)
  const reviewInput: ReviewPRInput = {
    ...openResult.value,
    approvals: 2, // Simulate 2 approvals
  };

  const reviewResult = await executeStep(reviewPRStep, reviewInput);
  if (!reviewResult.ok) {
    console.error("❌ Failed to review PR:", reviewResult.error);
    return reviewResult;
  }

  console.log(`✓ Step 2 complete: PR ${reviewResult.value.prId} ${reviewResult.value.status}\n`);

  // Check if PR was approved
  if (reviewResult.value.status === "rejected") {
    console.log("⚠️  PR rejected, workflow stopped");
    return Result.err({
      type: "workflow_stopped" as const,
      reason: "PR was rejected during review",
    });
  }

  // Step 3: Merge PR
  const mergeInput: MergePRInput = {
    prId: reviewResult.value.prId,
    status: "approved",
    approvals: reviewResult.value.approvals,
    allChecksPassed: reviewResult.value.allChecksPassed,
  };

  const mergeResult = await executeStep(mergePRStep, mergeInput);
  if (!mergeResult.ok) {
    console.error("❌ Failed to merge PR:", mergeResult.error);
    return mergeResult;
  }

  console.log(`✓ Step 3 complete: PR ${mergeResult.value.prId} merged\n`);
  console.log("✨ PR Workflow completed successfully!\n");

  return mergeResult;
}

/**
 * Create observable workflow steps for debugging
 */
export function createObservableWorkflow() {
  return [
    inspectStep(openPRStep, { logInput: true, logOutput: true }),
    inspectStep(reviewPRStep, { logInput: true, logOutput: true }),
    inspectStep(mergePRStep, { logInput: true, logOutput: true }),
  ];
}

/**
 * Analyze the PR workflow structure
 */
export function analyzePRWorkflow() {
  return analyzeWorkflow([openPRStep, reviewPRStep, mergePRStep]);
}

/**
 * Create a workflow registry with all PR steps
 */
export function createPRWorkflowRegistry() {
  const registry = createWorkflowRegistry();

  registry.register(openPRStep, {
    stage: "open",
    permissions: ["user", "admin"],
    requiresApproval: false,
  });

  registry.register(reviewPRStep, {
    stage: "review",
    permissions: ["admin"],
    requiresApproval: true,
  });

  registry.register(mergePRStep, {
    stage: "merge",
    permissions: ["admin"],
    requiresApproval: true,
  });

  return registry;
}

/**
 * Dynamic PR Workflow using DAG-based conditional execution
 *
 * This demonstrates the new conditional workflow features (v0.13.0):
 * - Conditional stages with `when` predicates
 * - Pattern matching for data-driven routing
 * - Automatic skipping of stages based on runtime data
 * - Observable snapshots showing which stages ran vs skipped
 *
 * Features shown:
 * 1. Security scan runs ONLY for security/auth-related branches
 * 2. Pattern-matched routing based on review status
 * 3. Conditional merge/close stages
 */
export async function runDynamicPRWorkflow(prData: OpenPRInput) {
  const { graphBuilder, fromStage, matchRoute } = await import(
    "../../packages/lfts-type-runtime/workflow-graph.ts"
  );

  console.log("\n🔄 Starting Dynamic PR Workflow (DAG-based)...\n");

  const workflow = graphBuilder<OpenPRInput>()
    .seed(prData)

    // Stage 1: Open PR (always runs)
    .stage({
      name: "openPR",
      step: openPRStep,
      resolve: (ctx) => ctx.seed,
    })

    // Stage 2: Security scan (conditional - only for security branches)
    .stage({
      name: "securityScan",
      step: {
        name: "SecurityScan",
        inputSchema: OpenPROutput$,
        outputSchema: OpenPROutput$,
        execute: async (input: OpenPROutput) => {
          console.log(`🔐 Running security scan for ${input.branch}...`);
          await new Promise((resolve) => setTimeout(resolve, 200));
          console.log(`✓ Security scan passed for ${input.prId}`);
          return Result.ok(input);
        },
      },
      dependsOn: ["openPR"],
      when: (ctx) => {
        const pr = ctx.get<OpenPROutput>("openPR");
        const isSecurity = pr.branch.includes("security") ||
          pr.branch.includes("auth") ||
          pr.branch.includes("crypto");
        if (!isSecurity) {
          console.log(`⊘ Skipping security scan (not a security branch)`);
        }
        return isSecurity;
      },
      resolve: fromStage("openPR"),
    })

    // Stage 3: Review PR (always runs after openPR)
    .stage({
      name: "reviewPR",
      step: reviewPRStep,
      dependsOn: ["openPR"],
      resolve: (ctx) => {
        const pr = ctx.get<OpenPROutput>("openPR");
        return {
          ...pr,
          approvals: 2, // Simulate 2 approvals
        };
      },
    })

    // Stage 4: Route decision based on review status (pattern matching)
    .stage({
      name: "routeDecision",
      step: {
        name: "RouteDecision",
        inputSchema: ReviewPROutput$,
        outputSchema: ReviewPROutput$,
        execute: async (input: ReviewPROutput) => {
          const action = matchRoute(
            { type: input.status },
            {
              approved: "merge",
              rejected: "close",
            } as const,
          );
          console.log(`🚦 Routing decision: ${action} (status: ${input.status})`);
          return Result.ok(input);
        },
      },
      dependsOn: ["reviewPR"],
      resolve: fromStage("reviewPR"),
    })

    // Stage 5: Merge (conditional - only if approved)
    .stage({
      name: "mergePR",
      step: mergePRStep,
      dependsOn: ["routeDecision"],
      when: (ctx) => {
        const review = ctx.get<ReviewPROutput>("routeDecision");
        const shouldMerge = review.status === "approved";
        if (!shouldMerge) {
          console.log(`⊘ Skipping merge (status: ${review.status})`);
        }
        return shouldMerge;
      },
      resolve: (ctx) => {
        const review = ctx.get<ReviewPROutput>("routeDecision");
        return {
          prId: review.prId,
          status: "approved" as const,
          approvals: review.approvals,
          allChecksPassed: true as const,
        };
      },
    })

    // Stage 6: Close PR (conditional - only if rejected)
    .stage({
      name: "closePR",
      step: {
        name: "ClosePR",
        inputSchema: ReviewPROutput$,
        outputSchema: ReviewPROutput$,
        execute: async (input: ReviewPROutput) => {
          console.log(`🚫 Closing PR ${input.prId} (rejected)`);
          await new Promise((resolve) => setTimeout(resolve, 100));
          return Result.ok(input);
        },
      },
      dependsOn: ["routeDecision"],
      when: (ctx) => {
        const review = ctx.get<ReviewPROutput>("routeDecision");
        const shouldClose = review.status === "rejected";
        if (!shouldClose) {
          console.log(`⊘ Skipping close (status: ${review.status})`);
        }
        return shouldClose;
      },
      resolve: fromStage("routeDecision"),
    })

    .build();

  // Execute the workflow
  const result = await workflow.run({ mode: "fail-fast" });

  if (result.ok) {
    console.log("\n✨ Dynamic PR Workflow completed successfully!\n");
    console.log("Execution Summary:");
    console.log("─────────────────────────────────────────────────────");

    for (const snap of result.value.snapshots) {
      const statusIcon = snap.status === "ok"
        ? "✓"
        : snap.status === "skipped"
        ? "⊘"
        : "✗";
      const duration = snap.durationMs ? `(${snap.durationMs.toFixed(1)}ms)` : "";
      console.log(`  ${statusIcon} ${snap.name}: ${snap.status} ${duration}`);
    }

    console.log("─────────────────────────────────────────────────────\n");

    return Result.ok(result.value.outputs);
  } else {
    console.error("\n❌ Dynamic PR Workflow failed:", result.error);
    return Result.err(result.error);
  }
}
