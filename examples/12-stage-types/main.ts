// examples/12-stage-types/main.ts
// Demonstrates workflow stage catalogs with backend + full-stack HTMX stages

import {
  Result,
  createStageCatalog,
  defineBackendFunctionStage,
  defineFullStackHtmxStage,
  registerHtmxStageRoutes,
  t,
} from "../../packages/lfts-type-runtime/mod.ts";
import { fromStage, graphBuilder } from "../../packages/lfts-type-runtime/workflow-graph.ts";

type SpendRequest = {
  requestId: string;
  cost: number;
  costCenter: string;
};

const SpendRequest$ = t.object({
  requestId: t.string().pattern("^req_[0-9]+$"),
  cost: t.number().min(1),
  costCenter: t.string().minLength(3),
}).bc;

const SpendDecision$ = t.object({
  requestId: t.string(),
  cost: t.number(),
  requiresHuman: t.boolean(),
  reason: t.string(),
}).bc;

const ManualApprovalInput$ = t.object({
  requestId: t.string(),
  cost: t.number(),
  requiresHuman: t.boolean(),
  reason: t.string(),
}).bc;

const ManualApprovalOutput$ = t.object({
  requestId: t.string(),
  status: t.union(
    t.literal("auto-approved"),
    t.literal("pending-human"),
    t.literal("manual-approved"),
  ),
  reviewerComment: t.string(),
}).bc;

const ApprovalAction$ = t.object({
  decision: t.union(t.literal("approve"), t.literal("reject")),
  note: t.string().minLength(3),
}).bc;

const verifySpendStage = defineBackendFunctionStage<SpendRequest, {
  requestId: string;
  cost: number;
  requiresHuman: boolean;
  reason: string;
}, never>({
  name: "VerifySpend",
  description: "Run pure validation + policy checks",
  inputSchema: SpendRequest$,
  outputSchema: SpendDecision$,
  owners: ["finance-platform"],
  tags: ["backend_function", "policy"],
  execute: async (input) => {
    const requiresHuman = input.cost > 1000;
    return Result.ok({
      ...input,
      requiresHuman,
      reason: requiresHuman ? "Amount exceeds auto-approval limit" : "Within guardrails",
    });
  },
});

const manualApprovalStage = defineFullStackHtmxStage<
  {
    requestId: string;
    cost: number;
    requiresHuman: boolean;
    reason: string;
  },
  { requestId: string; status: string; reviewerComment: string },
  never,
  { requestId: string; message: string; amount: number }
>({
  name: "ManualApproval",
  description: "Render HTMX widget for finance approvers",
  inputSchema: ManualApprovalInput$,
  outputSchema: ManualApprovalOutput$,
  fragment: (viewModel) => `
    <section hx-target="closest section" class="card">
      <h2>Approval Needed for ${viewModel.requestId}</h2>
      <p>Amount: $${viewModel.amount.toFixed(2)}</p>
      <p>${viewModel.message}</p>
      <button hx-post="/approvals/${viewModel.requestId}/decision" hx-vals='{"decision":"approve"}'>Approve</button>
      <button hx-post="/approvals/${viewModel.requestId}/decision" hx-vals='{"decision":"reject"}'>Reject</button>
    </section>
  `,
  routes: [
    {
      method: "POST",
      path: "/approvals/:id/decision",
      payloadSchema: ApprovalAction$,
      description: "HTMX endpoint for approve/reject buttons",
      handler: ({ payload, params }) => ({
        status: 200,
        body: `<div hx-swap-oob="true" id="decision-${params.id}">Decision: ${payload.decision}</div>`,
      }),
    },
  ],
  hydrateFragmentInput: (output) => ({
    requestId: output.requestId,
    amount: output.cost,
    message: output.reason,
  }),
  execute: async (input) => {
    if (!input.requiresHuman) {
      return Result.ok({
        requestId: input.requestId,
        status: "auto-approved" as const,
        reviewerComment: "Auto rules satisfied",
      });
    }
    return Result.ok({
      requestId: input.requestId,
      status: "pending-human" as const,
      reviewerComment: "Awaiting finance approver",
    });
  },
});

const catalog = createStageCatalog([verifySpendStage, manualApprovalStage]);

async function runSpendWorkflow(seed: SpendRequest) {
  const workflow = graphBuilder<SpendRequest>()
    .seed(seed)
    .stageFromDefinition(verifySpendStage, {
      name: "verify",
      resolve: (ctx) => ctx.seed,
    })
    .stageFromDefinition(manualApprovalStage, {
      name: "manualGate",
      dependsOn: ["verify"],
      resolve: fromStage("verify"),
      when: (ctx) => ctx.get<{ requiresHuman: boolean }>("verify").requiresHuman,
    });

  const result = await workflow.run();
  if (!result.ok) {
    console.error("Workflow failed", result.error);
    return;
  }

  console.log("Workflow outputs:", result.value.outputs);
  console.log("Snapshots:", result.value.snapshots.map((s) => ({ name: s.name, status: s.status })));
}

function logCatalogSummary() {
  console.log("Stage catalog (backend):", catalog.byKind("backend_function").map((stage) => stage.name));
  console.log("Stage catalog (fullstack):", catalog.byKind("fullstack_htmx").map((stage) => stage.name));

  const routes: string[] = [];
  registerHtmxStageRoutes(manualApprovalStage, (route) => {
    routes.push(`${route.method} ${route.path}`);
  });
  console.log("Routes to mount:", routes);
}

await runSpendWorkflow({
  requestId: "req_1024",
  cost: 1800,
  costCenter: "infra",
});

await runSpendWorkflow({
  requestId: "req_2048",
  cost: 250,
  costCenter: "growth",
});

logCatalogSummary();
