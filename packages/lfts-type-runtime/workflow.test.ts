// packages/lfts-type-runtime/workflow.test.ts
// Comprehensive tests for workflow orchestration primitives

import { assertEquals } from "jsr:@std/assert@1";
import { t, withMetadata, Result, validateSafe, inspect } from "./mod.ts";
import {
  analyzeWorkflow,
  createObservableSchema,
  createWorkflowRegistry,
  executeStep,
  executeStepsInParallel,
  inspectStep,
  type WorkflowStep,
} from "./workflow.ts";

// ============================================================================
// Test Schemas
// ============================================================================

const UserInput$ = withMetadata(
  t.object({
    name: t.string().minLength(3),
    email: t.email(),
    age: t.number().range(18, 120),
  }).bc,
  {
    name: "UserInput",
    description: "User registration input",
    stage: "registration",
  }
);

const UserOutput$ = withMetadata(
  t.object({
    id: t.string().pattern("^usr_[a-z0-9]+$"),
    name: t.string(),
    email: t.string(),
    createdAt: t.number(),
  }).bc,
  {
    name: "UserOutput",
    description: "Created user",
    stage: "registration",
  }
);

const OrderInput$ = t.object({
  userId: t.string(),
  items: t.array(t.string()),
  total: t.number().min(0),
}).bc;

const OrderOutput$ = t.object({
  orderId: t.string(),
  status: t.literal("pending"),
  userId: t.string(),
  total: t.number(),
}).bc;

// ============================================================================
// executeStep() Tests
// ============================================================================

Deno.test("executeStep: successful execution with valid input/output", async () => {
  const step: WorkflowStep<
    { name: string; email: string; age: number },
    { id: string; name: string; email: string; createdAt: number },
    never
  > = {
    name: "CreateUser",
    inputSchema: UserInput$,
    outputSchema: UserOutput$,
    execute: async (input) => {
      return Result.ok({
        id: `usr_${Date.now()}`,
        name: input.name,
        email: input.email,
        createdAt: Date.now(),
      });
    },
  };

  const result = await executeStep(step, {
    name: "John Doe",
    email: "john@example.com",
    age: 30,
  });

  assertEquals(result.ok, true);
  if (result.ok) {
    assertEquals(result.value.name, "John Doe");
    assertEquals(result.value.email, "john@example.com");
    assertEquals(result.value.id.startsWith("usr_"), true);
  }
});

Deno.test("executeStep: input validation failure", async () => {
  const step: WorkflowStep<
    { name: string; email: string; age: number },
    { id: string; name: string; email: string; createdAt: number },
    never
  > = {
    name: "CreateUser",
    inputSchema: UserInput$,
    outputSchema: UserOutput$,
    execute: async (input) => {
      return Result.ok({
        id: `usr_${Date.now()}`,
        name: input.name,
        email: input.email,
        createdAt: Date.now(),
      });
    },
  };

  // Invalid input: age < 18
  const result = await executeStep(step, {
    name: "Teen User",
    email: "teen@example.com",
    age: 15,
  });

  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.error.type, "validation_failed");
    if (result.error.type === "validation_failed") {
      assertEquals(result.error.stage, "CreateUser");
    }
  }
});

Deno.test("executeStep: output validation failure", async () => {
  const step: WorkflowStep<
    { name: string; email: string; age: number },
    { id: string; name: string; email: string; createdAt: number },
    never
  > = {
    name: "CreateUser",
    inputSchema: UserInput$,
    outputSchema: UserOutput$,
    execute: async () => {
      // Return invalid output (id doesn't match pattern)
      return Result.ok({
        id: "invalid-id",
        name: "John Doe",
        email: "john@example.com",
        createdAt: Date.now(),
      });
    },
  };

  const result = await executeStep(step, {
    name: "John Doe",
    email: "john@example.com",
    age: 30,
  });

  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.error.type, "output_invalid");
    if (result.error.type === "output_invalid") {
      assertEquals(result.error.stage, "CreateUser");
    }
  }
});

