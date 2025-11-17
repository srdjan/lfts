# LFTS Implemented Features

This document describes all features that have been implemented in the LFTS
runtime and compiler. For future planned features, see
[FUTURE_DIRECTION.md](FUTURE_DIRECTION.md).

> Canonical Light-FP syntax/rule details live in [LANG-SPEC.md](LANG-SPEC.md);
> this file summarizes implementations and links back to the spec where
> needed.

---

## Type Object System (v0.10.0)

**Status:** ✅ Production ready

A hybrid architecture that wraps bytecode arrays with a rich reflection API while maintaining full backward compatibility and zero performance overhead.

**Key Features:**
- 🎯 **Reflection-first API**: Programmatic access to schema structure
- 🔧 **Runtime composition**: Transform schemas dynamically (makePartial, pick, omit, extend)
- 🚀 **Zero overhead**: Same bytecode interpreter, <5% unwrapping cost
- ✅ **Backward compatible**: Raw bytecode arrays still work
- 🏗️ **Builder API**: Fluent programmatic schema construction (`t.object()`, `t.string()`, etc.)
- 📊 **Rich introspection**: Direct property/variant access without parsing

**Example:**
```typescript
import { t } from "./packages/lfts-type-runtime/mod.ts";

// Builder API - programmatic construction
const User$ = t.object({
  id: t.string().pattern("^usr_[a-z0-9]+$"),
  email: t.string().email(),
  age: t.number().min(0),
  role: t.union(t.literal("admin"), t.literal("user")),
});

// Runtime composition
const PartialUser$ = User$.makePartial();
const PublicUser$ = User$.pick(["id", "role"]);

// Validation
const result = User$.validateSafe(data);
if (result.ok) {
  console.log("Valid user:", result.value);
}

// Introspection
console.log(User$.properties.length);  // 4
console.log(User$.properties[0].name); // "id"
```

**Files:**
- Core implementation: [`type-object.ts`](../packages/lfts-type-runtime/type-object.ts) (~1,200 lines)
- Builder API: [`builders.ts`](../packages/lfts-type-runtime/builders.ts) (~400 lines)
- Tests: [`type-object.test.ts`](../packages/lfts-type-runtime/type-object.test.ts) (48/49 passing)
- Backward compatibility: [`backward-compat.test.ts`](../packages/lfts-type-runtime/backward-compat.test.ts) (27/27 passing)
- Performance: [`benchmark-type-objects.ts`](../packages/lfts-type-runtime/benchmark-type-objects.ts)

**Documentation:** See [TYPE_OBJECTS.md](TYPE_OBJECTS.md) for complete guide.

---

## Distributed Execution Helpers (v0.9.0)

**Status:** ✅ Production ready (Phase 2 complete)

Optional helpers for building distributed systems following the Light-FP philosophy: **composable primitives over layered frameworks**.

**Philosophy:** "Distributed = Local + Network Errors" - treat network operations as fallible local operations that return explicit error types.

### HTTP Adapters

Schema-validated HTTP client built on native `fetch`:

- `httpGet<T>(url, schema, options?)` - GET with response validation
- `httpPost<TReq, TRes>(url, data, reqSchema, resSchema, options?)` - POST with request/response validation
- `httpPut<TReq, TRes>(url, data, reqSchema, resSchema, options?)` - PUT for updates
- `httpDelete(url, options?)` - DELETE operations

**All operations return `Result<T, NetworkError>`** for explicit error handling.

**NetworkError ADT** - 5 variants modeling all failure modes:
```typescript
type NetworkError =
  | { type: "timeout"; url: string; ms: number }
  | { type: "connection_refused"; url: string }
  | { type: "http_error"; url: string; status: number; body: string }
  | { type: "dns_failure"; domain: string }
  | { type: "serialization_error"; message: string; path?: string };
```

**Example:**
```typescript
import {
  httpGet,
  httpPost,
  type NetworkError,
} from "./packages/lfts-type-runtime/distributed.ts";

const result = await httpGet<User>(
  "https://api.example.com/users/123",
  UserSchema,
  { timeoutMs: 5000 }
);

if (result.ok) {
  console.log("User:", result.value);
} else {
  // Exhaustive error handling
  if (result.error.type === "timeout") {
    console.error(`Timeout after ${result.error.ms}ms`);
  } else if (result.error.type === "http_error") {
    console.error(`HTTP ${result.error.status}: ${result.error.body}`);
  }
  // ... handle other cases
}
```

### Resilience Patterns

Composable fault tolerance primitives:

**1. withRetry** - Exponential backoff:
```typescript
const result = await withRetry(
  () => httpGet<User>(url, UserSchema),
  {
    maxAttempts: 3,
    initialDelayMs: 100,
    backoffMultiplier: 2,
    shouldRetry: (err) =>
      err.type === "timeout" ||
      err.type === "connection_refused" ||
      (err.type === "http_error" && err.status >= 500)
  }
);
```

**2. createCircuitBreaker** - Cascading failure prevention:
```typescript
const breaker = createCircuitBreaker({
  failureThreshold: 5,    // Open after 5 failures
  successThreshold: 2,    // Close after 2 successes in half-open
  timeoutMs: 60000        // Wait 60s before half-open
});

const result = await breaker.execute(() =>
  httpGet<User>(url, UserSchema)
);

console.log("Circuit state:", breaker.getState()); // closed | open | half_open
```

