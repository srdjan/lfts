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
import { inspect, validateSafe } from "./mod.js";
import { introspect, getRefinements } from "./introspection.js";
import { withRetry } from "./distributed.js";
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
export async function executeStep(step, input) {
    // Validate input against schema
    const inputResult = validateSafe(step.inputSchema, input);
    if (!inputResult.ok) {
        return {
            ok: false,
            error: {
                type: "validation_failed",
                stage: step.name,
                errors: inputResult.error,
            },
        };
    }
    // Execute the step (with retry if configured)
    const executeWithRetry = step.metadata?.retry
        ? () => withRetry(() => step.execute(inputResult.value), step.metadata.retry)
        : () => step.execute(inputResult.value);
    const result = await executeWithRetry();
    if (!result.ok) {
        return result;
    }
    // Validate output against schema
    const outputResult = validateSafe(step.outputSchema, result.value);
    if (!outputResult.ok) {
        return {
            ok: false,
            error: {
                type: "output_invalid",
                stage: step.name,
                errors: outputResult.error,
            },
        };
    }
    return { ok: true, value: outputResult.value };
}
/**
 * Execute multiple workflow steps in parallel
 *
 * Runs all provided steps concurrently and returns results based on the
 * specified mode. In "fail-fast" mode, returns immediately on first error.
 * In "settle-all" mode, waits for all steps and returns both successes and failures.
 *
 * @template TIn - Input type (can vary per step)
 * @template TOut - Output type (can vary per step)
 * @template TErr - Error type
 *
 * @param stepInputs - Array of step/input pairs to execute
 * @param options - Execution options (mode: "fail-fast" | "settle-all")
 *
 * @returns ParallelResult with successes/failures based on mode
 *
 * @example
 * ```typescript
 * const result = await executeStepsInParallel([
 *   { step: fetchUserStep, input: { userId: "123" } },
 *   { step: fetchPostsStep, input: { userId: "123" } },
 *   { step: fetchCommentsStep, input: { userId: "123" } }
 * ], { mode: "fail-fast" });
 *
 * if (result.mode === "fail-fast" && result.result.ok) {
 *   const [user, posts, comments] = result.result.value;
 *   console.log("All steps succeeded:", { user, posts, comments });
 * }
 * ```
 */
export async function executeStepsInParallel(stepInputs, options = {}) {
    const { mode = "fail-fast" } = options;
    // Execute all steps in parallel
    const promises = stepInputs.map(({ step, input }) => executeStep(step, input));
    if (mode === "fail-fast") {
        // Fail-fast: stop on first error
        try {
            const results = await Promise.all(promises);
            // Check if any failed
            for (const result of results) {
                if (!result.ok) {
                    return { mode: "fail-fast", result };
                }
            }
            // All succeeded
            const values = results.map((r) => r.value);
            return { mode: "fail-fast", result: { ok: true, value: values } };
        }
        catch (error) {
            // This shouldn't happen as we use Result pattern, but handle it just in case
            return {
                mode: "fail-fast",
                result: {
                    ok: false,
                    error: {
                        type: "workflow_stopped",
                        reason: `Unexpected error during parallel execution: ${error}`,
                    },
                },
            };
        }
    }
    else {
        // Settle-all: wait for all steps
        const results = await Promise.all(promises);
        const successes = [];
        const failures = [];
        for (const result of results) {
            if (result.ok) {
                successes.push(result.value);
            }
            else {
                failures.push(result.error);
            }
        }
        return { mode: "settle-all", successes, failures };
    }
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
export function createObservableSchema(schema, stageName) {
    const inspected = inspect(schema, (ctx) => {
        ctx.onSuccess((value) => {
            console.log(`✓ ${stageName}: validation passed`, {
                timestamp: new Date().toISOString(),
                properties: typeof value === "object" && value !== null
                    ? Object.keys(value)
                    : [],
            });
        });
        ctx.onFailure((error) => {
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
export function analyzeWorkflow(steps) {
    return steps.map((step) => {
        let inputInfo = introspect(step.inputSchema);
        let outputInfo = introspect(step.outputSchema);
        // Unwrap metadata wrappers
        while (inputInfo.kind === "metadata") {
            inputInfo = introspect(inputInfo.inner);
        }
        while (outputInfo.kind === "metadata") {
            outputInfo = introspect(outputInfo.inner);
        }
        return {
            name: step.name,
            inputFields: inputInfo.kind === "object"
                ? inputInfo.properties.map((p) => ({
                    name: p.name,
                    required: !p.optional,
                    constraints: getRefinements(p.type).map((r) => r.kind),
                }))
                : [],
            outputFields: outputInfo.kind === "object"
                ? outputInfo.properties.map((p) => p.name)
                : [],
            metadata: step.metadata,
        };
    });
}
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
export function createWorkflowRegistry() {
    const steps = [];
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
export function inspectStep(step, options = {}) {
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