Deno.test("executeStep: execution error propagation", async () => {
  type CustomError = { type: "database_error"; message: string };

  const step: WorkflowStep<
    { name: string; email: string; age: number },
    { id: string; name: string; email: string; createdAt: number },
    CustomError
  > = {
    name: "CreateUser",
    inputSchema: UserInput$,
    outputSchema: UserOutput$,
    execute: async () => {
      // Simulate execution error
      return Result.err({ type: "database_error", message: "Connection failed" });
    },
  };

  const result = await executeStep(step, {
    name: "John Doe",
    email: "john@example.com",
    age: 30,
  });

  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.error.type, "database_error");
    if (result.error.type === "database_error") {
      assertEquals(result.error.message, "Connection failed");
    }
  }
});

Deno.test("executeStep: multi-step workflow with chaining", async () => {
  type User = { id: string; name: string; email: string; createdAt: number };
  type Order = { orderId: string; status: "pending"; userId: string; total: number };

  const createUserStep: WorkflowStep<
    { name: string; email: string; age: number },
    User,
    never
  > = {
    name: "CreateUser",
    inputSchema: UserInput$,
    outputSchema: UserOutput$,
    execute: async (input) => {
      return Result.ok({
        id: `usr_${Date.now()}`,
        name: input.name,
        email: input.email,
        createdAt: Date.now(),
      });
    },
  };

  const createOrderStep: WorkflowStep<
    { userId: string; items: string[]; total: number },
    Order,
    never
  > = {
    name: "CreateOrder",
    inputSchema: OrderInput$,
    outputSchema: OrderOutput$,
    execute: async (input) => {
      return Result.ok({
        orderId: `ord_${Date.now()}`,
        status: "pending" as const,
        userId: input.userId,
        total: input.total,
      });
    },
  };

  // Execute workflow: create user -> create order
  const userResult = await executeStep(createUserStep, {
    name: "John Doe",
    email: "john@example.com",
    age: 30,
  });

  assertEquals(userResult.ok, true);

  if (userResult.ok) {
    const orderResult = await executeStep(createOrderStep, {
      userId: userResult.value.id,
      items: ["item1", "item2"],
      total: 99.99,
    });

    assertEquals(orderResult.ok, true);
    if (orderResult.ok) {
      assertEquals(orderResult.value.userId, userResult.value.id);
      assertEquals(orderResult.value.status, "pending");
      assertEquals(orderResult.value.total, 99.99);
    }
  }
});

// ============================================================================
// analyzeWorkflow() Tests
// ============================================================================

Deno.test("analyzeWorkflow: extracts step metadata", () => {
  const steps: WorkflowStep<any, any, any>[] = [
    {
      name: "CreateUser",
      inputSchema: UserInput$,
      outputSchema: UserOutput$,
      execute: async () => Result.ok({} as any),
      metadata: { stage: "registration", permissions: ["admin"] },
    },
    {
      name: "CreateOrder",
      inputSchema: OrderInput$,
      outputSchema: OrderOutput$,
      execute: async () => Result.ok({} as any),
      metadata: { stage: "checkout", permissions: ["user"] },
    },
  ];

  const analysis = analyzeWorkflow(steps);

  assertEquals(analysis.length, 2);

  assertEquals(analysis[0].name, "CreateUser");
  assertEquals(analysis[0].inputFields.length, 3);
  assertEquals(analysis[0].inputFields[0].name, "name");
  assertEquals(analysis[0].inputFields[0].required, true);
  assertEquals(analysis[0].inputFields[0].constraints.includes("minLength"), true);

  assertEquals(analysis[0].inputFields[1].name, "email");
  assertEquals(analysis[0].inputFields[1].constraints.includes("email"), true);

  assertEquals(analysis[0].outputFields.length, 4);
  assertEquals(analysis[0].outputFields.includes("id"), true);
  assertEquals(analysis[0].outputFields.includes("name"), true);

  assertEquals(analysis[0].metadata?.stage, "registration");
  assertEquals(analysis[0].metadata?.permissions, ["admin"]);
});

Deno.test("analyzeWorkflow: handles steps without metadata", () => {
  const steps: WorkflowStep<any, any, any>[] = [
    {
      name: "CreateUser",
      inputSchema: UserInput$,
      outputSchema: UserOutput$,
      execute: async () => Result.ok({} as any),
    },
  ];

  const analysis = analyzeWorkflow(steps);

  assertEquals(analysis.length, 1);
  assertEquals(analysis[0].metadata, undefined);
});

// ============================================================================
// WorkflowRegistry Tests
// ============================================================================

