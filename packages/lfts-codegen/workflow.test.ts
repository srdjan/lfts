// packages/lfts-codegen/workflow.test.ts
// Tests for workflow code generators

import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { t, withMetadata, Result, type WorkflowStep } from "../lfts-type-runtime/mod.ts";
import {
  generateWorkflowDocs,
  generateWorkflowDiagram,
  generateWorkflowTests,
} from "./workflow.ts";

// ============================================================================
// Test Data: Sample Workflow Steps
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
    id: t.string(),
    name: t.string(),
    email: t.string(),
    age: t.number(),
    createdAt: t.number(),
  }).bc,
  {
    name: "UserOutput",
    description: "Created user with ID",
    stage: "registration",
  }
);

const ValidationInput$ = withMetadata(
  t.object({
    id: t.string(),
    status: t.literal("pending"),
  }).bc,
  {
    name: "ValidationInput",
    stage: "validation",
  }
);

const ValidationOutput$ = withMetadata(
  t.object({
    id: t.string(),
    status: t.union(t.literal("approved"), t.literal("rejected")),
    validatedAt: t.number(),
  }).bc,
  {
    name: "ValidationOutput",
    stage: "validation",
  }
);

type UserInputType = { name: string; email: string; age: number };
type UserOutputType = { id: string; name: string; email: string; age: number; createdAt: number };
type ValidationInputType = { id: string; status: "pending" };
type ValidationOutputType = { id: string; status: "approved" | "rejected"; validatedAt: number };

const createUserStep: WorkflowStep<UserInputType, UserOutputType, never> = {
  name: "CreateUser",
  inputSchema: UserInput$,
  outputSchema: UserOutput$,
  execute: async (input) => {
    return Result.ok({
      id: "usr_123",
      ...input,
      createdAt: Date.now(),
    });
  },
  metadata: {
    permissions: ["admin", "user"],
    timeout: 5000,
  },
};

const validateUserStep: WorkflowStep<ValidationInputType, ValidationOutputType, never> = {
  name: "ValidateUser",
  inputSchema: ValidationInput$,
  outputSchema: ValidationOutput$,
  execute: async (input) => {
    return Result.ok({
      id: input.id,
      status: "approved" as const,
      validatedAt: Date.now(),
    });
  },
};

const testWorkflow = [createUserStep, validateUserStep];

// ============================================================================
// generateWorkflowDocs Tests
// ============================================================================

Deno.test("generateWorkflowDocs: basic documentation", () => {
  const docs = generateWorkflowDocs(testWorkflow);

  assertStringIncludes(docs, "# Workflow Documentation");
  assertStringIncludes(docs, "## Overview");
  assertStringIncludes(docs, "This workflow consists of 2 steps");
  assertStringIncludes(docs, "## Workflow Steps");
  assertStringIncludes(docs, "### 1. CreateUser");
  assertStringIncludes(docs, "### 2. ValidateUser");
});

Deno.test("generateWorkflowDocs: includes custom title", () => {
  const docs = generateWorkflowDocs(testWorkflow, {
    title: "User Registration Workflow",
  });

  assertStringIncludes(docs, "# User Registration Workflow");
});

Deno.test("generateWorkflowDocs: includes input field details", () => {
  const docs = generateWorkflowDocs(testWorkflow, {
    includeInputDetails: true,
  });

  assertStringIncludes(docs, "**Input Fields:**");
  assertStringIncludes(docs, "`name` (required)");
  assertStringIncludes(docs, "`email` (required)");
  assertStringIncludes(docs, "`age` (required)");
});

Deno.test("generateWorkflowDocs: includes constraints", () => {
  const docs = generateWorkflowDocs(testWorkflow, {
    includeConstraints: true,
  });

  assertStringIncludes(docs, "Constraints:");
  assertStringIncludes(docs, "minLength");
  assertStringIncludes(docs, "email");
});

Deno.test("generateWorkflowDocs: includes output fields", () => {
  const docs = generateWorkflowDocs(testWorkflow, {
    includeOutputDetails: true,
  });

  assertStringIncludes(docs, "**Output Fields:**");
  assertStringIncludes(docs, "`id`");
  assertStringIncludes(docs, "`createdAt`");
});

Deno.test("generateWorkflowDocs: includes metadata", () => {
  const docs = generateWorkflowDocs(testWorkflow, {
    includeMetadata: true,
  });

  assertStringIncludes(docs, "**Metadata:**");
  assertStringIncludes(docs, "permissions");
  assertStringIncludes(docs, "timeout");
});

Deno.test("generateWorkflowDocs: excludes metadata when disabled", () => {
  const docs = generateWorkflowDocs(testWorkflow, {
    includeMetadata: false,
  });

  assertEquals(docs.includes("**Metadata:**"), false);
});

