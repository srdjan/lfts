/**
 * Workflow orchestration primitives for LFTS
 *
 * Provides schema-driven workflow step execution with automatic input/output validation.
 * Each workflow step is defined by:
 * - Input schema (what data the step expects)
 * - Output schema (what data the step produces)
 * - Execute function (business logic)
 *
 * @example
 * ```typescript
 * const step: WorkflowStep<InputType, OutputType, never> = {
 *   name: "ProcessOrder",
 *   inputSchema: OrderInputSchema,
 *   outputSchema: OrderOutputSchema,
 *   execute: async (input) => {
 *     const processed = await processOrder(input);
 *     return Result.ok(processed);
 *   }
 * };
 *
 * const result = await executeStep(step, inputData);
 * if (result.ok) {
 *   console.log("Step succeeded:", result.value);
 * } else {
 *   console.error("Step failed:", result.error);
 * }
 * ```
 *
 * @module workflow
 * @since v0.11.0
 */

import type { Result, ValidationError, TypeObject } from "./mod.ts";
import { inspect, validateSafe } from "./mod.ts";
import { getMetadata, type SchemaMetadata } from "./mod.ts";
import { introspect, getRefinements } from "./introspection.ts";

/**
 * Workflow error types
 */
export type WorkflowError =
  | {
      type: "validation_failed";
      stage: string;
      errors: ValidationError;
    }
  | {
      type: "output_invalid";
      stage: string;
      errors: ValidationError;
    }
  | {
      type: "workflow_stopped";
      reason: string;
    };

/**
 * A single step in a workflow with typed inputs and outputs
 *
 * @template TIn - Input type for the step
 * @template TOut - Output type for the step
 * @template TErr - Custom error type for step execution
 */
export type WorkflowStep<TIn, TOut, TErr> = {
  /** Name of the workflow step (for logging and error reporting) */
  name: string;

  /** Schema that validates the step's input data */
  inputSchema: TypeObject;

  /** Schema that validates the step's output data */
  outputSchema: TypeObject;

  /** Execute function that performs the step's business logic */
  execute: (input: TIn) => Promise<Result<TOut, TErr>>;

  /** Optional metadata for the step */
  metadata?: Record<string, unknown>;
};

/**
 * Execute a workflow step with automatic input and output validation
 *
 * Validates the input against the step's input schema, executes the step,
 * then validates the output against the step's output schema. Returns a
 * Result containing either the validated output or a workflow error.
 *
 * @template TIn - Input type for the step
 * @template TOut - Output type for the step
 * @template TErr - Custom error type for step execution
 *
 * @param step - The workflow step to execute
 * @param input - Input data (will be validated against step.inputSchema)
 *
 * @returns AsyncResult containing validated output or workflow error
 *
 * @example
 * ```typescript
 * const result = await executeStep(openPRStep, {
 *   title: "Add feature",
 *   description: "Implements new feature",
 *   branch: "feature/new-feature"
 * });
 *
 * if (result.ok) {
 *   console.log("PR opened:", result.value.prId);
 * } else {
 *   if (result.error.type === "validation_failed") {
 *     console.error("Invalid input:", result.error.errors);
 *   }
 * }
 * ```
 */
export async function executeStep<TIn, TOut, TErr>(
  step: WorkflowStep<TIn, TOut, TErr>,
  input: unknown
): Promise<Result<TOut, WorkflowError | TErr>> {
  // Validate input against schema
  const inputResult = validateSafe(step.inputSchema, input);
  if (!inputResult.ok) {
    return {
      ok: false,
      error: {
        type: "validation_failed" as const,
        stage: step.name,
        errors: inputResult.error,
      },
    };
  }

  // Execute the step
  const result = await step.execute(inputResult.value as TIn);
  if (!result.ok) {
    return result;
  }

  // Validate output against schema
  const outputResult = validateSafe(step.outputSchema, result.value);
  if (!outputResult.ok) {
    return {
      ok: false,
      error: {
        type: "output_invalid" as const,
        stage: step.name,
        errors: outputResult.error,
      },
    };
  }

  return { ok: true, value: outputResult.value as TOut };
}

/**
 * Create an observable schema that logs validation events
 *
 * Wraps a schema with inspect() hooks that log validation success/failure.
 * Useful for debugging and monitoring workflow step execution.
 *
 * @template T - Type validated by the schema
 *
 * @param schema - Schema to wrap with observability
 * @param stageName - Name of the stage (for logging)
 *
 * @returns Wrapped schema with logging hooks
 *
 * @example
 * ```typescript
 * const ObservableInput$ = createObservableSchema(
 *   InputSchema,
 *   "ProcessOrder-Input"
 * );
 *
 * // When validated, automatically logs:
 * // ✓ ProcessOrder-Input: validation passed { timestamp: ..., properties: [...] }
 * ```
 */
export function createObservableSchema<T>(
  schema: TypeObject,
  stageName: string
): TypeObject {
  const inspected = inspect(schema, (ctx) => {
    ctx.onSuccess((value) => {
      console.log(`✓ ${stageName}: validation passed`, {
        timestamp: new Date().toISOString(),
        properties: typeof value === "object" && value !== null
          ? Object.keys(value)
          : [],
      });
    });

    ctx.onFailure((error: ValidationError) => {
      console.error(`✗ ${stageName}: validation failed`, {
        timestamp: new Date().toISOString(),
        error: error.message || String(error),
      });
    });
  });

  // Return the underlying schema bytecode
  return inspected.schema;
}

