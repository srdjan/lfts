// packages/lfts-codegen/workflow.ts
// Workflow documentation and visualization generators

import {
  introspect,
  type TypeObject,
  type WorkflowStep,
  analyzeWorkflow,
  type WorkflowStepAnalysis,
} from "../lfts-type-runtime/mod.ts";

/**
 * Options for workflow documentation generation
 */
export type WorkflowDocsOptions = {
  /** Include input field details (default: true) */
  includeInputDetails?: boolean;
  /** Include output field details (default: true) */
  includeOutputDetails?: boolean;
  /** Include constraints in field documentation (default: true) */
  includeConstraints?: boolean;
  /** Include metadata section (default: true) */
  includeMetadata?: boolean;
  /** Title for the documentation (default: "Workflow Documentation") */
  title?: string;
};

/**
 * Options for workflow diagram generation
 */
export type WorkflowDiagramOptions = {
  /** Diagram direction (default: "TB" - top to bottom) */
  direction?: "TB" | "LR" | "BT" | "RL";
  /** Include field details in nodes (default: false) */
  includeFields?: boolean;
  /** Diagram theme (default: "default") */
  theme?: "default" | "forest" | "dark" | "neutral";
};

/**
 * Options for workflow test scaffolding generation
 */
export type WorkflowTestOptions = {
  /** Test framework (default: "deno") */
  framework?: "deno" | "jest" | "vitest";
  /** Include success test cases (default: true) */
  includeSuccessTests?: boolean;
  /** Include validation failure test cases (default: true) */
  includeValidationTests?: boolean;
  /** Include error handling test cases (default: true) */
  includeErrorTests?: boolean;
};

const DEFAULT_DOCS_OPTIONS: Required<WorkflowDocsOptions> = {
  includeInputDetails: true,
  includeOutputDetails: true,
  includeConstraints: true,
  includeMetadata: true,
  title: "Workflow Documentation",
};

const DEFAULT_DIAGRAM_OPTIONS: Required<WorkflowDiagramOptions> = {
  direction: "TB",
  includeFields: false,
  theme: "default",
};

const DEFAULT_TEST_OPTIONS: Required<WorkflowTestOptions> = {
  framework: "deno",
  includeSuccessTests: true,
  includeValidationTests: true,
  includeErrorTests: true,
};

/**
 * Generate Markdown documentation for a workflow
 *
 * @param steps - Array of workflow steps
 * @param options - Documentation generation options
 * @returns Markdown documentation string
 *
 * @example
 * ```ts
 * import { generateWorkflowDocs } from "lfts-codegen";
 *
 * const docs = generateWorkflowDocs([openPRStep, reviewPRStep, mergePRStep], {
 *   title: "GitHub PR Workflow",
 *   includeConstraints: true,
 * });
 *
 * await Deno.writeTextFile("workflow-docs.md", docs);
 * ```
 */