Deno.test("generateWorkflowDocs: includes example code", () => {
  const docs = generateWorkflowDocs(testWorkflow);

  assertStringIncludes(docs, "**Example:**");
  assertStringIncludes(docs, "```typescript");
  assertStringIncludes(docs, "const result = await executeStep");
  assertStringIncludes(docs, "if (result.ok)");
});

Deno.test("generateWorkflowDocs: includes execution flow", () => {
  const docs = generateWorkflowDocs(testWorkflow);

  assertStringIncludes(docs, "## Execution Flow");
  assertStringIncludes(docs, "1. CreateUser →");
  assertStringIncludes(docs, "2. ValidateUser");
});

Deno.test("generateWorkflowDocs: single step workflow", () => {
  const docs = generateWorkflowDocs([createUserStep]);

  assertStringIncludes(docs, "This workflow consists of 1 step:");
  assertStringIncludes(docs, "1. **CreateUser**");
});

// ============================================================================
// generateWorkflowDiagram Tests
// ============================================================================

Deno.test("generateWorkflowDiagram: basic mermaid syntax", () => {
  const diagram = generateWorkflowDiagram(testWorkflow);

  assertStringIncludes(diagram, "```mermaid");
  assertStringIncludes(diagram, "flowchart TB");
  assertStringIncludes(diagram, "Start([Start])");
  assertStringIncludes(diagram, "End([End])");
  assertStringIncludes(diagram, "```");
});

Deno.test("generateWorkflowDiagram: includes step nodes", () => {
  const diagram = generateWorkflowDiagram(testWorkflow);

  assertStringIncludes(diagram, 'step1["CreateUser"]');
  assertStringIncludes(diagram, 'step2["ValidateUser"]');
});

Deno.test("generateWorkflowDiagram: includes connections", () => {
  const diagram = generateWorkflowDiagram(testWorkflow);

  assertStringIncludes(diagram, "Start --> step1");
  assertStringIncludes(diagram, "step1 --> step2");
  assertStringIncludes(diagram, "step2 --> End");
});

Deno.test("generateWorkflowDiagram: includes error paths", () => {
  const diagram = generateWorkflowDiagram(testWorkflow);

  assertStringIncludes(diagram, "%% Error handling");
  assertStringIncludes(diagram, "step1 -.->|error| End");
  assertStringIncludes(diagram, "step2 -.->|error| End");
});

Deno.test("generateWorkflowDiagram: left-to-right direction", () => {
  const diagram = generateWorkflowDiagram(testWorkflow, {
    direction: "LR",
  });

  assertStringIncludes(diagram, "flowchart LR");
});

Deno.test("generateWorkflowDiagram: includes field details", () => {
  const diagram = generateWorkflowDiagram(testWorkflow, {
    includeFields: true,
  });

  assertStringIncludes(diagram, "<br/><small>");
  assertStringIncludes(diagram, "name, email, age");
});

Deno.test("generateWorkflowDiagram: forest theme", () => {
  const diagram = generateWorkflowDiagram(testWorkflow, {
    theme: "forest",
  });

  assertStringIncludes(diagram, "%%{init: {'theme':'forest'}}%%");
});

Deno.test("generateWorkflowDiagram: dark theme", () => {
  const diagram = generateWorkflowDiagram(testWorkflow, {
    theme: "dark",
  });

  assertStringIncludes(diagram, "%%{init: {'theme':'dark'}}%%");
});

Deno.test("generateWorkflowDiagram: default theme has no init", () => {
  const diagram = generateWorkflowDiagram(testWorkflow, {
    theme: "default",
  });

  assertEquals(diagram.includes("%%{init:"), false);
});

// ============================================================================
// generateWorkflowTests Tests
// ============================================================================

Deno.test("generateWorkflowTests: deno framework basic structure", () => {
  const tests = generateWorkflowTests(testWorkflow, {
    framework: "deno",
  });

  assertStringIncludes(tests, 'import { assertEquals } from "jsr:@std/assert@1";');
  assertStringIncludes(tests, 'import { executeStep } from "lfts-runtime";');
  assertStringIncludes(tests, 'Deno.test("CreateUser: successful execution"');
  assertStringIncludes(tests, 'Deno.test("ValidateUser: successful execution"');
});

Deno.test("generateWorkflowTests: jest framework", () => {
  const tests = generateWorkflowTests(testWorkflow, {
    framework: "jest",
  });

  assertEquals(tests.includes('import { assertEquals }'), false);
  assertStringIncludes(tests, 'import { executeStep } from "lfts-runtime";');
  assertStringIncludes(tests, 'it("CreateUser: successful execution"');
});

Deno.test("generateWorkflowTests: vitest framework", () => {
  const tests = generateWorkflowTests(testWorkflow, {
    framework: "vitest",
  });

  assertStringIncludes(tests, 'import { describe, it, expect } from "vitest";');
  assertStringIncludes(tests, 'describe("Workflow Tests", () => {');
  assertStringIncludes(tests, 'it("CreateUser: successful execution"');
});

