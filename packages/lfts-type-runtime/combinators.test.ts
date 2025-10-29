// packages/lfts-type-runtime/combinators.test.ts
// Comprehensive tests for Result/Option combinators (Phase 1.1)

import {
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import { Option, Result } from "./mod.ts";

// =============================================================================
// Result Combinator Tests
// =============================================================================

Deno.test("Result.ok creates successful Result", () => {
  const result = Result.ok(42);
  assertEquals(result.ok, true);
  if (result.ok) {
    assertEquals(result.value, 42);
  }
});

Deno.test("Result.err creates failed Result", () => {
  const result = Result.err("something went wrong");
  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.error, "something went wrong");
  }
});

Deno.test("Result.map transforms success value", () => {
  const result = Result.ok(5);
  const mapped = Result.map(result, (x) => x * 2);

  assertEquals(mapped.ok, true);
  if (mapped.ok) {
    assertEquals(mapped.value, 10);
  }
});

Deno.test("Result.map leaves error unchanged", () => {
  const result = Result.err<number, string>("error");
  const mapped = Result.map(result, (x) => x * 2);

  assertEquals(mapped.ok, false);
  if (!mapped.ok) {
    assertEquals(mapped.error, "error");
  }
});

Deno.test("Result.andThen chains successful Results", () => {
  const result = Result.ok(5);
  const chained = Result.andThen(result, (x) => Result.ok(x * 2));

  assertEquals(chained.ok, true);
  if (chained.ok) {
    assertEquals(chained.value, 10);
  }
});

Deno.test("Result.andThen short-circuits on error", () => {
  const result = Result.err<number, string>("initial error");
  let called = false;

  const chained = Result.andThen(result, (x) => {
    called = true;
    return Result.ok(x * 2);
  });

  assertEquals(called, false);
  assertEquals(chained.ok, false);
  if (!chained.ok) {
    assertEquals(chained.error, "initial error");
  }
});

Deno.test("Result.andThen propagates new error", () => {
  const result = Result.ok(5);
  const chained = Result.andThen(
    result,
    (_x) => Result.err("validation failed"),
  );

  assertEquals(chained.ok, false);
  if (!chained.ok) {
    assertEquals(chained.error, "validation failed");
  }
});

Deno.test("Result.mapErr transforms error value", () => {
  const result = Result.err("error");
  const mapped = Result.mapErr(result, (e) => e.toUpperCase());

  assertEquals(mapped.ok, false);
  if (!mapped.ok) {
    assertEquals(mapped.error, "ERROR");
  }
});

Deno.test("Result.mapErr leaves success unchanged", () => {
  const result = Result.ok(42);
  const mapped = Result.mapErr(result, (e: string) => e.toUpperCase());

  assertEquals(mapped.ok, true);
  if (mapped.ok) {
    assertEquals(mapped.value, 42);
  }
});

Deno.test("Result.ensure validates success value", () => {
  const result = Result.ok(25);
  const ensurer = Result.ensure<number, string>(
    (x) => x >= 18,
    "must be 18 or older",
  );
  const validated = ensurer(result);

  assertEquals(validated.ok, true);
  if (validated.ok) {
    assertEquals(validated.value, 25);
  }
});

Deno.test("Result.ensure fails invalid value", () => {
  const result = Result.ok(16);
  const ensurer = Result.ensure<number, string>(
    (x) => x >= 18,
    "must be 18 or older",
  );
  const validated = ensurer(result);

  assertEquals(validated.ok, false);
  if (!validated.ok) {
    assertEquals(validated.error, "must be 18 or older");
  }
});

Deno.test("Result.ensure leaves error unchanged", () => {
  const result = Result.err<number, string>("previous error");
  const ensurer = Result.ensure<number, string>(
    (x) => x >= 18,
    "must be 18 or older",
  );
  const validated = ensurer(result);

  assertEquals(validated.ok, false);
  if (!validated.ok) {
    assertEquals(validated.error, "previous error");
  }
});

