// packages/lfts-type-runtime/port-validation.test.ts
import { assertEquals } from "jsr:@std/assert";
import { enc } from "../lfts-type-spec/src/mod.ts";
import {
  getPortMethods,
  getPortName,
  Result,
  validatePort,
} from "./mod.ts";

// ============================================================================
// Port Schema Definitions (using enc.port helper)
// ============================================================================

// Simple port with no parameters
const LoggerPort$ = enc.port("LoggerPort", [
  { name: "log", params: [enc.str()], returnType: enc.und() },
  { name: "error", params: [enc.str()], returnType: enc.und() },
]);

// Port with multiple parameters
const StoragePort$ = enc.port("StoragePort", [
  { name: "load", params: [enc.str()], returnType: enc.obj([]) },
  {
    name: "save",
    params: [enc.str(), enc.obj([])],
    returnType: enc.bool(),
  },
]);

// Port with async methods (return type doesn't matter for structural validation)
const DatabasePort$ = enc.port("DatabasePort", [
  { name: "query", params: [enc.str()], returnType: enc.obj([]) },
  {
    name: "execute",
    params: [enc.str(), enc.arr(enc.obj([]))],
    returnType: enc.obj([]),
  },
]);

// Port with no methods (edge case)
const EmptyPort$ = enc.port("EmptyPort", []);

// ============================================================================
// Valid Implementations
// ============================================================================

Deno.test("validatePort - valid logger implementation", () => {
  const loggerImpl = {
    log: (msg: string) => console.log(msg),
    error: (msg: string) => console.error(msg),
  };

  const result = validatePort(LoggerPort$, loggerImpl);

  assertEquals(result.ok, true);
  if (result.ok) {
    assertEquals(result.value, loggerImpl);
  }
});

Deno.test("validatePort - valid storage implementation", () => {
  const storageImpl = {
    load: (key: string) => ({ data: `value for ${key}` }),
    save: (key: string, data: any) => true,
  };

  const result = validatePort(StoragePort$, storageImpl);

  assertEquals(result.ok, true);
  if (result.ok) {
    assertEquals(result.value, storageImpl);
  }
});

Deno.test("validatePort - valid async implementation", () => {
  const dbImpl = {
    query: async (sql: string) => ({ rows: [] }),
    execute: async (sql: string, params: any[]) => ({ affected: 0 }),
  };

  const result = validatePort(DatabasePort$, dbImpl);

  assertEquals(result.ok, true);
});

Deno.test("validatePort - empty port implementation", () => {
  const emptyImpl = {};

  const result = validatePort(EmptyPort$, emptyImpl);

  assertEquals(result.ok, true);
});

// ============================================================================
// Error Cases - Not an Object
// ============================================================================

Deno.test("validatePort - reject null", () => {
  const result = validatePort(LoggerPort$, null);

  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.error.type, "not_object");
    assertEquals(result.error.message, "Expected object, got object");
  }
});

Deno.test("validatePort - reject undefined", () => {
  const result = validatePort(LoggerPort$, undefined);

  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.error.type, "not_object");
    assertEquals(result.error.message, "Expected object, got undefined");
  }
});

Deno.test("validatePort - reject primitive", () => {
  const result = validatePort(LoggerPort$, "not an object");

  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.error.type, "not_object");
    assertEquals(result.error.message, "Expected object, got string");
  }
});

Deno.test("validatePort - reject number", () => {
  const result = validatePort(LoggerPort$, 42);

  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.error.type, "not_object");
  }
});

// ============================================================================
// Error Cases - Missing Methods
// ============================================================================

Deno.test("validatePort - reject missing method", () => {
  const incompleteLogger = {
    log: (msg: string) => console.log(msg),
    // missing 'error' method
  };

  const result = validatePort(LoggerPort$, incompleteLogger);

  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.error.type, "missing_method");
    if (result.error.type === "missing_method") {
      assertEquals(result.error.methodName, "error");
      assertEquals(
        result.error.message,
        "Port LoggerPort requires method 'error', but it is missing",
      );
    }
  }
});

