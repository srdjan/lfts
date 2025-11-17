import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import { Result, t, withMetadata } from "./mod.ts";
import type { WorkflowStep } from "./workflow.ts";
import { fromStage, fromStages, graphBuilder } from "./workflow-graph.ts";

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
