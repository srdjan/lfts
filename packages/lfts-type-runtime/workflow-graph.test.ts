import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import { Result, t, withMetadata } from "./mod.ts";
import type { WorkflowStep } from "./workflow.ts";
import {
  fromStage,
  fromStages,
  graphBuilder,
  matchRoute,
} from "./workflow-graph.ts";

type UserSeed = { name: string; email: string };

const CreateUserInput$ = withMetadata(
  t.object({
    name: t.string().minLength(2),
    email: t.email(),
  }).bc,
  { stage: "create" },
);

const CreateUserOutput$ = t.object({
  userId: t.string(),
  name: t.string(),
  email: t.string(),
}).bc;

const LoadPermissionsInput$ = t.object({ userId: t.string() }).bc;
const LoadPermissionsOutput$ =
  t.object({ permissions: t.array(t.string()) }).bc;

const HydrateProfileInput$ = t.object({
  createUser: t.object({
    userId: t.string(),
    name: t.string(),
    email: t.string(),
  }),
  loadPermissions: t.object({
    permissions: t.array(t.string()),
  }),
}).bc;

const HydrateProfileOutput$ = t.object({
  profile: t.object({
    userId: t.string(),
    permissions: t.array(t.string()),
  }),
}).bc;

const createUserStep: WorkflowStep<
  UserSeed,
  { userId: string; name: string; email: string },
  never
> = {
  name: "CreateUser",
  inputSchema: CreateUserInput$,
  outputSchema: CreateUserOutput$,
  async execute(input) {
    return Result.ok({ ...input, userId: `usr_${input.name.toLowerCase()}` });
  },
};

const loadPermissionsStep: WorkflowStep<
  { userId: string },
  { permissions: string[] },
  never
> = {
  name: "LoadPermissions",
  inputSchema: LoadPermissionsInput$,
  outputSchema: LoadPermissionsOutput$,
  async execute(input) {
    return Result.ok({
      permissions: ["read:${input.userId}", "write:${input.userId}"],
    });
  },
};

const hydrateProfileStep: WorkflowStep<
  {
    createUser: { userId: string; name: string; email: string };
    loadPermissions: { permissions: string[] };
  },
  { profile: { userId: string; permissions: string[] } },
  never
> = {
  name: "HydrateProfile",
  inputSchema: HydrateProfileInput$,
  outputSchema: HydrateProfileOutput$,
  async execute(input) {
    return Result.ok({
      profile: {
        userId: input.createUser.userId,
        permissions: input.loadPermissions.permissions,
      },
    });
  },
};

Deno.test("graphBuilder executes DAG workflows", async () => {
  const workflow = graphBuilder<UserSeed>()
    .seed({ name: "Jane", email: "jane@example.com" })
    .stage({ name: "createUser", step: createUserStep })
    .stage({
      name: "loadPermissions",
      step: loadPermissionsStep,
      dependsOn: ["createUser"],
      resolve: fromStage<
        UserSeed,
        { userId: string; name: string; email: string },
        { userId: string }
      >("createUser", (value) => ({ userId: value.userId })),
    })
    .stage({
      name: "hydrateProfile",
      step: hydrateProfileStep,
      dependsOn: ["createUser", "loadPermissions"],
      resolve: fromStages<
        UserSeed,
        {
          createUser: { userId: string; name: string; email: string };
          loadPermissions: { permissions: string[] };
        },
        {
          createUser: { userId: string; name: string; email: string };
          loadPermissions: { permissions: string[] };
        }
      >(["createUser", "loadPermissions"], (values) => values),
    })
    .build();

  const result = await workflow.run();
  assertEquals(result.ok, true);
  if (result.ok) {
    const outputs = result.value.outputs as Record<string, any>;
    assertEquals(outputs.createUser.name, "Jane");
    assertEquals(outputs.loadPermissions.permissions.length, 2);
    assertEquals(outputs.hydrateProfile.profile.userId, "usr_jane");
    assertEquals(
      result.value.snapshots.filter((s) => s.status === "ok").length,
      3,
    );
  }
});