export function generateWorkflowDocs(
  steps: WorkflowStep<any, any, any>[],
  options: WorkflowDocsOptions = {},
): string {
  const opts = { ...DEFAULT_DOCS_OPTIONS, ...options };
  const analysis = analyzeWorkflow(steps);

  const lines: string[] = [];

  // Title
  lines.push(`# ${opts.title}\n`);

  // Overview
  lines.push(`## Overview\n`);
  lines.push(
    `This workflow consists of ${steps.length} step${steps.length === 1 ? "" : "s"}:\n`,
  );
  for (let i = 0; i < steps.length; i++) {
    lines.push(`${i + 1}. **${steps[i].name}**`);
  }
  lines.push("");

  // Step details
  lines.push(`## Workflow Steps\n`);

  for (let i = 0; i < analysis.length; i++) {
    const stepAnalysis = analysis[i];
    const step = steps[i];

    lines.push(`### ${i + 1}. ${stepAnalysis.name}\n`);

    // Metadata
    if (opts.includeMetadata && stepAnalysis.metadata) {
      lines.push(`**Metadata:**\n`);
      for (const [key, value] of Object.entries(stepAnalysis.metadata)) {
        lines.push(`- ${key}: \`${JSON.stringify(value)}\``);
      }
      lines.push("");
    }

    // Input fields
    if (opts.includeInputDetails && stepAnalysis.inputFields.length > 0) {
      lines.push(`**Input Fields:**\n`);
      for (const field of stepAnalysis.inputFields) {
        const required = field.required ? " (required)" : " (optional)";
        const constraints =
          opts.includeConstraints && field.constraints.length > 0
            ? ` - Constraints: ${field.constraints.join(", ")}`
            : "";
        lines.push(`- \`${field.name}\`${required}${constraints}`);
      }
      lines.push("");
    }

    // Output fields
    if (opts.includeOutputDetails && stepAnalysis.outputFields.length > 0) {
      lines.push(`**Output Fields:**\n`);
      for (const field of stepAnalysis.outputFields) {
        lines.push(`- \`${field}\``);
      }
      lines.push("");
    }

    // Example usage (placeholder)
    lines.push(`**Example:**\n`);
    lines.push("```typescript");
    lines.push(`const result = await executeStep(${step.name}, {`);
    for (const field of stepAnalysis.inputFields.slice(0, 3)) {
      const exampleValue = getExampleValue(field);
      lines.push(`  ${field.name}: ${exampleValue},`);
    }
    if (stepAnalysis.inputFields.length > 3) {
      lines.push(`  // ... ${stepAnalysis.inputFields.length - 3} more fields`);
    }
    lines.push("});");
    lines.push("");
    lines.push("if (result.ok) {");
    lines.push("  console.log('Step succeeded:', result.value);");
    lines.push("} else {");
    lines.push("  console.error('Step failed:', result.error);");
    lines.push("}");
    lines.push("```\n");
  }

  // Execution flow
  lines.push(`## Execution Flow\n`);
  lines.push("The workflow executes steps in sequence:\n");
  for (let i = 0; i < steps.length; i++) {
    const arrow = i < steps.length - 1 ? " →" : "";
    lines.push(`${i + 1}. ${steps[i].name}${arrow}`);
  }
  lines.push("");
  lines.push(
    "Each step validates its input, executes business logic, and validates output before proceeding.\n",
  );

  return lines.join("\n");
}

/**
 * Generate a Mermaid flowchart diagram for a workflow
 *
 * @param steps - Array of workflow steps
 * @param options - Diagram generation options
 * @returns Mermaid diagram syntax string
 *
 * @example
 * ```ts
 * import { generateWorkflowDiagram } from "lfts-codegen";
 *
 * const diagram = generateWorkflowDiagram([openPRStep, reviewPRStep, mergePRStep], {
 *   direction: "LR",
 *   includeFields: true,
 * });
 *
 * console.log(diagram);
 * // Paste into GitHub markdown or Mermaid live editor
 * ```
 */
export function generateWorkflowDiagram(
  steps: WorkflowStep<any, any, any>[],
  options: WorkflowDiagramOptions = {},
): string {
  const opts = { ...DEFAULT_DIAGRAM_OPTIONS, ...options };
  const analysis = analyzeWorkflow(steps);

  const lines: string[] = [];

  // Diagram header
  lines.push("```mermaid");
  lines.push(`flowchart ${opts.direction}`);
  lines.push("");

  // Theme (if not default)
  if (opts.theme !== "default") {
    lines.push(`  %%{init: {'theme':'${opts.theme}'}}%%`);
    lines.push("");
  }

  // Start node
  lines.push("  Start([Start])");
  lines.push("");

  // Step nodes
  for (let i = 0; i < analysis.length; i++) {
    const stepAnalysis = analysis[i];
    const nodeId = `step${i + 1}`;
    const label = stepAnalysis.name;

    if (opts.includeFields && stepAnalysis.inputFields.length > 0) {
      // Multi-line node with fields
      const fieldsPreview = stepAnalysis.inputFields
        .slice(0, 3)
        .map((f) => f.name)
        .join(", ");
      lines.push(`  ${nodeId}["${label}<br/><small>${fieldsPreview}</small>"]`);
    } else {
      lines.push(`  ${nodeId}["${label}"]`);
    }
  }

  // End node
  lines.push("  End([End])");
  lines.push("");

  // Connections
  lines.push("  Start --> step1");
  for (let i = 1; i < steps.length; i++) {
    lines.push(`  step${i} --> step${i + 1}`);
  }
  lines.push(`  step${steps.length} --> End`);
  lines.push("");

  // Error paths (optional)
  lines.push("  %% Error handling");
  for (let i = 1; i <= steps.length; i++) {
    lines.push(`  step${i} -.->|error| End`);
  }

  lines.push("```");
  return lines.join("\n");
}