Deno.test("Result.unwrapOr returns value on success", () => {
  const result = Result.ok(42);
  const value = Result.unwrapOr(result, 0);
  assertEquals(value, 42);
});

Deno.test("Result.unwrapOr returns default on error", () => {
  const result = Result.err<number, string>("error");
  const value = Result.unwrapOr(result, 0);
  assertEquals(value, 0);
});

Deno.test("Result.isOk type guard works", () => {
  const success = Result.ok(42);
  const failure = Result.err("error");

  assertEquals(Result.isOk(success), true);
  assertEquals(Result.isOk(failure), false);
});

Deno.test("Result.isErr type guard works", () => {
  const success = Result.ok(42);
  const failure = Result.err("error");

  assertEquals(Result.isErr(success), false);
  assertEquals(Result.isErr(failure), true);
});

Deno.test("Result chaining complex workflow", () => {
  type User = { name: string; email: string; age: number };

  const validateName = (name: string): Result<string, string> => {
    return name.length > 0
      ? Result.ok(name.trim())
      : Result.err("Name is required");
  };

  const validateEmail = (email: string): Result<string, string> => {
    return email.includes("@")
      ? Result.ok(email.toLowerCase())
      : Result.err("Invalid email");
  };

  const validateAge = (age: number): Result<number, string> => {
    return age >= 0 && age <= 150 ? Result.ok(age) : Result.err("Invalid age");
  };

  const createUser = (
    name: string,
    email: string,
    age: number,
  ): Result<User, string> => {
    const nameResult = validateName(name);
    if (!nameResult.ok) return nameResult as any;

    const emailResult = validateEmail(email);
    if (!emailResult.ok) return emailResult as any;

    const ageResult = validateAge(age);
    if (!ageResult.ok) return ageResult as any;

    return Result.ok({
      name: nameResult.value,
      email: emailResult.value,
      age: ageResult.value,
    });
  };

  // Success case
  const success = createUser("Alice", "alice@example.com", 30);
  assertEquals(success.ok, true);
  if (success.ok) {
    assertEquals(success.value.name, "Alice");
    assertEquals(success.value.email, "alice@example.com");
    assertEquals(success.value.age, 30);
  }

  // Failure cases
  const failName = createUser("", "alice@example.com", 30);
  assertEquals(failName.ok, false);
  if (!failName.ok) {
    assertEquals(failName.error, "Name is required");
  }

  const failEmail = createUser("Alice", "invalid", 30);
  assertEquals(failEmail.ok, false);
  if (!failEmail.ok) {
    assertEquals(failEmail.error, "Invalid email");
  }

  const failAge = createUser("Alice", "alice@example.com", 200);
  assertEquals(failAge.ok, false);
  if (!failAge.ok) {
    assertEquals(failAge.error, "Invalid age");
  }
});

// =============================================================================
// Option Combinator Tests
// =============================================================================

Deno.test("Option.some creates Option with value", () => {
  const option = Option.some(42);
  assertEquals(option.some, true);
  if (option.some) {
    assertEquals(option.value, 42);
  }
});

Deno.test("Option.none creates empty Option", () => {
  const option = Option.none<number>();
  assertEquals(option.some, false);
});

Deno.test("Option.first returns Some for non-empty array", () => {
  const option = Option.first([1, 2, 3]);
  assertEquals(option.some, true);
  if (option.some) {
    assertEquals(option.value, 1);
  }
});

Deno.test("Option.first returns None for empty array", () => {
  const option = Option.first([]);
  assertEquals(option.some, false);
});

Deno.test("Option.from converts value to Some", () => {
  const option = Option.from(42);
  assertEquals(option.some, true);
  if (option.some) {
    assertEquals(option.value, 42);
  }
});

Deno.test("Option.from converts null to None", () => {
  const option = Option.from(null);
  assertEquals(option.some, false);
});

Deno.test("Option.from converts undefined to None", () => {
  const option = Option.from(undefined);
  assertEquals(option.some, false);
});

Deno.test("Option.map transforms Some value", () => {
  const option = Option.some(5);
  const mapped = Option.map(option, (x) => x * 2);

  assertEquals(mapped.some, true);
  if (mapped.some) {
    assertEquals(mapped.value, 10);
  }
});