Deno.test("graphBuilder propagates failures and blocks dependents", async () => {
  const failingStep: WorkflowStep<
    { userId: string },
    { permissions: string[] },
    { type: "denied" }
  > = {
    name: "LoadPermissions",
    inputSchema: LoadPermissionsInput$,
    outputSchema: LoadPermissionsOutput$,
    async execute() {
      return Result.err({ type: "denied" });
    },
  };

  const workflow = graphBuilder<UserSeed>()
    .seed({ name: "Jane", email: "jane@example.com" })
    .stage({ name: "createUser", step: createUserStep })
    .stage({
      name: "loadPermissions",
      step: failingStep,
      dependsOn: ["createUser"],
      resolve: fromStage<
        UserSeed,
        { userId: string; name: string; email: string },
        { userId: string }
      >("createUser", (value) => ({ userId: value.userId })),
    })
    .stage({
      name: "hydrateProfile",
      step: hydrateProfileStep,
      dependsOn: ["createUser", "loadPermissions"],
    })
    .build();

  const result = await workflow.run();
  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.error.type, "stage_failed");
    if (result.error.type === "stage_failed") {
      assertEquals(result.error.stage, "loadPermissions");
    }
  }

  const snapshots = workflow.inspect();
  assertEquals(
    snapshots.some((s) =>
      s.name === "hydrateProfile" && s.status === "blocked"
    ),
    true,
  );
});

Deno.test("graphBuilder detects cycles at build time", () => {
  assertThrows(
    () => {
      graphBuilder<UserSeed>()
        .seed({ name: "Jane", email: "jane@example.com" })
        .stage({ name: "a", step: createUserStep, dependsOn: ["b"] })
        .stage({ name: "b", step: createUserStep, dependsOn: ["a"] })
        .build();
    },
    Error,
    "cycle",
  );
});

Deno.test("graphBuilder supports async seeds returning Result", async () => {
  const workflow = graphBuilder<UserSeed>()
    .seed(async () => {
      await Promise.resolve();
      return Result.ok({ name: "Mia", email: "mia@example.com" });
    })
    .stage({ name: "createUser", step: createUserStep })
    .build();

  const result = await workflow.run();
  assertEquals(result.ok, true);
  if (result.ok) {
    const outputs = result.value.outputs as Record<string, any>;
    assertEquals(outputs.createUser.email, "mia@example.com");
  }
});

Deno.test("graphBuilder propagates seed failure", async () => {
  const workflow = graphBuilder<UserSeed>()
    .seed(async () => Result.err("boom"))
    .stage({ name: "createUser", step: createUserStep })
    .build();

  const result = await workflow.run();
  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.error.type, "seed_failed");
  }
});

Deno.test("fromStage without projector returns dependency output", async () => {
  const workflow = graphBuilder<UserSeed>()
    .seed({ name: "Kai", email: "kai@example.com" })
    .stage({ name: "createUser", step: createUserStep })
    .stage({
      name: "echoUser",
      step: createUserStep,
      dependsOn: ["createUser"],
      resolve: fromStage<
        UserSeed,
        { name: string; email: string; userId: string }
      >("createUser"),
    })
    .build();

  const result = await workflow.run();
  assertEquals(result.ok, true);
  if (result.ok) {
    const outputs = result.value.outputs as Record<string, any>;
    assertEquals(outputs.echoUser.name, "Kai");
  }
});

// ============================================================================
// Conditional Execution Tests (when predicates)
// ============================================================================

Deno.test("conditional stage executes when predicate is true", async () => {
  const workflow = graphBuilder<UserSeed>()
    .seed({ name: "Alice", email: "alice@example.com" })
    .stage({ name: "createUser", step: createUserStep })
    .stage({
      name: "conditionalPerms",
      step: loadPermissionsStep,
      dependsOn: ["createUser"],
      when: (ctx) => {
        const user = ctx.get<{ name: string }>("createUser");
        return user.name === "Alice"; // Should execute for Alice
      },
      resolve: fromStage("createUser"),
    })
    .build();

  const result = await workflow.run();
  assertEquals(result.ok, true);

  if (result.ok) {
    const snapshots = result.value.snapshots;
    const permSnapshot = snapshots.find((s) => s.name === "conditionalPerms");

    assertEquals(permSnapshot?.status, "ok");
    assertEquals("conditionalPerms" in result.value.outputs, true);
  }
});