Deno.test("generateWorkflowTests: includes success tests", () => {
  const tests = generateWorkflowTests(testWorkflow, {
    includeSuccessTests: true,
  });

  assertStringIncludes(tests, "successful execution");
  assertStringIncludes(tests, "const input = {");
  assertStringIncludes(tests, "const result = await executeStep");
  assertStringIncludes(tests, "assertEquals(result.ok, true);");
});

Deno.test("generateWorkflowTests: includes validation tests", () => {
  const tests = generateWorkflowTests(testWorkflow, {
    includeValidationTests: true,
  });

  assertStringIncludes(tests, "input validation failure");
  assertStringIncludes(tests, "const invalidInput = {");
  assertStringIncludes(tests, 'assertEquals(result.error.type, "validation_failed");');
});

Deno.test("generateWorkflowTests: includes error tests", () => {
  const tests = generateWorkflowTests(testWorkflow, {
    includeErrorTests: true,
  });

  assertStringIncludes(tests, "handles execution errors");
  assertStringIncludes(tests, "// TODO: Mock or configure step to produce an error");
});

Deno.test("generateWorkflowTests: includes integration test", () => {
  const tests = generateWorkflowTests(testWorkflow);

  assertStringIncludes(tests, "Integration Test: Full Workflow");
  assertStringIncludes(tests, "Full workflow execution");
  assertStringIncludes(tests, "// Step 1");
  assertStringIncludes(tests, "step1Result");
});

Deno.test("generateWorkflowTests: excludes success tests when disabled", () => {
  const tests = generateWorkflowTests(testWorkflow, {
    includeSuccessTests: false,
  });

  assertEquals(tests.includes("successful execution"), false);
});

Deno.test("generateWorkflowTests: excludes validation tests when disabled", () => {
  const tests = generateWorkflowTests(testWorkflow, {
    includeValidationTests: false,
  });

  assertEquals(tests.includes("input validation failure"), false);
});

Deno.test("generateWorkflowTests: excludes error tests when disabled", () => {
  const tests = generateWorkflowTests(testWorkflow, {
    includeErrorTests: false,
  });

  assertEquals(tests.includes("handles execution errors"), false);
});

Deno.test("generateWorkflowTests: generates test section headers", () => {
  const tests = generateWorkflowTests(testWorkflow);

  assertStringIncludes(tests, "// ============================================================================");
  assertStringIncludes(tests, "// CreateUser Tests");
  assertStringIncludes(tests, "// ValidateUser Tests");
});

Deno.test("generateWorkflowTests: includes step imports", () => {
  const tests = generateWorkflowTests(testWorkflow);

  assertStringIncludes(tests, "// Import your workflow steps");
  assertStringIncludes(tests, 'import { createuserStep } from "./workflow";');
  assertStringIncludes(tests, 'import { validateuserStep } from "./workflow";');
});

Deno.test("generateWorkflowTests: generates example values for fields", () => {
  const tests = generateWorkflowTests(testWorkflow);

  // Should generate appropriate example values based on field names/constraints
  assertStringIncludes(tests, "email:");
  assertStringIncludes(tests, "name:");
  assertStringIncludes(tests, "age:");
});

Deno.test("generateWorkflowTests: single step workflow", () => {
  const tests = generateWorkflowTests([createUserStep]);

  assertStringIncludes(tests, "CreateUser: successful execution");
  assertStringIncludes(tests, "Integration Test: Full Workflow");
  assertEquals(tests.includes("step2"), false);
});

// ============================================================================
// Integration Tests
// ============================================================================

Deno.test("integration: generate all artifacts for workflow", () => {
  // Generate all three artifacts
  const docs = generateWorkflowDocs(testWorkflow, {
    title: "User Onboarding Workflow",
  });
  const diagram = generateWorkflowDiagram(testWorkflow, {
    direction: "LR",
    includeFields: true,
  });
  const tests = generateWorkflowTests(testWorkflow, {
    framework: "deno",
  });

  // All should be non-empty strings
  assertEquals(typeof docs, "string");
  assertEquals(typeof diagram, "string");
  assertEquals(typeof tests, "string");

  assertEquals(docs.length > 100, true);
  assertEquals(diagram.length > 50, true);
  assertEquals(tests.length > 200, true);

  // All should reference the workflow steps
  assertStringIncludes(docs, "CreateUser");
  assertStringIncludes(diagram, "CreateUser");
  assertStringIncludes(tests, "CreateUser");

  assertStringIncludes(docs, "ValidateUser");
  assertStringIncludes(diagram, "ValidateUser");
  assertStringIncludes(tests, "ValidateUser");
});

Deno.test("integration: empty workflow handles gracefully", () => {
  const docs = generateWorkflowDocs([]);
  const diagram = generateWorkflowDiagram([]);
  const tests = generateWorkflowTests([]);

  assertStringIncludes(docs, "This workflow consists of 0 steps");
  assertStringIncludes(diagram, "Start([Start])");
  assertStringIncludes(tests, "Integration Test: Full Workflow");
});