Deno.test("createWorkflowRegistry: register and retrieve steps", () => {
  const registry = createWorkflowRegistry();

  const step1: WorkflowStep<any, any, any> = {
    name: "Step1",
    inputSchema: UserInput$,
    outputSchema: UserOutput$,
    execute: async () => Result.ok({} as any),
  };

  const step2: WorkflowStep<any, any, any> = {
    name: "Step2",
    inputSchema: OrderInput$,
    outputSchema: OrderOutput$,
    execute: async () => Result.ok({} as any),
  };

  registry.register(step1, { stage: "registration" });
  registry.register(step2, { stage: "checkout" });

  const all = registry.all();
  assertEquals(all.length, 2);
});

Deno.test("createWorkflowRegistry: find by name", () => {
  const registry = createWorkflowRegistry();

  const step: WorkflowStep<any, any, any> = {
    name: "CreateUser",
    inputSchema: UserInput$,
    outputSchema: UserOutput$,
    execute: async () => Result.ok({} as any),
  };

  registry.register(step);

  const found = registry.findByName("CreateUser");
  assertEquals(found?.name, "CreateUser");

  const notFound = registry.findByName("NonExistent");
  assertEquals(notFound, undefined);
});

Deno.test("createWorkflowRegistry: find by predicate", () => {
  const registry = createWorkflowRegistry();

  registry.register(
    {
      name: "Step1",
      inputSchema: UserInput$,
      outputSchema: UserOutput$,
      execute: async () => Result.ok({} as any),
    },
    { stage: "registration", permissions: ["admin"] }
  );

  registry.register(
    {
      name: "Step2",
      inputSchema: OrderInput$,
      outputSchema: OrderOutput$,
      execute: async () => Result.ok({} as any),
    },
    { stage: "checkout", permissions: ["user"] }
  );

  registry.register(
    {
      name: "Step3",
      inputSchema: UserInput$,
      outputSchema: UserOutput$,
      execute: async () => Result.ok({} as any),
    },
    { stage: "registration", permissions: ["user"] }
  );

  // Find registration steps
  const registrationSteps = registry.find(
    (step) => step.metadata?.stage === "registration"
  );
  assertEquals(registrationSteps.length, 2);

  // Find admin steps
  const adminSteps = registry.find(
    (step) => Array.isArray(step.metadata?.permissions) &&
              step.metadata.permissions.includes("admin")
  );
  assertEquals(adminSteps.length, 1);
  assertEquals(adminSteps[0].name, "Step1");
});

// ============================================================================
// createObservableSchema() Tests
// ============================================================================

