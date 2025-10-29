// packages/lfts-type-runtime/introspection.test.ts
// Tests for Phase 1.2: Runtime Introspection Hooks

import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { enc, Op } from "../lfts-type-spec/src/mod.ts";
import { inspect, withMetadata, type ValidationError } from "./mod.ts";

Deno.test("introspection: basic success hook", () => {
  const schema = enc.obj([
    { name: "name", type: enc.str() },
    { name: "age", type: enc.num() },
  ]);

  let successCalled = false;
  let capturedValue: any = null;

  const inspectable = inspect(schema, (ctx) => {
    ctx.onSuccess((value) => {
      successCalled = true;
      capturedValue = value;
    });
  });

  const result = inspectable.validate({ name: "Alice", age: 30 });

  assertEquals(result.ok, true);
  assertEquals(successCalled, true);
  assertEquals(capturedValue, { name: "Alice", age: 30 });
});

Deno.test("introspection: basic failure hook", () => {
  const schema = enc.obj([
    { name: "name", type: enc.str() },
    { name: "age", type: enc.num() },
  ]);

  let failureCalled = false;
  let capturedError: ValidationError | null = null;

  const inspectable = inspect(schema, (ctx) => {
    ctx.onFailure((error) => {
      failureCalled = true;
      capturedError = error;
    });
  });

  const result = inspectable.validate({ name: "Alice", age: "invalid" });

  assertEquals(result.ok, false);
  assertEquals(failureCalled, true);
  assertEquals(capturedError !== null, true);
  assertEquals(capturedError!.path, "age");
});

Deno.test("introspection: metadata extraction", () => {
  const schema = enc.obj([
    { name: "id", type: enc.str() },
  ]);

  const schemaWithMetadata = withMetadata(schema, {
    name: "User",
    source: "src/types/user.schema.ts",
  });

  let contextSchemaName: string | undefined;
  let contextSchemaSource: string | undefined;

  const inspectable = inspect(schemaWithMetadata, (ctx) => {
    contextSchemaName = ctx.schemaName;
    contextSchemaSource = ctx.schemaSource;
  });

  assertEquals(inspectable.metadata.name, "User");
  assertEquals(inspectable.metadata.source, "src/types/user.schema.ts");
  assertEquals(contextSchemaName, "User");
  assertEquals(contextSchemaSource, "src/types/user.schema.ts");
});

Deno.test("introspection: metadata validation is transparent", () => {
  const schema = enc.obj([
    { name: "value", type: enc.num() },
  ]);

  const schemaWithMetadata = withMetadata(schema, {
    name: "TestSchema",
  });

  const inspectable = inspect(schemaWithMetadata);

  // Should validate successfully despite METADATA wrapper
  const result1 = inspectable.validate({ value: 42 });
  assertEquals(result1.ok, true);
  if (result1.ok) {
    assertEquals(result1.value, { value: 42 });
  }

  // Should fail validation correctly
  const result2 = inspectable.validate({ value: "invalid" });
  assertEquals(result2.ok, false);
});

Deno.test("introspection: multiple hooks can be registered", () => {
  const schema = enc.str();

  const successCalls: string[] = [];
  const failureCalls: ValidationError[] = [];

  const inspectable = inspect(schema, (ctx) => {
    ctx.onSuccess((value) => successCalls.push(value as string));
    ctx.onSuccess((value) => successCalls.push(`${value}-copy` as string));
    ctx.onFailure((error) => failureCalls.push(error));
    ctx.onFailure((error) => failureCalls.push(error));
  });

  // Test success path
  inspectable.validate("hello");
  assertEquals(successCalls.length, 2);
  assertEquals(successCalls[0], "hello");
  assertEquals(successCalls[1], "hello-copy");

  // Test failure path
  inspectable.validate(123);
  assertEquals(failureCalls.length, 2);
});

Deno.test("introspection: validateUnsafe triggers hooks", () => {
  const schema = enc.num();

  let successCalled = false;
  let failureCalled = false;

  const inspectable = inspect(schema, (ctx) => {
    ctx.onSuccess(() => { successCalled = true; });
    ctx.onFailure(() => { failureCalled = true; });
  });

  // Success case
  inspectable.validateUnsafe(42);
  assertEquals(successCalled, true);

  // Failure case
  try {
    inspectable.validateUnsafe("invalid");
  } catch {
    // Expected to throw
  }
  assertEquals(failureCalled, true);
});

Deno.test("introspection: validateAll triggers hooks", () => {
  const schema = enc.obj([
    { name: "a", type: enc.num() },
    { name: "b", type: enc.num() },
  ]);

  let successCalled = false;
  let failureCalled = false;

  const inspectable = inspect(schema, (ctx) => {
    ctx.onSuccess(() => { successCalled = true; });
    ctx.onFailure(() => { failureCalled = true; });
  });

  // Success case
  const result1 = inspectable.validateAll({ a: 1, b: 2 });
  assertEquals(result1.ok, true);
  assertEquals(successCalled, true);

  // Failure case (multiple errors)
  const result2 = inspectable.validateAll({ a: "invalid", b: "invalid" });
  assertEquals(result2.ok, false);
  assertEquals(failureCalled, true);
});

Deno.test("introspection: hooks don't break validation on error", () => {
  const schema = enc.str();

  const inspectable = inspect(schema, (ctx) => {
    ctx.onSuccess(() => {
      throw new Error("Hook error!");
    });
  });

  // Should not throw, hook error should be swallowed
  const result = inspectable.validate("test");
  assertEquals(result.ok, true);
});

Deno.test("introspection: practical debugging example", () => {
  type Order = {
    id: string;
    total: number;
  };

  const OrderSchema = enc.obj([
    { name: "id", type: enc.str() },
    { name: "total", type: enc.num() },
  ]);

  const OrderSchemaWithMetadata = withMetadata(OrderSchema, {
    name: "Order",
    source: "src/types/order.schema.ts",
  });

  const debugLog: Array<{ event: string; details: any }> = [];

  const InspectedOrderSchema = inspect<Order>(
    OrderSchemaWithMetadata,
    (ctx) => {
      ctx.onFailure((error) => {
        debugLog.push({
          event: "validation_failed",
          details: {
            schema: ctx.schemaName,
            source: ctx.schemaSource,
            error,
          },
        });
      });

      ctx.onSuccess((value) => {
        debugLog.push({
          event: "validation_success",
          details: {
            schema: ctx.schemaName,
            orderId: value.id,
          },
        });
      });
    },
  );

  // Successful validation
  InspectedOrderSchema.validate({ id: "ord-123", total: 99.99 });
  assertEquals(debugLog.length, 1);
  assertEquals(debugLog[0].event, "validation_success");
  assertEquals(debugLog[0].details.schema, "Order");
  assertEquals(debugLog[0].details.orderId, "ord-123");

  // Failed validation
  InspectedOrderSchema.validate({ id: "ord-456", total: "invalid" });
  assertEquals(debugLog.length, 2);
  assertEquals(debugLog[1].event, "validation_failed");
  assertEquals(debugLog[1].details.schema, "Order");
  assertEquals(debugLog[1].details.source, "src/types/order.schema.ts");
  assertEquals(debugLog[1].details.error.path, "total");
});