**3. withFallback** - Graceful degradation:
```typescript
const result = await withFallback(
  httpGet<Config>(remoteUrl, ConfigSchema),
  Promise.resolve(Result.ok(DEFAULT_CONFIG))
);
```

**4. withTimeout** - Custom timeout wrapper:
```typescript
const result = await withTimeout(
  httpGet<User>(url, UserSchema),
  1000,              // 1 second timeout
  "user-service"     // Service name for error message
);
```

### Pattern Composition

All patterns compose via standard function composition:

```typescript
const breaker = createCircuitBreaker({ failureThreshold: 5 });

// Retry + Circuit Breaker + Fallback
const result = await withRetry(
  () => withFallback(
    breaker.execute(() => httpGet<Product>(url, ProductSchema)),
    Promise.resolve(Result.ok(DEFAULT_PRODUCT))
  ),
  {
    maxAttempts: 3,
    shouldRetry: (err) => err.type === "timeout"
  }
);
```

### Port Pattern (Location Transparency)

Abstract transport behind interfaces:

```typescript
interface UserServicePort {
  getUser(id: number): Promise<Result<User, NetworkError>>;
  createUser(user: Omit<User, "id">): Promise<Result<User, NetworkError>>;
}

function createUserServiceAdapter(baseUrl: string): UserServicePort {
  const breaker = createCircuitBreaker({ failureThreshold: 5 });

  return {
    getUser: (id) =>
      withRetry(
        () => breaker.execute(() =>
          httpGet<User>(`${baseUrl}/users/${id}`, UserSchema)
        ),
        { maxAttempts: 3 }
      ),

    createUser: (user) =>
      httpPost<Omit<User, "id">, User>(
        `${baseUrl}/users`,
        user,
        CreateUserRequestSchema,
        UserSchema
      )
  };
}

// Business logic depends on port, not transport
async function processUser(userService: UserServicePort, userId: number) {
  const result = await userService.getUser(userId);
  // ... business logic
}
```

### Test Coverage

**31/31 tests passing** (947 lines):
- 6 httpGet tests (success, errors, timeout, validation)
- 4 httpPost tests (success, validation, errors, timeout)
- 2 httpPut tests (success, errors)
- 4 httpDelete tests (204/200 responses, errors, timeout)
- 1 custom headers test
- 4 retry tests (success, recovery, exhaustion, predicate)
- 4 circuit breaker tests (closed, open, half-open, recovery)
- 2 fallback tests (primary success, fallback on failure)
- 2 timeout tests (completes within, exceeds)
- 2 composition tests (retry+breaker, retry+fallback)

**Files:**
- `packages/lfts-type-runtime/distributed.ts` (768 lines) - Implementation
- `packages/lfts-type-runtime/distributed.test.ts` (947 lines) - Tests
- `packages/lfts-type-runtime/distributed-example.ts` (650 lines) - 8 complete examples
- `docs/DISTRIBUTED_GUIDE.md` (~500 lines) - User guide

### Performance

- **Bundle size**: ~6KB minified (tree-shakeable)
- **HTTP overhead**: ~1-2ms for validation (vs raw fetch)
- **Circuit breaker**: ~0.1ms per call
- **Zero external dependencies** (uses native `fetch` + `AbortController`)

### Running Examples

```bash
# Run comprehensive example suite (8 examples)
deno run -A packages/lfts-type-runtime/distributed-example.ts

# Run tests
deno test --allow-net packages/lfts-type-runtime/distributed.test.ts
```

See [DISTRIBUTED_GUIDE.md](./DISTRIBUTED_GUIDE.md) for complete documentation, best practices, and comparison with alternatives (gRPC, tRPC, Actor model).

---

## Workflow Orchestration (v0.11.0, v0.12.0)

**Status:** ✅ Production ready

Schema-driven workflow orchestration primitives for building type-safe, validated multi-step business processes. Built on introspection APIs to enable self-documenting workflows with automatic input/output validation.

**v0.12.0 additions:** Automatic retry with exponential backoff and parallel step execution (fail-fast and settle-all modes).

**Philosophy:** "Workflows are schemas" - define your workflow steps using schemas, and the runtime handles validation, observability, and introspection automatically.

### Workflow Steps

Execute multi-step workflows with automatic validation:

```typescript
import {
  type WorkflowStep,
  executeStep,
  Result,
} from "./packages/lfts-type-runtime/mod.ts";

const openPRStep: WorkflowStep<OpenPRInput, OpenPROutput, never> = {
  name: "OpenPR",
  inputSchema: OpenPRInput$,
  outputSchema: OpenPROutput$,
  execute: async (input) => {
    // Business logic here
    return Result.ok({ prId: "pr_123", status: "open", ...input });
  },
  metadata: {
    stage: "open",
    permissions: ["user", "admin"],
  },
};

// Execute with automatic validation
const result = await executeStep(openPRStep, prData);
if (result.ok) {
  console.log("Step succeeded:", result.value);
} else {
  // Explicit error handling (validation or execution)
  console.error("Step failed:", result.error);
}
```