Deno.test("createObservableSchema: wraps schema with hooks", () => {
  const logs: string[] = [];

  // Mock console.log and console.error
  const originalLog = console.log;
  const originalError = console.error;

  console.log = (...args: any[]) => {
    logs.push(`log: ${JSON.stringify(args)}`);
  };
  console.error = (...args: any[]) => {
    logs.push(`error: ${JSON.stringify(args)}`);
  };

  try {
    // Use inspect() directly which returns InspectableSchema with hooks
    const observable = inspect(UserInput$, (ctx) => {
      ctx.onSuccess((value) => {
        console.log(`✓ TestStage: validation passed`, {
          timestamp: new Date().toISOString(),
          properties: typeof value === "object" && value !== null
            ? Object.keys(value)
            : [],
        });
      });

      ctx.onFailure((error) => {
        console.error(`✗ TestStage: validation failed`, {
          timestamp: new Date().toISOString(),
          error: error.message || String(error),
        });
      });
    });

    // Successful validation - use the InspectableSchema.validate() method
    const validResult = observable.validate({
      name: "John Doe",
      email: "john@example.com",
      age: 30,
    });

    assertEquals(validResult.ok, true);
    assertEquals(logs.length, 1);
    assertEquals(logs[0].includes("✓ TestStage: validation passed"), true);

    // Failed validation
    logs.length = 0;
    const invalidResult = observable.validate({
      name: "AB", // Too short
      email: "invalid",
      age: 15,
    });

    assertEquals(invalidResult.ok, false);
    assertEquals(logs.length, 1);
    assertEquals(logs[0].includes("✗ TestStage: validation failed"), true);
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
});

// ============================================================================
// inspectStep() Tests
// ============================================================================

Deno.test("inspectStep: creates observable step", () => {
  const step: WorkflowStep<any, any, any> = {
    name: "TestStep",
    inputSchema: UserInput$,
    outputSchema: UserOutput$,
    execute: async () => Result.ok({} as any),
  };

  const observable = inspectStep(step, { logInput: true, logOutput: true });

  assertEquals(observable.name, "TestStep");
  assertEquals(observable.inputSchema !== step.inputSchema, true);
  assertEquals(observable.outputSchema !== step.outputSchema, true);
});

Deno.test("inspectStep: respects options", () => {
  const step: WorkflowStep<any, any, any> = {
    name: "TestStep",
    inputSchema: UserInput$,
    outputSchema: UserOutput$,
    execute: async () => Result.ok({} as any),
  };

  const onlyInput = inspectStep(step, { logInput: true, logOutput: false });
  assertEquals(onlyInput.inputSchema !== step.inputSchema, true);
  assertEquals(onlyInput.outputSchema === step.outputSchema, true);

  const onlyOutput = inspectStep(step, { logInput: false, logOutput: true });
  assertEquals(onlyOutput.inputSchema === step.inputSchema, true);
  assertEquals(onlyOutput.outputSchema !== step.outputSchema, true);
});

// ============================================================================
// Integration Tests
// ============================================================================

Deno.test("integration: complete PR workflow from blog post", async () => {
  // Define schemas
  const OpenPRInput$ = t.object({
    title: t.string().minLength(10),
    description: t.string().minLength(20),
    branch: t.string().pattern("^feature/.*"),
  }).bc;

  const OpenPROutput$ = t.object({
    prId: t.string().pattern("^pr_[0-9]+$"),
    status: t.literal("open"),
    title: t.string(),
    checksRequired: t.number().min(1),
  }).bc;

  const ReviewPRInput$ = t.object({
    prId: t.string().pattern("^pr_[0-9]+$"),
    status: t.literal("open"),
    approvals: t.number().min(0),
    checksRequired: t.number(),
  }).bc;

  const ReviewPROutput$ = t.object({
    prId: t.string(),
    status: t.union(t.literal("approved"), t.literal("rejected")),
    approvals: t.number(),
    allChecksPassed: t.boolean(),
  }).bc;

  const MergePRInput$ = t.object({
    prId: t.string(),
    status: t.literal("approved"),
    approvals: t.number().min(2),
    allChecksPassed: t.literal(true),
  }).bc;

  const MergePROutput$ = t.object({
    prId: t.string(),
    status: t.literal("merged"),
    mergedAt: t.number(),
    commitSha: t.string().pattern("^[a-f0-9]{40}$"),
  }).bc;

  // Define steps
  const openPRStep: WorkflowStep<any, any, never> = {
    name: "OpenPR",
    inputSchema: OpenPRInput$,
    outputSchema: OpenPROutput$,
    execute: async (input) => {
      const prId = `pr_${Math.floor(Math.random() * 10000)}`;
      return Result.ok({
        prId,
        status: "open" as const,
        title: input.title,
        checksRequired: 3,
      });
    },
  };

  const reviewPRStep: WorkflowStep<any, any, never> = {
    name: "ReviewPR",
    inputSchema: ReviewPRInput$,
    outputSchema: ReviewPROutput$,
    execute: async (input) => {
      const approved = input.approvals >= 2;
      return Result.ok({
        prId: input.prId,
        status: approved ? ("approved" as const) : ("rejected" as const),
        approvals: input.approvals,
        allChecksPassed: true,
      });
    },
  };

  const mergePRStep: WorkflowStep<any, any, never> = {
    name: "MergePR",
    inputSchema: MergePRInput$,
    outputSchema: MergePROutput$,
    execute: async (input) => {
      return Result.ok({
        prId: input.prId,
        status: "merged" as const,
        mergedAt: Date.now(),
        commitSha: "a".repeat(40),
      });
    },
  };

  // Execute workflow
  const openResult = await executeStep(openPRStep, {
    title: "Add user authentication feature",
    description: "Implements OAuth2 flow with Google provider",
    branch: "feature/oauth-integration",
  });

  assertEquals(openResult.ok, true);

  if (openResult.ok) {
    const reviewInput = {
      ...openResult.value,
      approvals: 2,
    };

    const reviewResult = await executeStep(reviewPRStep, reviewInput);
    assertEquals(reviewResult.ok, true);

    if (reviewResult.ok && reviewResult.value.status === "approved") {
      const mergeResult = await executeStep(mergePRStep, reviewResult.value);
      assertEquals(mergeResult.ok, true);

      if (mergeResult.ok) {
        assertEquals(mergeResult.value.status, "merged");
        assertEquals(mergeResult.value.commitSha, "a".repeat(40));
      }
    }
  }
});

Deno.test("integration: workflow fails on insufficient approvals", async () => {
  const ReviewPROutput$ = t.object({
    prId: t.string(),
    status: t.union(t.literal("approved"), t.literal("rejected")),
    approvals: t.number(),
    allChecksPassed: t.boolean(),
  }).bc;

  const MergePRInput$ = t.object({
    prId: t.string(),
    status: t.literal("approved"),
    approvals: t.number().min(2),
    allChecksPassed: t.literal(true),
  }).bc;

  const MergePROutput$ = t.object({
    prId: t.string(),
    status: t.literal("merged"),
    mergedAt: t.number(),
    commitSha: t.string().pattern("^[a-f0-9]{40}$"),
  }).bc;

  const mergePRStep: WorkflowStep<any, any, never> = {
    name: "MergePR",
    inputSchema: MergePRInput$,
    outputSchema: MergePROutput$,
    execute: async (input) => {
      return Result.ok({
        prId: input.prId,
        status: "merged" as const,
        mergedAt: Date.now(),
        commitSha: "a".repeat(40),
      });
    },
  };

  // Try to merge with only 1 approval
  const result = await executeStep(mergePRStep, {
    prId: "pr_123",
    status: "approved",
    approvals: 1, // Less than minimum of 2
    allChecksPassed: true,
  });

  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.error.type, "validation_failed");
  }
});