/**
 * Generate TypeScript test scaffolding for a workflow
 *
 * @param steps - Array of workflow steps
 * @param options - Test generation options
 * @returns TypeScript test code string
 *
 * @example
 * ```ts
 * import { generateWorkflowTests } from "lfts-codegen";
 *
 * const tests = generateWorkflowTests([openPRStep, reviewPRStep, mergePRStep], {
 *   framework: "deno",
 *   includeValidationTests: true,
 * });
 *
 * await Deno.writeTextFile("workflow.test.ts", tests);
 * ```
 */
export function generateWorkflowTests(
  steps: WorkflowStep<any, any, any>[],
  options: WorkflowTestOptions = {},
): string {
  const opts = { ...DEFAULT_TEST_OPTIONS, ...options };
  const analysis = analyzeWorkflow(steps);

  const lines: string[] = [];

  // Imports
  if (opts.framework === "deno") {
    lines.push(`import { assertEquals } from "jsr:@std/assert@1";`);
    lines.push(`import { executeStep } from "lfts-runtime";`);
  } else if (opts.framework === "jest") {
    lines.push(`import { executeStep } from "lfts-runtime";`);
  } else if (opts.framework === "vitest") {
    lines.push(`import { describe, it, expect } from "vitest";`);
    lines.push(`import { executeStep } from "lfts-runtime";`);
  }

  lines.push(`// Import your workflow steps`);
  for (const step of steps) {
    lines.push(`import { ${step.name.toLowerCase()}Step } from "./workflow";`);
  }
  lines.push("");

  // Test suite wrapper
  if (opts.framework === "vitest" || opts.framework === "jest") {
    lines.push(`describe("Workflow Tests", () => {`);
  }

  // Generate tests for each step
  for (let i = 0; i < analysis.length; i++) {
    const stepAnalysis = analysis[i];
    const step = steps[i];
    const stepVar = step.name.toLowerCase() + "Step";

    lines.push("");
    lines.push(
      `// ============================================================================`,
    );
    lines.push(`// ${stepAnalysis.name} Tests`);
    lines.push(
      `// ============================================================================`,
    );
    lines.push("");

    // Success test
    if (opts.includeSuccessTests) {
      const testName = `${stepAnalysis.name}: successful execution`;

      if (opts.framework === "deno") {
        lines.push(`Deno.test("${testName}", async () => {`);
      } else {
        lines.push(`  it("${testName}", async () => {`);
      }

      lines.push(`  const input = {`);
      for (const field of stepAnalysis.inputFields) {
        const exampleValue = getExampleValue(field);
        lines.push(`    ${field.name}: ${exampleValue},`);
      }
      lines.push(`  };`);
      lines.push("");
      lines.push(`  const result = await executeStep(${stepVar}, input);`);
      lines.push("");

      if (opts.framework === "deno") {
        lines.push(`  assertEquals(result.ok, true);`);
        lines.push(`  if (result.ok) {`);
        for (const field of stepAnalysis.outputFields.slice(0, 2)) {
          lines.push(`    assertEquals(typeof result.value.${field}, "string"); // TODO: Update assertion`);
        }
        lines.push(`  }`);
      } else if (opts.framework === "jest") {
        lines.push(`  expect(result.ok).toBe(true);`);
        lines.push(`  if (result.ok) {`);
        for (const field of stepAnalysis.outputFields.slice(0, 2)) {
          lines.push(`    expect(result.value.${field}).toBeDefined();`);
        }
        lines.push(`  }`);
      } else {
        lines.push(`  expect(result.ok).toBe(true);`);
      }

      lines.push(`});`);
      lines.push("");
    }

    // Validation failure test
    if (opts.includeValidationTests && stepAnalysis.inputFields.length > 0) {
      const testName = `${stepAnalysis.name}: input validation failure`;

      if (opts.framework === "deno") {
        lines.push(`Deno.test("${testName}", async () => {`);
      } else {
        lines.push(`  it("${testName}", async () => {`);
      }

      lines.push(`  const invalidInput = {`);
      lines.push(`    // TODO: Provide invalid data that violates schema`);
      for (const field of stepAnalysis.inputFields.slice(0, 2)) {
        lines.push(`    ${field.name}: null, // Invalid`);
      }
      lines.push(`  };`);
      lines.push("");
      lines.push(`  const result = await executeStep(${stepVar}, invalidInput);`);
      lines.push("");

      if (opts.framework === "deno") {
        lines.push(`  assertEquals(result.ok, false);`);
        lines.push(`  if (!result.ok) {`);
        lines.push(`    assertEquals(result.error.type, "validation_failed");`);
        lines.push(`    assertEquals(result.error.stage, "${stepAnalysis.name}");`);
        lines.push(`  }`);
      } else if (opts.framework === "jest") {
        lines.push(`  expect(result.ok).toBe(false);`);
        lines.push(`  if (!result.ok) {`);
        lines.push(`    expect(result.error.type).toBe("validation_failed");`);
        lines.push(`  }`);
      } else {
        lines.push(`  expect(result.ok).toBe(false);`);
      }

      lines.push(`});`);
      lines.push("");
    }

    // Error handling test
    if (opts.includeErrorTests) {
      const testName = `${stepAnalysis.name}: handles execution errors`;

      if (opts.framework === "deno") {
        lines.push(`Deno.test("${testName}", async () => {`);
      } else {
        lines.push(`  it("${testName}", async () => {`);
      }

      lines.push(`  // TODO: Mock or configure step to produce an error`);
      lines.push(`  const input = {`);
      for (const field of stepAnalysis.inputFields) {
        const exampleValue = getExampleValue(field);
        lines.push(`    ${field.name}: ${exampleValue},`);
      }
      lines.push(`  };`);
      lines.push("");
      lines.push(`  const result = await executeStep(${stepVar}, input);`);
      lines.push("");
      lines.push(`  // TODO: Add assertions for error handling`);
      lines.push(`  // Example:`);
      lines.push(`  // if (!result.ok) {`);
      lines.push(`  //   assertEquals(result.error.type, "custom_error");`);
      lines.push(`  // }`);

      lines.push(`});`);
      lines.push("");
    }
  }

  // Integration test for full workflow
  lines.push("");
  lines.push(
    `// ============================================================================`,
  );
  lines.push(`// Integration Test: Full Workflow`);
  lines.push(
    `// ============================================================================`,
  );
  lines.push("");

  const integrationTestName = "Full workflow execution";

  if (opts.framework === "deno") {
    lines.push(`Deno.test("${integrationTestName}", async () => {`);
  } else {
    lines.push(`  it("${integrationTestName}", async () => {`);
  }

  lines.push(`  // TODO: Execute complete workflow chain`);
  lines.push(`  // Step 1`);
  if (steps.length > 0) {
    const firstStep = steps[0];
    lines.push(
      `  const step1Result = await executeStep(${firstStep.name.toLowerCase()}Step, {`,
    );
    for (const field of analysis[0].inputFields.slice(0, 2)) {
      const exampleValue = getExampleValue(field);
      lines.push(`    ${field.name}: ${exampleValue},`);
    }
    lines.push(`  });`);
    lines.push("");

    if (opts.framework === "deno") {
      lines.push(`  assertEquals(step1Result.ok, true);`);
    } else {
      lines.push(`  expect(step1Result.ok).toBe(true);`);
    }

    if (steps.length > 1) {
      lines.push("");
      lines.push(`  // Step 2 (using output from Step 1)`);
      lines.push(`  // if (step1Result.ok) {`);
      lines.push(
        `  //   const step2Result = await executeStep(${steps[1].name.toLowerCase()}Step, step1Result.value);`,
      );
      lines.push(`  //   assertEquals(step2Result.ok, true);`);
      lines.push(`  // }`);
    }
  }

  lines.push(`});`);

  // Close test suite wrapper
  if (opts.framework === "vitest" || opts.framework === "jest") {
    lines.push(`});`);
  }

  lines.push("");
  return lines.join("\n");
}

/**
 * Helper: Generate example value for a field based on its constraints
 */
function getExampleValue(
  field: WorkflowStepAnalysis["inputFields"][0],
): string {
  const hasEmail = field.constraints.includes("email");
  const hasUrl = field.constraints.includes("url");
  const hasMinLength = field.constraints.some((c) => c.startsWith("minLength"));
  const hasMin = field.constraints.includes("min");

  if (hasEmail) {
    return '"user@example.com"';
  }
  if (hasUrl) {
    return '"https://example.com"';
  }
  if (hasMinLength) {
    return '"example value"';
  }
  if (hasMin) {
    return "42";
  }

  // Default examples by field name
  if (field.name.toLowerCase().includes("email")) {
    return '"user@example.com"';
  }
  if (field.name.toLowerCase().includes("name")) {
    return '"Example Name"';
  }
  if (field.name.toLowerCase().includes("age")) {
    return "25";
  }
  if (field.name.toLowerCase().includes("count") || field.name.toLowerCase().includes("number")) {
    return "1";
  }

  // Fallback
  return '"TODO: provide value"';
}