**Workflow errors** are explicitly typed:
```typescript
type WorkflowError =
  | { type: "validation_failed"; stage: string; errors: ValidationError }
  | { type: "output_invalid"; stage: string; errors: ValidationError }
  | { type: "workflow_stopped"; reason: string };
```

### State Machines

Generic finite state machine builder for workflow state management:

```typescript
import { stateMachine, createStateMachine } from "./packages/lfts-type-runtime/mod.ts";

// Builder API
const orderFSM = stateMachine<OrderState>({ type: "draft", items: [] })
  .transition("submit", "draft", "pending", (state) => ({
    type: "pending",
    submittedAt: Date.now()
  }))
  .transition("approve", "pending", "approved",
    (state, approver: string) => ({
      type: "approved",
      approvedBy: approver,
      approvedAt: Date.now()
    }),
    (state) => state.items.length > 0  // Guard condition
  )
  .build();

// Use the state machine
const result = orderFSM.transition("approve", "admin@example.com");
if (result.ok) {
  console.log("New state:", result.value.type);
} else {
  console.error("Transition failed:", result.error);
}

// Query valid transitions
console.log("Valid events:", orderFSM.getValidEvents());
console.log("Can approve?", orderFSM.can("approve"));
```

**State machine features:**
- ✅ Type-safe transitions using discriminated unions
- ✅ Guard conditions for conditional transitions
- ✅ Payload support for transition data
- ✅ State introspection (`can()`, `getValidEvents()`)
- ✅ Builder API and config-based creation
- ✅ Reset to initial state

### Workflow Analysis

Runtime introspection of workflow structure:

```typescript
import { analyzeWorkflow } from "./packages/lfts-type-runtime/mod.ts";

const analysis = analyzeWorkflow([openPRStep, reviewPRStep, mergePRStep]);

// Returns:
// [
//   {
//     name: "OpenPR",
//     inputFields: [
//       { name: "title", required: true, constraints: ["minLength"] },
//       { name: "description", required: true, constraints: ["minLength"] },
//       { name: "branch", required: true, constraints: ["pattern"] }
//     ],
//     outputFields: ["prId", "status", "title", "checksRequired"],
//     metadata: { stage: "open", permissions: ["user", "admin"] }
//   },
//   ...
// ]
```

### Observable Workflows

Built-in observability hooks for debugging and monitoring:

```typescript
import { inspectStep, createObservableSchema } from "./packages/lfts-type-runtime/mod.ts";

// Wrap step with logging
const observableStep = inspectStep(openPRStep, {
  logInput: true,
  logOutput: true
});

// Validation events automatically logged to console:
// ✓ OpenPR-Input: validation passed { timestamp: ..., properties: [...] }
// ✓ OpenPR-Output: validation passed { timestamp: ..., properties: [...] }
const result = await executeStep(observableStep, data);
```

### Workflow Registry

Discovery and querying of workflow steps:

```typescript
import { createWorkflowRegistry } from "./packages/lfts-type-runtime/mod.ts";

const registry = createWorkflowRegistry();

registry.register(openPRStep, { stage: "open", permissions: ["user"] });
registry.register(reviewPRStep, { stage: "review", permissions: ["admin"] });

// Find steps by metadata
const adminSteps = registry.find(step =>
  step.metadata?.permissions?.includes("admin")
);

// Find by name
const reviewStep = registry.findByName("ReviewPR");
```

### Automatic Retry (v0.12.0)

Steps can be configured with automatic retry using exponential backoff:

```typescript
import { type WorkflowStep, type RetryConfig } from "./packages/lfts-type-runtime/mod.ts";

const apiStep: WorkflowStep<ApiRequest, ApiResponse, NetworkError> = {
  name: "CallAPI",
  inputSchema: ApiRequest$,
  outputSchema: ApiResponse$,
  execute: async (input) => {
    // Potentially flaky API call
    return await httpGet<ApiResponse>(url, ApiResponse$);
  },
  metadata: {
    retry: {
      maxAttempts: 3,
      initialDelayMs: 100,
      backoffMultiplier: 2,
      maxDelayMs: 5000,
      shouldRetry: (error, attempt) => {
        // Only retry on transient errors
        return error.type === "timeout" || error.type === "connection_refused";
      }
    }
  }
};

// Retry happens automatically during executeStep()
const result = await executeStep(apiStep, request);
```

**Retry configuration:**
- `maxAttempts` - Maximum number of retry attempts (required)
- `initialDelayMs` - Initial delay before first retry (default: 100ms)
- `backoffMultiplier` - Exponential backoff multiplier (default: 2)
- `maxDelayMs` - Maximum delay between retries (default: 10000ms)
- `shouldRetry` - Predicate to determine if error should trigger retry

Retry uses `withRetry()` from [distributed.ts](../packages/lfts-type-runtime/distributed.ts) internally.

### Parallel Execution (v0.12.0)

Execute multiple workflow steps concurrently with explicit error handling:

```typescript
import {
  executeStepsInParallel,
  type ParallelMode
} from "./packages/lfts-type-runtime/mod.ts";

// Fail-fast mode - stops on first error
const result = await executeStepsInParallel([
  { step: fetchUserStep, input: { userId: "123" } },
  { step: fetchPostsStep, input: { userId: "123" } },
  { step: fetchCommentsStep, input: { userId: "123" } }
], { mode: "fail-fast" });

if (result.mode === "fail-fast" && result.result.ok) {
  const [user, posts, comments] = result.result.value;
  console.log("All steps succeeded:", { user, posts, comments });
} else {
  console.error("At least one step failed");
}

// Settle-all mode - waits for all steps and collects successes/failures
const result2 = await executeStepsInParallel([
  { step: step1, input: data1 },
  { step: step2, input: data2 },
  { step: step3, input: data3 }
], { mode: "settle-all" });

if (result2.mode === "settle-all") {
  console.log(`${result2.successes.length} succeeded, ${result2.failures.length} failed`);
  // Process partial results
  result2.successes.forEach(value => processSuccess(value));
  result2.failures.forEach(error => logError(error));
}
```

**Parallel modes:**
- `fail-fast` - Returns immediately on first error with `Result<T[], WorkflowError | E>`
- `settle-all` - Waits for all steps, returns `{ successes: T[], failures: Array<WorkflowError | E> }`

**Type safety:** All steps in parallel execution must have the same error type.

### Code Generation

Generate documentation, diagrams, and tests from workflow definitions:

```typescript
import {
  generateWorkflowDocs,
  generateWorkflowDiagram,
  generateWorkflowTests
} from "./packages/lfts-codegen/mod.ts";

// Generate Markdown documentation
const docs = generateWorkflowDocs([openPRStep, reviewPRStep, mergePRStep], {
  title: "GitHub PR Workflow",
  includeConstraints: true
});
await Deno.writeTextFile("workflow-docs.md", docs);

// Generate Mermaid flowchart
const diagram = generateWorkflowDiagram([openPRStep, reviewPRStep, mergePRStep], {
  direction: "LR",
  includeFields: true
});
await Deno.writeTextFile("workflow-diagram.md", diagram);

// Generate test scaffolding
const tests = generateWorkflowTests([openPRStep, reviewPRStep, mergePRStep], {
  framework: "deno",
  includeValidationTests: true
});
await Deno.writeTextFile("workflow.test.ts", tests);
```

**Files:**
- Runtime implementation: [`workflow.ts`](../packages/lfts-type-runtime/workflow.ts) (~567 lines, v0.12.0)
- State machine: [`state-machine.ts`](../packages/lfts-type-runtime/state-machine.ts) (~347 lines)
- Code generators: [`workflow.ts`](../packages/lfts-codegen/workflow.ts) (~590 lines)
- Tests: [`workflow.test.ts`](../packages/lfts-type-runtime/workflow.test.ts) (22/22 passing, +7 for retry/parallel)
- Tests: [`state-machine.test.ts`](../packages/lfts-type-runtime/state-machine.test.ts) (16/16 passing)
- Tests: [`workflow.test.ts`](../packages/lfts-codegen/workflow.test.ts) (35/35 passing)

**Test Coverage:** 73/73 tests passing (100%)

**Example:** See [examples/11-workflow-orchestration](../examples/11-workflow-orchestration/) for complete PR review workflow with all patterns.

**Documentation:** See [blog-workflow-metadata.md](./blog-workflow-metadata.md) for detailed guide with real-world patterns.

---

## Core Runtime Features (v0.6.0)

### 1. Schema Introspection API (v0.6.0)

**Status:** ✅ Fully implemented

Read-only API for examining schema structure at runtime, enabling dynamic code generation, debugging tools, and runtime analysis without impacting validation performance.

**Philosophy:** "Schemas as data" - treat type schemas as first-class runtime values that can be inspected, traversed, and transformed.

**Core API:**

- `introspect(schema)` - Main entry point returning SchemaInfo discriminated union
- `getKind(schema)` - Fast kind checking without full introspection
- `getProperties(schema)` - Extract object properties
- `getVariants(schema)` - Extract discriminated union variants
- `getRefinements(schema)` - Extract refinement constraints
- `unwrapBrand(schema)` - Unwrap brand wrapper
- `unwrapReadonly(schema)` - Unwrap readonly wrapper
- `unwrapAll(schema)` - Recursively unwrap all wrappers

**Traversal API:**

- `traverse(schema, visitor)` - Generic tree walking with visitor pattern
- `hashSchema(schema)` - Stable hash for identity/caching
- `schemasEqual(schemaA, schemaB)` - Deep structural comparison

**Supported Schema Kinds:**

All 15 schema types are fully supported:
- Primitives: string, number, boolean, null, undefined
- Composites: array, tuple, object, union, dunion (discriminated union)
- Wrappers: brand, readonly, metadata
- Refinements: min, max, email, url, pattern, minLength, maxLength, etc.
- Advanced: Result, Option, Port, Effect

**Example:**

```ts
import { introspect, getProperties, traverse } from "lfts-type-runtime";

// Examine schema structure
const info = introspect(User$);
if (info.kind === "object") {
  console.log(`User has ${info.properties.length} properties`);
  info.properties.forEach(prop => {
    console.log(`  ${prop.name}: ${prop.optional ? "optional" : "required"}`);
  });
}

// Or use convenience helpers
const properties = getProperties(User$);

// Generate JSON Schema
function toJsonSchema(schema: TypeObject): object {
  const info = introspect(schema);

  switch (info.kind) {
    case "object":
      return {
        type: "object",
        properties: Object.fromEntries(
          info.properties.map(p => [p.name, toJsonSchema(p.type)])
        ),
        required: info.properties
          .filter(p => !p.optional)
          .map(p => p.name),
      };
    case "array":
      return {
        type: "array",
        items: toJsonSchema(info.element),
      };
    // ... handle other cases
  }
}
```