Deno.test("conditional stage skips when predicate is false", async () => {
  const workflow = graphBuilder<UserSeed>()
    .seed({ name: "Bob", email: "bob@example.com" })
    .stage({ name: "createUser", step: createUserStep })
    .stage({
      name: "conditionalPerms",
      step: loadPermissionsStep,
      dependsOn: ["createUser"],
      when: (ctx) => {
        const user = ctx.get<{ name: string }>("createUser");
        return user.name === "Alice"; // Should skip for Bob
      },
      resolve: fromStage("createUser"),
    })
    .build();

  const result = await workflow.run();
  assertEquals(result.ok, true);

  if (result.ok) {
    const snapshots = result.value.snapshots;
    const permSnapshot = snapshots.find((s) => s.name === "conditionalPerms");

    assertEquals(permSnapshot?.status, "skipped");
    // Skipped stage outputs undefined
    assertEquals(result.value.outputs.conditionalPerms, undefined);
  }
});

Deno.test("conditional stage with async predicate", async () => {
  const workflow = graphBuilder<UserSeed>()
    .seed({ name: "Charlie", email: "charlie@example.com" })
    .stage({ name: "createUser", step: createUserStep })
    .stage({
      name: "asyncConditional",
      step: loadPermissionsStep,
      dependsOn: ["createUser"],
      when: async (ctx) => {
        const user = ctx.get<{ name: string }>("createUser");
        await new Promise((resolve) => setTimeout(resolve, 10)); // Simulate async
        return user.name.startsWith("C");
      },
      resolve: fromStage("createUser"),
    })
    .build();

  const result = await workflow.run();
  assertEquals(result.ok, true);

  if (result.ok) {
    const snapshots = result.value.snapshots;
    const snapshot = snapshots.find((s) => s.name === "asyncConditional");

    assertEquals(snapshot?.status, "ok");
  }
});

Deno.test("conditional stage with Result-based predicate", async () => {
  const workflow = graphBuilder<UserSeed>()
    .seed({ name: "Diana", email: "diana@example.com" })
    .stage({ name: "createUser", step: createUserStep })
    .stage({
      name: "resultConditional",
      step: loadPermissionsStep,
      dependsOn: ["createUser"],
      when: (ctx) => {
        const user = ctx.get<{ name: string }>("createUser");
        // Return Result instead of boolean
        return Result.ok(user.name.length > 3);
      },
      resolve: fromStage("createUser"),
    })
    .build();

  const result = await workflow.run();
  assertEquals(result.ok, true);

  if (result.ok) {
    const snapshots = result.value.snapshots;
    const snapshot = snapshots.find((s) => s.name === "resultConditional");

    assertEquals(snapshot?.status, "ok"); // Diana has 5 chars
  }
});

Deno.test("conditional stage with Result.err predicate skips", async () => {
  const workflow = graphBuilder<UserSeed>()
    .seed({ name: "Eve", email: "eve@example.com" })
    .stage({ name: "createUser", step: createUserStep })
    .stage({
      name: "errorConditional",
      step: loadPermissionsStep,
      dependsOn: ["createUser"],
      when: () => {
        // Result.err should be treated as false
        return Result.err("some error");
      },
      resolve: fromStage("createUser"),
    })
    .build();

  const result = await workflow.run();
  assertEquals(result.ok, true);

  if (result.ok) {
    const snapshots = result.value.snapshots;
    const snapshot = snapshots.find((s) => s.name === "errorConditional");

    assertEquals(snapshot?.status, "skipped");
  }
});

Deno.test("multiple conditional stages with different outcomes", async () => {
  const workflow = graphBuilder<UserSeed>()
    .seed({ name: "Frank", email: "frank@example.com" })
    .stage({ name: "createUser", step: createUserStep })
    .stage({
      name: "shortNameCheck",
      step: loadPermissionsStep,
      dependsOn: ["createUser"],
      when: (ctx) => {
        const user = ctx.get<{ name: string }>("createUser");
        return user.name.length <= 4; // Frank has 5, should skip
      },
      resolve: fromStage("createUser"),
    })
    .stage({
      name: "longNameCheck",
      step: loadPermissionsStep,
      dependsOn: ["createUser"],
      when: (ctx) => {
        const user = ctx.get<{ name: string }>("createUser");
        return user.name.length > 4; // Should execute
      },
      resolve: fromStage("createUser"),
    })
    .build();

  const result = await workflow.run();
  assertEquals(result.ok, true);

  if (result.ok) {
    const snapshots = result.value.snapshots;
    const shortSnapshot = snapshots.find((s) => s.name === "shortNameCheck");
    const longSnapshot = snapshots.find((s) => s.name === "longNameCheck");

    assertEquals(shortSnapshot?.status, "skipped");
    assertEquals(longSnapshot?.status, "ok");
  }
});