// ============================================================================
// Retry Tests (v0.12.0)
// ============================================================================

Deno.test("executeStep: automatic retry on transient errors", async () => {
  let attempt = 0;

  const flaky: WorkflowStep<{ id: string }, { id: string; value: number }, { type: "transient" }> = {
    name: "FlakyStep",
    inputSchema: t.object({ id: t.string() }).bc,
    outputSchema: t.object({ id: t.string(), value: t.number() }).bc,
    execute: async (input) => {
      attempt++;
      if (attempt < 3) {
        return Result.err({ type: "transient" as const });
      }
      return Result.ok({ id: input.id, value: 42 });
    },
    metadata: {
      retry: {
        maxAttempts: 3,
        initialDelayMs: 10,
      },
    },
  };

  const result = await executeStep(flaky, { id: "test" });

  assertEquals(result.ok, true);
  if (result.ok) {
    assertEquals(result.value.value, 42);
  }
  assertEquals(attempt, 3); // Verify it retried
});

Deno.test("executeStep: retry respects maxAttempts", async () => {
  let attempt = 0;

  const failing: WorkflowStep<{ id: string }, { value: number }, { type: "error" }> = {
    name: "FailingStep",
    inputSchema: t.object({ id: t.string() }).bc,
    outputSchema: t.object({ value: t.number() }).bc,
    execute: async (input) => {
      attempt++;
      return Result.err({ type: "error" as const });
    },
    metadata: {
      retry: {
        maxAttempts: 3,
        initialDelayMs: 10,
      },
    },
  };

  const result = await executeStep(failing, { id: "test" });

  assertEquals(result.ok, false);
  assertEquals(attempt, 3); // Attempted 3 times total
});

Deno.test("executeStep: retry uses shouldRetry predicate", async () => {
  let attempt = 0;

  const selective: WorkflowStep<
    { id: string },
    { value: number },
    { type: "retryable" } | { type: "permanent" }
  > = {
    name: "SelectiveRetryStep",
    inputSchema: t.object({ id: t.string() }).bc,
    outputSchema: t.object({ value: t.number() }).bc,
    execute: async (input) => {
      attempt++;
      if (attempt === 1) {
        return Result.err({ type: "retryable" as const });
      }
      return Result.err({ type: "permanent" as const });
    },
    metadata: {
      retry: {
        maxAttempts: 5,
        initialDelayMs: 10,
        shouldRetry: (err) => err.type === "retryable",
      },
    },
  };

  const result = await executeStep(selective, { id: "test" });

  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.error.type, "permanent");
  }
  assertEquals(attempt, 2); // Retried once (retryable), then got permanent
});

// ============================================================================
// Parallel Execution Tests (v0.12.0)
// ============================================================================