/**
 * Workflow step analysis result
 */
export type WorkflowStepAnalysis = {
  /** Name of the workflow step */
  name: string;

  /** Input fields with their properties */
  inputFields: Array<{
    name: string;
    required: boolean;
    constraints: string[];
  }>;

  /** Output field names */
  outputFields: string[];

  /** Optional metadata attached to the step */
  metadata?: Record<string, unknown>;
};

/**
 * Analyze a workflow by introspecting its step schemas
 *
 * Examines each step's input and output schemas to extract field information,
 * constraints, and metadata. Useful for generating documentation, visualizations,
 * or runtime workflow validation.
 *
 * @param steps - Array of workflow steps to analyze
 *
 * @returns Array of workflow step analyses
 *
 * @example
 * ```typescript
 * const analysis = analyzeWorkflow([openPRStep, reviewPRStep, mergePRStep]);
 *
 * console.log(JSON.stringify(analysis, null, 2));
 * // [
 * //   {
 * //     name: "OpenPR",
 * //     inputFields: [
 * //       { name: "title", required: true, constraints: ["minLength"] },
 * //       { name: "description", required: true, constraints: ["minLength"] },
 * //       { name: "branch", required: true, constraints: ["pattern"] }
 * //     ],
 * //     outputFields: ["prId", "status", "title", "checksRequired"]
 * //   },
 * //   ...
 * // ]
 * ```
 */
export function analyzeWorkflow(
  steps: WorkflowStep<any, any, any>[]
): WorkflowStepAnalysis[] {
  return steps.map((step) => {
    const inputInfo = introspect(step.inputSchema);
    const outputInfo = introspect(step.outputSchema);

    return {
      name: step.name,
      inputFields:
        inputInfo.kind === "object"
          ? inputInfo.properties.map((p) => ({
              name: p.name,
              required: !p.optional,
              constraints: getRefinements(p.type).map((r) => r.kind),
            }))
          : [],
      outputFields:
        outputInfo.kind === "object"
          ? outputInfo.properties.map((p) => p.name)
          : [],
      metadata: step.metadata,
    };
  });
}

/**
 * Workflow registry for step discovery and metadata queries
 */
export type WorkflowRegistry = {
  /** Register a workflow step with optional metadata */
  register<TIn, TOut, TErr>(
    step: WorkflowStep<TIn, TOut, TErr>,
    metadata?: Record<string, unknown>
  ): void;

  /** Find steps by metadata predicate */
  find(predicate: (step: WorkflowStep<any, any, any>) => boolean): WorkflowStep<
    any,
    any,
    any
  >[];

  /** Get all registered steps */
  all(): WorkflowStep<any, any, any>[];

  /** Find step by name */
  findByName(name: string): WorkflowStep<any, any, any> | undefined;
};

/**
 * Create a new workflow registry for step discovery
 *
 * Registries allow you to collect and query workflow steps by metadata.
 * Useful for organizing large workflows with many steps.
 *
 * @returns A new workflow registry
 *
 * @example
 * ```typescript
 * const registry = createWorkflowRegistry();
 *
 * registry.register(openPRStep, { stage: "open", permissions: ["user"] });
 * registry.register(reviewPRStep, { stage: "review", permissions: ["admin"] });
 * registry.register(mergePRStep, { stage: "merge", permissions: ["admin"] });
 *
 * const adminSteps = registry.find(step =>
 *   step.metadata?.permissions?.includes("admin")
 * );
 *
 * const reviewStep = registry.findByName("ReviewPR");
 * ```
 */
export function createWorkflowRegistry(): WorkflowRegistry {
  const steps: Array<
    WorkflowStep<any, any, any> & { metadata?: Record<string, unknown> }
  > = [];

  return {
    register(step, metadata) {
      steps.push({ ...step, metadata: { ...step.metadata, ...metadata } });
    },

    find(predicate) {
      return steps.filter(predicate);
    },

    all() {
      return [...steps];
    },

    findByName(name) {
      return steps.find((step) => step.name === name);
    },
  };
}

/**
 * Inspect a workflow step by wrapping its schemas with observability hooks
 *
 * Creates a new step with observable input and output schemas that log
 * validation events. The original step is not modified.
 *
 * @template TIn - Input type for the step
 * @template TOut - Output type for the step
 * @template TErr - Custom error type for step execution
 *
 * @param step - The workflow step to make observable
 * @param options - Observability options
 *
 * @returns New step with observable schemas
 *
 * @example
 * ```typescript
 * const observableStep = inspectStep(openPRStep, {
 *   logInput: true,
 *   logOutput: true
 * });
 *
 * // Validation events automatically logged to console
 * const result = await executeStep(observableStep, data);
 * ```
 */
export function inspectStep<TIn, TOut, TErr>(
  step: WorkflowStep<TIn, TOut, TErr>,
  options: {
    logInput?: boolean;
    logOutput?: boolean;
  } = {}
): WorkflowStep<TIn, TOut, TErr> {
  const { logInput = true, logOutput = true } = options;

  return {
    ...step,
    inputSchema: logInput
      ? createObservableSchema(step.inputSchema, `${step.name}-Input`)
      : step.inputSchema,
    outputSchema: logOutput
      ? createObservableSchema(step.outputSchema, `${step.name}-Output`)
      : step.outputSchema,
  };
}