Deno.test("dependent stages execute even when dependency is skipped", async () => {
  const workflow = graphBuilder<UserSeed>()
    .seed({ name: "Grace", email: "grace@example.com" })
    .stage({ name: "createUser", step: createUserStep })
    .stage({
      name: "skippedStage",
      step: loadPermissionsStep,
      dependsOn: ["createUser"],
      when: () => false, // Always skip
      resolve: fromStage("createUser"),
    })
    .stage({
      name: "dependentStage",
      step: createUserStep,
      dependsOn: ["skippedStage"],
      resolve: (ctx) => ctx.seed, // Use seed since dependency is skipped
    })
    .build();

  const result = await workflow.run();
  assertEquals(result.ok, true);

  if (result.ok) {
    const snapshots = result.value.snapshots;
    const skippedSnapshot = snapshots.find((s) => s.name === "skippedStage");
    const dependentSnapshot = snapshots.find((s) => s.name === "dependentStage");

    assertEquals(skippedSnapshot?.status, "skipped");
    assertEquals(dependentSnapshot?.status, "ok");
  }
});

// ============================================================================
// Pattern Matching Tests (matchRoute)
// ============================================================================

Deno.test("matchRoute returns correct route for discriminated union", () => {
  type Status =
    | { type: "approved"; approver: string }
    | { type: "rejected"; reason: string }
    | { type: "pending" };

  const approved: Status = { type: "approved", approver: "admin" };
  const rejected: Status = { type: "rejected", reason: "incomplete" };
  const pending: Status = { type: "pending" };

  const routes = {
    approved: { action: "merge", priority: "high" },
    rejected: { action: "close", priority: "low" },
    pending: { action: "wait", priority: "medium" },
  };

  assertEquals(matchRoute(approved, routes), {
    action: "merge",
    priority: "high",
  });
  assertEquals(matchRoute(rejected, routes), {
    action: "close",
    priority: "low",
  });
  assertEquals(matchRoute(pending, routes), {
    action: "wait",
    priority: "medium",
  });
});

Deno.test("matchRoute throws error for missing route", () => {
  type Status = { type: "approved" } | { type: "rejected" } | { type: "pending" };

  const unknown: Status = { type: "pending" };
  const incompleteRoutes = {
    approved: "merge",
    rejected: "close",
    // Missing "pending" route
  };

  assertThrows(
    () => matchRoute(unknown, incompleteRoutes as any),
    Error,
    'No route defined for discriminant "pending"',
  );
});

Deno.test("conditional stage with matchRoute for dynamic routing", async () => {
  type ReviewStatus =
    | { type: "approved"; approvals: number }
    | { type: "rejected"; reason: string };

  const reviewStep: WorkflowStep<
    { name: string; email: string; userId: string },
    ReviewStatus,
    never
  > = {
    name: "Review",
    inputSchema: t.object({ userId: t.string() }).bc,
    outputSchema: t.object({ type: t.string() }).bc,
    execute: async () => {
      return Result.ok({ type: "approved" as const, approvals: 2 });
    },
  };

  const workflow = graphBuilder<UserSeed>()
    .seed({ name: "Helen", email: "helen@example.com" })
    .stage({ name: "createUser", step: createUserStep })
    .stage({
      name: "reviewUser",
      step: reviewStep,
      dependsOn: ["createUser"],
      resolve: fromStage("createUser"),
    })
    .stage({
      name: "handleApproved",
      step: loadPermissionsStep,
      dependsOn: ["reviewUser"],
      when: (ctx) => {
        const review = ctx.get<ReviewStatus>("reviewUser");
        return review.type === "approved";
      },
      resolve: fromStage("createUser"),
    })
    .stage({
      name: "handleRejected",
      step: loadPermissionsStep,
      dependsOn: ["reviewUser"],
      when: (ctx) => {
        const review = ctx.get<ReviewStatus>("reviewUser");
        return review.type === "rejected";
      },
      resolve: fromStage("createUser"),
    })
    .build();

  const result = await workflow.run();
  assertEquals(result.ok, true);

  if (result.ok) {
    const snapshots = result.value.snapshots;
    const approvedSnapshot = snapshots.find((s) => s.name === "handleApproved");
    const rejectedSnapshot = snapshots.find((s) => s.name === "handleRejected");

    assertEquals(approvedSnapshot?.status, "ok");
    assertEquals(rejectedSnapshot?.status, "skipped");
  }
});