Deno.test("Option.map leaves None unchanged", () => {
  const option = Option.none<number>();
  const mapped = Option.map(option, (x) => x * 2);

  assertEquals(mapped.some, false);
});

Deno.test("Option.andThen chains Some values", () => {
  const option = Option.some(5);
  const chained = Option.andThen(
    option,
    (x) => x > 0 ? Option.some(x * 2) : Option.none(),
  );

  assertEquals(chained.some, true);
  if (chained.some) {
    assertEquals(chained.value, 10);
  }
});

Deno.test("Option.andThen short-circuits on None", () => {
  const option = Option.none<number>();
  let called = false;

  const chained = Option.andThen(option, (x) => {
    called = true;
    return Option.some(x * 2);
  });

  assertEquals(called, false);
  assertEquals(chained.some, false);
});

Deno.test("Option.andThen can return None", () => {
  const option = Option.some(-5);
  const chained = Option.andThen(
    option,
    (x) => x > 0 ? Option.some(x * 2) : Option.none(),
  );

  assertEquals(chained.some, false);
});

Deno.test("Option.okOr converts Some to Result.ok", () => {
  const option = Option.some(42);
  const result = Option.okOr(option, "not found");

  assertEquals(result.ok, true);
  if (result.ok) {
    assertEquals(result.value, 42);
  }
});

Deno.test("Option.okOr converts None to Result.err", () => {
  const option = Option.none<number>();
  const result = Option.okOr(option, "not found");

  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.error, "not found");
  }
});

Deno.test("Option.unwrapOr returns value on Some", () => {
  const option = Option.some(42);
  const value = Option.unwrapOr(option, 0);
  assertEquals(value, 42);
});

Deno.test("Option.unwrapOr returns default on None", () => {
  const option = Option.none<number>();
  const value = Option.unwrapOr(option, 0);
  assertEquals(value, 0);
});

Deno.test("Option.isSome type guard works", () => {
  const some = Option.some(42);
  const none = Option.none();

  assertEquals(Option.isSome(some), true);
  assertEquals(Option.isSome(none), false);
});

Deno.test("Option.isNone type guard works", () => {
  const some = Option.some(42);
  const none = Option.none();

  assertEquals(Option.isNone(some), false);
  assertEquals(Option.isNone(none), true);
});

Deno.test("Option.zip combines multiple Some values", () => {
  const opt1 = Option.some("Alice");
  const opt2 = Option.some(30);
  const opt3 = Option.some("alice@example.com");

  const zipped = Option.zip(opt1, opt2, opt3);

  assertEquals(zipped.some, true);
  if (zipped.some) {
    assertEquals(zipped.value, ["Alice", 30, "alice@example.com"]);
  }
});

Deno.test("Option.zip returns None if any is None", () => {
  const opt1 = Option.some("Alice");
  const opt2 = Option.none<number>();
  const opt3 = Option.some("alice@example.com");

  const zipped = Option.zip(opt1, opt2, opt3);

  assertEquals(zipped.some, false);
});

Deno.test("Option chaining complex workflow", () => {
  type Config = {
    host?: string;
    port?: number;
    ssl?: boolean;
  };

  const buildConnectionString = (config: Config): Result<string, string> => {
    const hostOpt = Option.from(config.host);
    const portOpt = Option.from(config.port);
    const sslOpt = Option.from(config.ssl);

    const hostResult = Option.okOr(hostOpt, "Host is required");
    if (!hostResult.ok) return hostResult;

    const portResult = Option.okOr(portOpt, "Port is required");
    if (!portResult.ok) return portResult;

    const ssl = Option.unwrapOr(sslOpt, false);
    const protocol = ssl ? "https" : "http";

    return Result.ok(`${protocol}://${hostResult.value}:${portResult.value}`);
  };

  // Success case
  const success = buildConnectionString({
    host: "localhost",
    port: 8080,
    ssl: true,
  });
  assertEquals(success.ok, true);
  if (success.ok) {
    assertEquals(success.value, "https://localhost:8080");
  }

  // Default SSL
  const noSsl = buildConnectionString({
    host: "localhost",
    port: 8080,
  });
  assertEquals(noSsl.ok, true);
  if (noSsl.ok) {
    assertEquals(noSsl.value, "http://localhost:8080");
  }

  // Missing host
  const noHost = buildConnectionString({
    port: 8080,
  });
  assertEquals(noHost.ok, false);
  if (!noHost.ok) {
    assertEquals(noHost.error, "Host is required");
  }

  // Missing port
  const noPort = buildConnectionString({
    host: "localhost",
  });
  assertEquals(noPort.ok, false);
  if (!noPort.ok) {
    assertEquals(noPort.error, "Port is required");
  }
});