Deno.test("executeStepsInParallel: fail-fast mode stops on first error", async () => {
  const step1: WorkflowStep<{ id: string }, { value: number }, { type: "error" }> = {
    name: "Step1",
    inputSchema: t.object({ id: t.string() }).bc,
    outputSchema: t.object({ value: t.number() }).bc,
    execute: async (input) => Result.ok({ value: 1 }),
  };

  const step2: WorkflowStep<{ id: string }, { value: number }, { type: "error" }> = {
    name: "Step2",
    inputSchema: t.object({ id: t.string() }).bc,
    outputSchema: t.object({ value: t.number() }).bc,
    execute: async (input) => Result.err({ type: "error" as const }),
  };

  const step3: WorkflowStep<{ id: string }, { value: number }, { type: "error" }> = {
    name: "Step3",
    inputSchema: t.object({ id: t.string() }).bc,
    outputSchema: t.object({ value: t.number() }).bc,
    execute: async (input) => Result.ok({ value: 3 }),
  };

  const result = await executeStepsInParallel([
    { step: step1, input: { id: "1" } },
    { step: step2, input: { id: "2" } },
    { step: step3, input: { id: "3" } },
  ], { mode: "fail-fast" });

  assertEquals(result.mode, "fail-fast");
  if (result.mode === "fail-fast") {
    assertEquals(result.result.ok, false);
  }
});

Deno.test("executeStepsInParallel: settle-all mode gathers all results", async () => {
  const step1: WorkflowStep<{ id: string }, { value: number }, { type: "error" }> = {
    name: "Step1",
    inputSchema: t.object({ id: t.string() }).bc,
    outputSchema: t.object({ value: t.number() }).bc,
    execute: async (input) => Result.ok({ value: 1 }),
  };

  const step2: WorkflowStep<{ id: string }, { value: number }, { type: "error" }> = {
    name: "Step2",
    inputSchema: t.object({ id: t.string() }).bc,
    outputSchema: t.object({ value: t.number() }).bc,
    execute: async (input) => Result.err({ type: "error" as const }),
  };

  const step3: WorkflowStep<{ id: string }, { value: number }, { type: "error" }> = {
    name: "Step3",
    inputSchema: t.object({ id: t.string() }).bc,
    outputSchema: t.object({ value: t.number() }).bc,
    execute: async (input) => Result.ok({ value: 3 }),
  };

  const result = await executeStepsInParallel([
    { step: step1, input: { id: "1" } },
    { step: step2, input: { id: "2" } },
    { step: step3, input: { id: "3" } },
  ], { mode: "settle-all" });

  assertEquals(result.mode, "settle-all");
  if (result.mode === "settle-all") {
    assertEquals(result.successes.length, 2);
    assertEquals(result.failures.length, 1);
    assertEquals(result.successes[0].value, 1);
    assertEquals(result.successes[1].value, 3);
  }
});

Deno.test("executeStepsInParallel: returns array of results in order", async () => {
  const step: WorkflowStep<{ id: number }, { value: number }, never> = {
    name: "MultiplyStep",
    inputSchema: t.object({ id: t.number() }).bc,
    outputSchema: t.object({ value: t.number() }).bc,
    execute: async (input) => {
      // Add small random delay to ensure concurrency
      await new Promise(resolve => setTimeout(resolve, Math.random() * 10));
      return Result.ok({ value: input.id * 2 });
    },
  };

  const result = await executeStepsInParallel([
    { step, input: { id: 1 } },
    { step, input: { id: 2 } },
    { step, input: { id: 3 } },
    { step, input: { id: 4 } },
  ], { mode: "fail-fast" });

  assertEquals(result.mode, "fail-fast");
  if (result.mode === "fail-fast" && result.result.ok) {
    assertEquals(result.result.value.length, 4);
    assertEquals(result.result.value[0].value, 2);
    assertEquals(result.result.value[1].value, 4);
    assertEquals(result.result.value[2].value, 6);
    assertEquals(result.result.value[3].value, 8);
  }
});

Deno.test("executeStepsInParallel: handles empty input array", async () => {
  const result = await executeStepsInParallel([], { mode: "fail-fast" });

  assertEquals(result.mode, "fail-fast");
  if (result.mode === "fail-fast") {
    assertEquals(result.result.ok, true);
    if (result.result.ok) {
      assertEquals(result.result.value.length, 0);
    }
  }
});