**Use Cases:**

1. **JSON Schema Generation** - OpenAPI documentation
2. **TypeScript Type Generation** - Codegen from runtime schemas
3. **Form Configuration** - UI framework schema generation
4. **Mock Data Generation** - Test fixture creation
5. **Schema Documentation** - Human-readable docs
6. **Schema Diffing** - Track schema evolution
7. **Schema Validation** - Meta-schema validation
8. **Code Analysis** - Static analysis tools

**Performance:**

- **Zero validation impact**: Introspection is separate from validation hot path
- **Opt-in**: Tree-shakeable, only imported when needed
- **Bundle size**: +5-10KB when imported
- **Speed**: `introspect()` < 0.1% of validation cost, `getKind()` < 0.01%

**Testing:**

- 51 comprehensive tests in `packages/lfts-type-runtime/introspection_test.ts`
- Tests cover all schema kinds, edge cases, and complex nested schemas
- 100% passing test suite

**Documentation:** See [INTROSPECTION_API.md](INTROSPECTION_API.md) for comprehensive guide with examples and use cases.

---

### 2. Result/Option Combinators (v0.3.0)

**Status:** ✅ Fully implemented

Functional error handling without exceptions, using Result and Option types with
full combinator APIs.

**Result API:**

- `Result.ok(value)` - Create successful Result
- `Result.err(error)` - Create failed Result
- `Result.map(result, fn)` - Transform success value
- `Result.andThen(result, fn)` - Chain Result-returning functions
- `Result.mapErr(result, fn)` - Transform error value
- `Result.ensure(predicate, error)` - Validate with predicate
- `Result.unwrapOr(result, defaultValue)` - Get value or default
- `Result.isOk()`, `Result.isErr()` - Type guards

**Option API:**

- `Option.some(value)` - Create Option with value
- `Option.none()` - Create empty Option
- `Option.from(nullable)` - Convert nullable to Option
- `Option.first(array)` - Safely get first element
- `Option.map(option, fn)` - Transform Some value
- `Option.andThen(option, fn)` - Chain Option-returning functions
- `Option.okOr(option, error)` - Convert to Result
- `Option.unwrapOr(option, defaultValue)` - Get value or default
- `Option.isSome()`, `Option.isNone()` - Type guards
- `Option.zip(...options)` - Combine multiple Options

**Example:**

```ts
import { Option, Result } from "./packages/lfts-type-runtime/mod.ts";

// Result combinators
const result = Result.andThen(
  parseUser(data),
  (user) => validateEmail(user),
);

// Option combinators
const firstItem = Option.map(
  Option.first(items),
  (item) => item.name,
);
```

**Testing:** 40 comprehensive tests in
`packages/lfts-type-runtime/combinators.test.ts`

---

### 3. Runtime Introspection Hooks (v0.4.0)

**Status:** ✅ Fully implemented

Observability hooks for validation events without mutating data, providing
schema metadata and success/failure callbacks.

**APIs:**

- `withMetadata(schema, metadata)` - Attach schema name/source plus arbitrary workflow metadata
- `getMetadata(schema)` - Retrieve typed metadata (e.g., `{ stage: "review" }`)
- `collectMetadata(schemas, predicate?)` - Build registries/filters based on metadata
- `inspect(schema, configure)` - Wrap schema with observability hooks

**InspectionContext:**

- `onSuccess(callback)` - Hook triggered on successful validation
- `onFailure(callback)` - Hook triggered on validation errors
- `schemaName` - Access to schema metadata
- `schemaSource` - Access to source file location

**Example:**

```ts
import { inspect, withMetadata } from "./packages/lfts-type-runtime/mod.ts";

// Attach metadata to schema
const OrderSchema = withMetadata(orderBytecode, {
  name: "Order",
  source: "src/types/order.schema.ts",
});

// Create inspectable wrapper with hooks
const InspectedOrderSchema = inspect<Order>(OrderSchema, (ctx) => {
  ctx.onFailure((error) => {
    logger.warn("Order validation failed", {
      schema: ctx.schemaName,
      source: ctx.schemaSource,
      error,
    });
  });

  ctx.onSuccess((value) => {
    metrics.recordValidation(ctx.schemaName, "success");
  });
});

// Use the inspectable schema
const result = InspectedOrderSchema.validate(payload);
// Hooks fire automatically based on validation outcome
```

> Tip: `SchemaMetadata` accepts arbitrary typed keys, so you can tag schemas
> with workflow stages, permissions, or descriptions and later retrieve them
> via `getMetadata()` / `collectMetadata()` when building registries.

**Features:**

- Zero runtime cost when not used (opt-in wrapper pattern)
- Multiple hooks can be registered per event
- Hook errors are caught and logged to prevent breaking validation
- Works with all validation methods: `validate()`, `validateUnsafe()`,
  `validateAll()`