Deno.test("validatePort - reject completely empty object", () => {
  const emptyObj = {};

  const result = validatePort(LoggerPort$, emptyObj);

  assertEquals(result.ok, false);
  if (!result.ok && result.error.type === "missing_method") {
    assertEquals(result.error.methodName, "log");
  }
});

// ============================================================================
// Error Cases - Wrong Type (Not a Function)
// ============================================================================

Deno.test("validatePort - reject non-function method (string)", () => {
  const badLogger = {
    log: "not a function",
    error: (msg: string) => console.error(msg),
  };

  const result = validatePort(LoggerPort$, badLogger);

  assertEquals(result.ok, false);
  if (!result.ok && result.error.type === "wrong_type") {
    assertEquals(result.error.methodName, "log");
    assertEquals(
      result.error.message,
      "Port LoggerPort method 'log' must be a function, got string",
    );
  }
});

Deno.test("validatePort - reject non-function method (number)", () => {
  const badLogger = {
    log: (msg: string) => console.log(msg),
    error: 42,
  };

  const result = validatePort(LoggerPort$, badLogger);

  assertEquals(result.ok, false);
  if (!result.ok && result.error.type === "wrong_type") {
    assertEquals(result.error.methodName, "error");
    assertEquals(
      result.error.message,
      "Port LoggerPort method 'error' must be a function, got number",
    );
  }
});

Deno.test("validatePort - reject non-function method (object)", () => {
  const badLogger = {
    log: (msg: string) => console.log(msg),
    error: { foo: "bar" },
  };

  const result = validatePort(LoggerPort$, badLogger);

  assertEquals(result.ok, false);
  if (!result.ok && result.error.type === "wrong_type") {
    assertEquals(result.error.methodName, "error");
  }
});

// ============================================================================
// Error Cases - Wrong Arity
// ============================================================================

Deno.test("validatePort - reject wrong arity (too few parameters)", () => {
  const badStorage = {
    load: (key: string) => ({ data: key }),
    save: (key: string) => true, // Missing 'data' parameter
  };

  const result = validatePort(StoragePort$, badStorage);

  assertEquals(result.ok, false);
  if (!result.ok && result.error.type === "wrong_arity") {
    assertEquals(result.error.methodName, "save");
    assertEquals(result.error.expected, 2);
    assertEquals(result.error.actual, 1);
    assertEquals(
      result.error.message,
      "Port StoragePort method 'save' expects 2 parameter(s), but implementation has 1",
    );
  }
});

Deno.test("validatePort - reject wrong arity (too many parameters)", () => {
  const badStorage = {
    load: (key: string, extra: string) => ({ data: key }), // Extra parameter
    save: (key: string, data: any) => true,
  };

  const result = validatePort(StoragePort$, badStorage);

  assertEquals(result.ok, false);
  if (!result.ok && result.error.type === "wrong_arity") {
    assertEquals(result.error.methodName, "load");
    assertEquals(result.error.expected, 1);
    assertEquals(result.error.actual, 2);
  }
});

Deno.test("validatePort - reject no-arg function when args expected", () => {
  const badLogger = {
    log: () => console.log("no args"), // Should take 1 parameter
    error: (msg: string) => console.error(msg),
  };

  const result = validatePort(LoggerPort$, badLogger);

  assertEquals(result.ok, false);
  if (!result.ok && result.error.type === "wrong_arity") {
    assertEquals(result.error.methodName, "log");
    assertEquals(result.error.expected, 1);
    assertEquals(result.error.actual, 0);
  }
});

// ============================================================================
// Helper Functions - getPortName
// ============================================================================

Deno.test("getPortName - extract port name", () => {
  const name = getPortName(LoggerPort$);
  assertEquals(name, "LoggerPort");
});