// =============================================================================
// Integration Tests: Result/Option with other combinators
// =============================================================================

Deno.test("Result and Option integration", () => {
  // Scenario: Parse optional config value to number
  type Config = { timeout?: string };

  const parseTimeout = (config: Config): Result<number, string> => {
    const timeoutOpt = Option.from(config.timeout);

    // Convert to Result first
    const timeoutResult = Option.okOr(timeoutOpt, "Timeout not configured");
    if (!timeoutResult.ok) return timeoutResult;

    // Parse the string
    const parsed = Number(timeoutResult.value);
    if (isNaN(parsed)) {
      return Result.err("Invalid timeout format");
    }

    // Validate range
    const ensureValid = Result.ensure<number, string>(
      (n) => n > 0 && n <= 60000,
      "Timeout must be 1-60000ms",
    );
    return ensureValid(Result.ok(parsed));
  };

  // Success
  const success = parseTimeout({ timeout: "5000" });
  assertEquals(success.ok, true);
  if (success.ok) {
    assertEquals(success.value, 5000);
  }

  // Missing
  const missing = parseTimeout({});
  assertEquals(missing.ok, false);
  if (!missing.ok) {
    assertEquals(missing.error, "Timeout not configured");
  }

  // Invalid format
  const invalid = parseTimeout({ timeout: "abc" });
  assertEquals(invalid.ok, false);
  if (!invalid.ok) {
    assertEquals(invalid.error, "Invalid timeout format");
  }

  // Out of range
  const outOfRange = parseTimeout({ timeout: "100000" });
  assertEquals(outOfRange.ok, false);
  if (!outOfRange.ok) {
    assertEquals(outOfRange.error, "Timeout must be 1-60000ms");
  }
});

Deno.test("Nested Result and Option transformations", () => {
  type User = { name: string; email?: string };

  const getUserEmail = (user: User): Option<string> => {
    return Option.from(user.email);
  };

  const normalizeEmail = (email: string): Result<string, string> => {
    const trimmed = email.trim();
    return trimmed.length > 0 && trimmed.includes("@")
      ? Result.ok(trimmed.toLowerCase())
      : Result.err("Invalid email format");
  };

  const getValidatedEmail = (user: User): Result<string, string> => {
    const emailOpt = getUserEmail(user);
    const emailResult = Option.okOr(emailOpt, "Email not provided");

    return Result.andThen(emailResult, normalizeEmail);
  };

  // Success
  const withEmail = getValidatedEmail({
    name: "Alice",
    email: " ALICE@EXAMPLE.COM ",
  });
  assertEquals(withEmail.ok, true);
  if (withEmail.ok) {
    assertEquals(withEmail.value, "alice@example.com");
  }

  // No email
  const noEmail = getValidatedEmail({ name: "Bob" });
  assertEquals(noEmail.ok, false);
  if (!noEmail.ok) {
    assertEquals(noEmail.error, "Email not provided");
  }

  // Invalid email
  const invalid = getValidatedEmail({ name: "Charlie", email: "invalid" });
  assertEquals(invalid.ok, false);
  if (!invalid.ok) {
    assertEquals(invalid.error, "Invalid email format");
  }
});

console.log("\n✅ All Result/Option combinator tests passed!");