- Metadata transparently passes through validation (and is queryable)
- Added `Op.METADATA` bytecode opcode for schema metadata

**Testing:**

- 9 comprehensive tests in `packages/lfts-type-runtime/introspection.test.ts`
- Example usage in `packages/lfts-type-runtime/introspection-example.ts`

---

### 4. Effect Handling with AsyncResult (v0.5.0)

**Status:** ✅ Fully implemented (Phases 1-3)

Direct-style effect handling for `Promise<Result<T, E>>` operations using AsyncResult helpers, port validation, and compiler warnings.

**Philosophy:** "Effects are just async functions that can fail" - uses standard async/await with Result types, no monads needed.

**AsyncResult API:**

- `AsyncResult.try(fn, onError)` - Wrap async operations that may throw
- `AsyncResult.andThen(promise, fn)` - Chain async Result operations
- `AsyncResult.map(promise, fn)` - Transform success values
- `AsyncResult.mapErr(promise, fn)` - Transform error values
- `AsyncResult.all(promises)` - Parallel execution with fail-fast
- `AsyncResult.allSettled(promises)` - Parallel execution, collect all results
- `AsyncResult.race(promises)` - Race multiple async operations

**Example:**

```ts
import { AsyncResult, Result } from "./packages/lfts-type-runtime/mod.ts";

// Wrap exception-throwing async code
const result = await AsyncResult.try(
  async () => await fetch(url).then(r => r.json()),
  (err) => `Network error: ${err}`
);

// Chain async operations
const userWithPosts = await AsyncResult.andThen(
  loadUser(userId),
  (user) => loadPosts(user.id)
);

// Parallel loading
const dashboard = await AsyncResult.all([
  loadUser(userId),
  loadPosts(userId),
  loadComments(userId),
]);
```

**Port Validation (Optional):**

Runtime validation of port/capability implementations for dependency injection and plugin systems.

- `validatePort<T>(portSchema, impl)` - Validate implementation matches port contract
- `getPortName(portSchema)` - Extract port name from schema
- `getPortMethods(portSchema)` - Extract method names from schema
- Added `Op.PORT`, `Op.PORT_METHOD`, `Op.EFFECT` bytecode opcodes
- Port schemas via `enc.port(name, methods)`

**Example:**

```ts
import { validatePort } from "./packages/lfts-type-runtime/mod.ts";
import { enc } from "./packages/lfts-type-spec/src/mod.ts";

// Define port schema
const StoragePort$ = enc.port("StoragePort", [
  { name: "load", params: [enc.str()], returnType: enc.obj([]) },
  { name: "save", params: [enc.str(), enc.obj([])], returnType: enc.obj([]) },
]);

// Validate implementation
const validation = validatePort<StoragePort>(StoragePort$, memoryStorage);
if (validation.ok) {
  const storage = validation.value; // Type-safe!
}
```

**Compiler Warnings (LFP1030):**

The compiler provides helpful warnings when it detects manual Promise<Result> handling that could be simplified:

- Warns on try/catch with Result.err → Suggests `AsyncResult.try()`
- Warns on manual .then() chaining → Suggests `AsyncResult.andThen()`/`map()`
- Warns on Promise<Result> functions with manual handling

**Testing:**

- 26 AsyncResult tests in `packages/lfts-type-runtime/async-result.test.ts`
- 28 port validation tests in `packages/lfts-type-runtime/port-validation.test.ts`
- Compiler warning test: `warn_suggest_async_result` golden test
- Example usage:
  - `packages/lfts-type-runtime/async-result-example.ts` (10 examples)
  - `packages/lfts-type-runtime/port-validation-example.ts` (8 examples)

**Documentation:** See [EFFECTS_GUIDE.md](EFFECTS_GUIDE.md) for comprehensive guide with patterns and best practices.

---

### 5. Pipeline Composition Shim (v0.4.0, extracted in v0.9.0)

**Status:** ✅ Fully implemented (optional/advanced module)

Pipeline helpers live in `packages/lfts-type-runtime/pipeline.ts` and are **not
re-exported** by `mod.ts`. Always import from the subpath:

```ts
import { pipe, asPipe, PipelineExecutionError } from "./packages/lfts-type-runtime/pipeline.ts";
```

- `pipe(initial)` - Begin a deferred pipeline around a value or `Result`
- `asPipe(fn, options?)` - Lift a pure function or method set into a pipeable stage
- `PipelineExecutionError` - Thrown by `run()` when a stage yields `Result.err`
- `token.run()` / `token.runResult()` - Evaluate pipelines in value or Result mode
- `token.inspect()` - Retrieve per-stage diagnostics (label, status, duration)

**Features:**

- Short-circuits on the first error, matching the future bytecode executor design
- Supports nested pipelines and async stages without shared mutable state
- Automatic mode switching: pure value pipelines adopt Result semantics when encountering stages marked `{ expect: "result" }`
- Stage metadata recorded for future observability integrations
- Compiler policy (`LFP1030`) reserves bitwise `|` for pipeline usage while rejecting other bitwise expressions

**Example:**