Deno.test("getPortName - extract from storage port", () => {
  const name = getPortName(StoragePort$);
  assertEquals(name, "StoragePort");
});

Deno.test("getPortName - return undefined for non-port schema", () => {
  const notAPort = enc.obj([]);
  const name = getPortName(notAPort);
  assertEquals(name, undefined);
});

Deno.test("getPortName - return undefined for invalid bytecode", () => {
  const name = getPortName("not bytecode" as any);
  assertEquals(name, undefined);
});

// ============================================================================
// Helper Functions - getPortMethods
// ============================================================================

Deno.test("getPortMethods - extract method names", () => {
  const methods = getPortMethods(LoggerPort$);
  assertEquals(methods, ["log", "error"]);
});

Deno.test("getPortMethods - extract from storage port", () => {
  const methods = getPortMethods(StoragePort$);
  assertEquals(methods, ["load", "save"]);
});

Deno.test("getPortMethods - extract from database port", () => {
  const methods = getPortMethods(DatabasePort$);
  assertEquals(methods, ["query", "execute"]);
});

Deno.test("getPortMethods - empty array for empty port", () => {
  const methods = getPortMethods(EmptyPort$);
  assertEquals(methods, []);
});

Deno.test("getPortMethods - empty array for non-port schema", () => {
  const notAPort = enc.obj([]);
  const methods = getPortMethods(notAPort);
  assertEquals(methods, []);
});

// ============================================================================
// Integration Tests
// ============================================================================

Deno.test("integration - validate and use port implementation", () => {
  type Logger = {
    log(msg: string): void;
    error(msg: string): void;
  };

  const loggerImpl = {
    log: (msg: string) => console.log(`[LOG] ${msg}`),
    error: (msg: string) => console.error(`[ERROR] ${msg}`),
  };

  const result = validatePort<Logger>(LoggerPort$, loggerImpl);

  assertEquals(result.ok, true);
  if (result.ok) {
    // Use the validated implementation with type safety
    const logger = result.value;
    logger.log("test"); // Should not throw
    logger.error("test"); // Should not throw
  }
});

Deno.test("integration - dependency injection with validation", () => {
  // Simulate a DI container that validates port implementations
  function createApp(storage: any) {
    const validationResult = validatePort(StoragePort$, storage);

    if (!validationResult.ok) {
      throw new Error(
        `Invalid storage implementation: ${validationResult.error.message}`,
      );
    }

    return {
      storage: validationResult.value,
      run: () => "app running",
    };
  }

  // Valid implementation
  const goodStorage = {
    load: (key: string) => ({ data: key }),
    save: (key: string, data: any) => true,
  };

  const app1 = createApp(goodStorage);
  assertEquals(app1.run(), "app running");

  // Invalid implementation
  const badStorage = {
    load: (key: string) => ({ data: key }),
    // missing 'save'
  };

  let errorCaught = false;
  try {
    createApp(badStorage);
  } catch (err) {
    errorCaught = true;
    assertEquals(
      (err as Error).message.includes("missing"),
      true,
    );
  }
  assertEquals(errorCaught, true);
});

Deno.test("integration - with AsyncResult for port validation", async () => {
  const { AsyncResult } = await import("./mod.ts");

  // Validate port and return AsyncResult
  async function loadPort<T>(
    schema: any,
    impl: unknown,
  ): Promise<Result<T, string>> {
    return AsyncResult.try(
      async () => {
        const result = validatePort<T>(schema, impl);
        if (!result.ok) {
          throw new Error(result.error.message);
        }
        return result.value;
      },
      (err) => `Port validation failed: ${(err as Error).message}`,
    );
  }

  const goodLogger = {
    log: (msg: string) => {},
    error: (msg: string) => {},
  };

  const result = await loadPort(LoggerPort$, goodLogger);
  assertEquals(result.ok, true);
});