```ts
import { asPipe, pipe, PipelineExecutionError } from "./packages/lfts-type-runtime/pipeline.ts";
import { Result } from "./packages/lfts-type-runtime/mod.ts";

const ensureUser = asPipe(
  (input: unknown) =>
    typeof input === "string"
      ? Result.ok(input.trim())
      : Result.err("expected string"),
  { expect: "result", label: "ensureUser" },
);
const shout = asPipe((value: string) => value.toUpperCase());

const userPipeline = pipe("  ada ");
// @ts-expect-error: pipeline shim relies on `|`
userPipeline | ensureUser | shout;

console.log(await userPipeline.run()); // "ADA"
```

**Testing:** 6 focused tests in `packages/lfts-type-runtime/pipeline.test.ts`

### 6. Workflow Graph Builder (v0.11.1, experimental)

**Status:** 🚧 Experimental (opt-in helper at `packages/lfts-type-runtime/workflow-graph.ts`)

Workflow-heavy apps can describe DAGs declaratively. Each stage references an existing `WorkflowStep`, lists dependencies, and optionally supplies a `resolve()` hook to map upstream outputs into the next step's typed input. The runtime performs topological sorting, executes independent branches concurrently, and emits snapshots for observability.

```ts
import { fromStage, fromStages, graphBuilder } from "./packages/lfts-type-runtime/workflow-graph.ts";
import type { WorkflowStep } from "./packages/lfts-type-runtime/workflow.ts";

const workflow = graphBuilder<{ tenantId: string }>()
  .seed({ tenantId: "t_123" })
  .stage({ name: "fetchTenant", step: fetchTenantStep })
  .stage({
    name: "loadBilling",
    step: loadBillingStep,
    dependsOn: ["fetchTenant"],
    resolve: fromStage("fetchTenant", (tenant) => ({ tenantId: tenant.tenantId })),
  })
  .stage({ name: "loadUsers", step: loadUsersStep, dependsOn: ["fetchTenant"] })
  .stage({
    name: "hydrateDashboard",
    step: hydrateDashboardStep,
    dependsOn: ["loadBilling", "loadUsers"],
    resolve: fromStages(["loadBilling", "loadUsers"], ({ loadBilling, loadUsers }) => ({
      billing: loadBilling,
      users: loadUsers,
    })),
  })
  .build();

const outcome = await workflow.run();
if (outcome.ok) {
  console.log(outcome.value.outputs.hydrateDashboard);
}
```

- Seeds accept values, promises, or `Result`
- `run()` returns `Result<{ seed, outputs, snapshots }, WorkflowGraphRunFailure>`
- `maxConcurrency` + mode (`"fail-fast" | "continue"`) options for runtime tuning
- Snapshots capture stage timing/status; unresolved nodes are tagged as `blocked`
- `fromStage()` / `fromStages()` helpers eliminate common dependency-mapping boilerplate

**Testing:** 5 integration tests in `packages/lfts-type-runtime/workflow-graph.test.ts`

---

### 7. Prebuilt Type Annotations (v0.4.0)

**Status:** ✅ Fully implemented

Clean nominal typing and runtime refinements using imported type annotations
that compile to validation bytecode.

**Available Annotations:**

**Nominal typing (compile-time only):**

```ts
import type { Nominal } from "./packages/lfts-type-runtime/mod.ts";
type UserId = string & Nominal;
```

**String refinements:**

```ts
import type { Email, MaxLength, MinLength, Pattern, Url } from "./packages/lfts-type-runtime/mod.ts";

type UserEmail = string & Email;
type WebsiteUrl = string & Url;
type ZipCode = string & Pattern<"^\\d{5}$">;
type Username = string & MinLength<3> & MaxLength<20>;
```

**Numeric refinements:**

```ts
import type { Integer, Max, Min, Range } from "./packages/lfts-type-runtime/mod.ts";

type Age = number & Min<0> & Max<120>;
type Score = number & Range<0, 100>;
type Count = number & Integer & Min<0>;
```

**Array refinements:**

```ts
import type { MaxItems, MinItems } from "./packages/lfts-type-runtime/mod.ts";

type NonEmptyArray<T> = T[] & MinItems<1>;
type ShortList<T> = T[] & MaxItems<10>;
```

**Composable refinements:**

```ts
type SafeEmail = string & MinLength<5> & MaxLength<100> & Email;
type PositiveInteger = number & Integer & Min<1>;
```

**Features:**

- Replaces verbose `{ readonly __brand: "Tag" }` pattern
- Runtime validation for refinements (Email, Url, Min, Max, etc.)
- Compile-time branding with Nominal (zero runtime cost)
- Composable via intersection types
- Clean, discoverable syntax
- Full type safety with TypeScript inference

**Bytecode opcodes:**

- `Op.REFINE_EMAIL`, `Op.REFINE_URL`, `Op.REFINE_PATTERN`
- `Op.REFINE_MIN`, `Op.REFINE_MAX`, `Op.REFINE_INTEGER`
- `Op.REFINE_MIN_LENGTH`, `Op.REFINE_MAX_LENGTH`
- `Op.REFINE_MIN_ITEMS`, `Op.REFINE_MAX_ITEMS`

**Related:** Addresses VALIDATOR_GAPS.md "No refinements" limitation

---

### 8. Error Aggregation (v0.4.0)

**Status:** ✅ Fully implemented

Collect multiple validation errors instead of failing fast, providing better UX
for form validation and debugging.

**API:**

```ts
validateAll(schema, value, maxErrors?)
```

**Example:**

```ts
import { validateAll } from "./packages/lfts-type-runtime/mod.ts";

// Collect all errors (default max: 100)
const result = validateAll(User$, data);

if (!result.ok) {
  console.log(`Found ${result.errors.length} validation errors:`);
  result.errors.forEach((err) => {
    console.log(`  ${err.path}: ${err.message}`);
  });
}

// Output:
// Found 3 validation errors:
//   email: expected valid email format
//   age: expected >= 0, got -5
//   address.zip: required property missing
```

**Features:**

- Configurable error limit prevents runaway validation
- Returns `ValidationResult<T>` with error array
- Suitable for form validation and debugging
- Better UX - see all issues in one pass

**Related:** Addresses VALIDATOR_GAPS.md #1 "First-failure only"

---

## Performance Optimizations

### 9. DUNION Tag Caching (v0.2.0)

**Status:** ✅ Fully implemented

**Performance gain:** 40x-1,600x speedup for ADT validation

WeakMap-based O(1) discriminant tag lookup for discriminated unions, enabling
high-performance ADT validation.

**Features:**

- Automatic for all discriminated unions
- Example: 20-variant ADT validates at 15.9M ops/sec vs 10K ops/sec with UNION
- Zero configuration required
- Uses `Op.DUNION` bytecode opcode

---

### 10. Lazy Path Construction (v0.2.0)

**Status:** ✅ Fully implemented

**Performance gain:** 5-15% overall speedup

Build error paths only when validation fails, eliminating overhead on the
success path (80%+ of validations).

---

### 11. Union Result-Based Validation (v0.3.0)

**Status:** ✅ Fully implemented

**Performance gain:** 2-5x speedup

Eliminates exception-based backtracking in union validation by using explicit
error returns instead of try/catch.

**Example:** 5-variant union validates at 50,990 ops/sec

---

### 12. Excess-Property Policy (v0.3.0)

**Status:** ✅ Fully implemented

Optional strict mode to reject unknown object properties.

**Usage:**

```ts
import { enc } from "./packages/lfts-type-spec/src/mod.ts";

// Strict mode: reject excess properties
const schema = enc.obj([
  { name: "id", type: enc.str() },
  { name: "name", type: enc.str() },
], true); // strict = true
```

**Features:**

- Minimal overhead (<5%) when enabled
- Optional and disabled by default
- Useful for API validation

---

## Compiler Features

### 13. LFP1020 Policy Rule (v0.3.0)

**Status:** ✅ Fully implemented

Detects and warns about imperative branching patterns (if/else, switch) in
domain logic, encouraging functional composition.

**Example warning:**

```
LFP1020: Imperative branching detected. Consider using match() for ADTs
```

---

## Performance Characteristics

Current runtime validation performance:

- **ADT validation**: 8-16M ops/sec (DUNION with caching)
- **Union validation**: 50-200K ops/sec (Result-based, no exceptions)
- **Deep validation**: Optimized path construction
- **Batch validation**: Suitable for high-throughput APIs

See [BYTECODE_REFERENCE.md](BYTECODE_REFERENCE.md) for detailed performance
analysis.

---

## Version History

### v0.6.0 (Current)

- ✅ Schema Introspection API with full traversal and identity functions
- ✅ Complete support for all 15 schema kinds (primitives, composites, wrappers, refinements, Result/Option, ports, effects)
- ✅ 51 comprehensive tests covering all introspection features
- ✅ Documentation with 5+ use cases and complete examples

### v0.5.0

- ✅ Effect handling with AsyncResult combinators
- ✅ Port validation for dependency injection
- ✅ Compiler warnings for async Result patterns (LFP1030)

### v0.4.0

- ✅ Runtime Introspection Hooks
- ✅ Prebuilt Type Annotations (Nominal, Email, Url, Min, Max, refinements)
- ✅ Error Aggregation (validateAll)

### v0.3.0

- ✅ Result/Option combinators with full API
- ✅ LFP1020 policy rule for imperative branching detection
- ✅ Union result-based validation
- ✅ Excess-property checking

### v0.2.0

- ✅ DUNION tag caching for ADT validation
- ✅ Lazy path construction optimization
- ✅ Zero-exposure schema roots

### v0.1.0

- ✅ Core compiler with Gate/Policy/Transform passes
- ✅ Bytecode-based runtime validator
- ✅ Light-FP subset enforcement
- ✅ Ports discipline
- ✅ ADT validation with match()

---

## See Also

- [INTROSPECTION_API.md](INTROSPECTION_API.md) - Schema introspection API reference
- [EFFECTS_GUIDE.md](EFFECTS_GUIDE.md) - Effect handling patterns and best practices
- [FUTURE_DIRECTION.md](FUTURE_DIRECTION.md) - Planned features and roadmap
- [BYTECODE_REFERENCE.md](BYTECODE_REFERENCE.md) - Bytecode format and opcodes
- [VALIDATOR_GAPS.md](VALIDATOR_GAPS.md) - Known limitations
- [LANG-SPEC.md](LANG-SPEC.md) - Light-FP language specification
