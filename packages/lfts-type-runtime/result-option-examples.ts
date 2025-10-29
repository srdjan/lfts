// packages/lfts-type-runtime/result-option-examples.ts
// Comprehensive examples for Result/Option combinators (Phase 1.1)

import { Option, Result, validate, type ValidationError } from "./mod.ts";
import { enc } from "../lfts-type-spec/src/mod.ts";

console.log("=== Result/Option Combinator Examples ===\n");

// =============================================================================
// Example 1: Basic Result Operations
// =============================================================================

console.log("Example 1: Basic Result Operations");
console.log("-----------------------------------");

const divideResult = (a: number, b: number): Result<number, string> => {
  return b === 0 ? Result.err("Division by zero") : Result.ok(a / b);
};

const result1 = divideResult(10, 2);
console.log("10 / 2 =", result1); // { ok: true, value: 5 }

const result2 = divideResult(10, 0);
console.log("10 / 0 =", result2); // { ok: false, error: "Division by zero" }

// Using unwrapOr for safe defaults
const value1 = Result.unwrapOr(result1, 0);
const value2 = Result.unwrapOr(result2, 0);
console.log("With defaults:", value1, value2); // 5, 0
console.log();

// =============================================================================
// Example 2: Result.map for Transformations
// =============================================================================

console.log("Example 2: Result.map for Transformations");
console.log("-----------------------------------------");

const parseNumber = (s: string): Result<number, string> => {
  const n = Number(s);
  return isNaN(n) ? Result.err(`"${s}" is not a number`) : Result.ok(n);
};

const input = "42";
const parsed = parseNumber(input);
const doubled = Result.map(parsed, (n) => n * 2);
const formatted = Result.map(doubled, (n) => `Result: ${n}`);

console.log("Input:", input);
console.log("Parsed:", parsed); // { ok: true, value: 42 }
console.log("Doubled:", doubled); // { ok: true, value: 84 }
console.log("Formatted:", formatted); // { ok: true, value: "Result: 84" }

const badInput = "abc";
const badParsed = parseNumber(badInput);
const badDoubled = Result.map(badParsed, (n) => n * 2);
console.log("\nBad input:", badInput);
console.log("Error preserved:", badDoubled); // { ok: false, error: "..." }
console.log();

// =============================================================================
// Example 3: Result.andThen for Chaining
// =============================================================================

console.log("Example 3: Result.andThen for Chaining");
console.log("---------------------------------------");

type User = { name: string; email: string; age: number };

const validateName = (name: string): Result<string, string> => {
  return name.length > 0
    ? Result.ok(name.trim())
    : Result.err("Name cannot be empty");
};

const validateEmail = (email: string): Result<string, string> => {
  return email.includes("@")
    ? Result.ok(email.toLowerCase())
    : Result.err("Invalid email format");
};

const validateAge = (age: number): Result<number, string> => {
  return age >= 0 && age <= 150
    ? Result.ok(age)
    : Result.err("Age must be between 0 and 150");
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

const user1 = createUser("Alice", "alice@example.com", 30);
console.log("Valid user:", user1);

const user2 = createUser("", "alice@example.com", 30);
console.log("Invalid user (empty name):", user2);

const user3 = createUser("Bob", "invalid-email", 30);
console.log("Invalid user (bad email):", user3);
console.log();

// =============================================================================
// Example 4: Result.ensure for Validation
// =============================================================================

console.log("Example 4: Result.ensure for Validation");
console.log("----------------------------------------");

const isAdult = (age: number) => age >= 18;
const isPremium = (score: number) => score >= 1000;

const checkAdultUser = (age: number): Result<number, string> => {
  const ageResult = validateAge(age);
  const ensureAdult = Result.ensure<number, string>(
    isAdult,
    "User must be at least 18",
  );
  return ensureAdult(ageResult);
};

console.log("Age 25:", checkAdultUser(25)); // OK
console.log("Age 16:", checkAdultUser(16)); // Error: must be 18
console.log("Age -5:", checkAdultUser(-5)); // Error: must be 0-150 (from validateAge)
console.log();

// =============================================================================
// Example 5: Option.first and Option.from
// =============================================================================

console.log("Example 5: Option.first and Option.from");
console.log("----------------------------------------");

const emails = ["alice@example.com", "bob@example.com"];
const primaryEmail = Option.first(emails);
console.log("Primary email:", primaryEmail); // { some: true, value: "alice@example.com" }

const noEmails: string[] = [];
const noPrimary = Option.first(noEmails);
console.log("No emails:", noPrimary); // { some: false }

// Option.from for nullable values
type Config = { host?: string; port?: number };

const config1: Config = { host: "localhost", port: 8080 };
const hostOpt1 = Option.from(config1.host);
console.log("\nConfig with host:", hostOpt1); // { some: true, value: "localhost" }

const config2: Config = { port: 8080 };
const hostOpt2 = Option.from(config2.host);
console.log("Config without host:", hostOpt2); // { some: false }
console.log();

// =============================================================================
// Example 6: Option.okOr to Convert to Result
// =============================================================================

console.log("Example 6: Option.okOr to Convert to Result");
console.log("--------------------------------------------");

const getRequiredHost = (config: Config): Result<string, string> => {
  return Option.okOr(Option.from(config.host), "Host is required");
};

const withHost = getRequiredHost({ host: "localhost", port: 8080 });
console.log("With host:", withHost); // { ok: true, value: "localhost" }

const withoutHost = getRequiredHost({ port: 8080 });
console.log("Without host:", withoutHost); // { ok: false, error: "Host is required" }
console.log();

// =============================================================================
// Example 7: Option.map and Option.andThen
// =============================================================================

console.log("Example 7: Option.map and Option.andThen");
console.log("-----------------------------------------");

const normalizeHost = (config: Config): Option<string> => {
  return Option.map(Option.from(config.host), (h) => h.toLowerCase());
};

console.log("Normalized host:", normalizeHost({ host: "LOCALHOST" }));
// { some: true, value: "localhost" }

console.log("No host to normalize:", normalizeHost({}));
// { some: false }

// andThen for conditional chaining
const getValidPort = (config: Config): Option<number> => {
  return Option.andThen(
    Option.from(config.port),
    (p) => p > 0 && p < 65536 ? Option.some(p) : Option.none(),
  );
};

console.log("\nValid port:", getValidPort({ port: 8080 }));
// { some: true, value: 8080 }

console.log("Invalid port:", getValidPort({ port: -1 }));
// { some: false }

console.log("No port:", getValidPort({}));
// { some: false }
console.log();

// =============================================================================
// Example 8: Option.zip for Combining Values
// =============================================================================

console.log("Example 8: Option.zip for Combining Values");
console.log("-------------------------------------------");

const buildConnectionString = (config: Config): Option<string> => {
  const hostOpt = Option.from(config.host);
  const portOpt = Option.from(config.port);

  const zipped = Option.zip(hostOpt, portOpt);

  return Option.map(zipped, ([host, port]) => `${host}:${port}`);
};

console.log(
  "Full config:",
  buildConnectionString({ host: "localhost", port: 8080 }),
);
// { some: true, value: "localhost:8080" }

console.log("Missing host:", buildConnectionString({ port: 8080 }));
// { some: false }

console.log("Missing port:", buildConnectionString({ host: "localhost" }));
// { some: false }
console.log();

// =============================================================================
// Example 9: Real-World Scenario - Configuration Parser
// =============================================================================

console.log("Example 9: Real-World Configuration Parser");
console.log("-------------------------------------------");

type AppConfig = {
  readonly host: string;
  readonly port: number;
  readonly timeout: number;
  readonly ssl: boolean;
};

type RawConfig = {
  readonly host?: string;
  readonly port?: string;
  readonly timeout?: string;
  readonly ssl?: string;
};

const parseConfig = (raw: RawConfig): Result<AppConfig, string> => {
  // Get required host
  const hostResult = Option.okOr(Option.from(raw.host), "Host is required");
  if (!hostResult.ok) return hostResult;

  // Parse and validate port
  const portOpt = Option.from(raw.port);
  const portResult = Option.okOr(portOpt, "Port is required");
  if (!portResult.ok) return portResult;

  const portNum = Number(portResult.value);
  if (isNaN(portNum) || portNum <= 0 || portNum >= 65536) {
    return Result.err("Port must be between 1 and 65535");
  }

  // Parse optional timeout with default
  const timeoutOpt = Option.map(Option.from(raw.timeout), Number);
  const timeout = Option.unwrapOr(timeoutOpt, 5000);

  // Parse optional SSL with default
  const sslOpt = Option.map(Option.from(raw.ssl), (s) => s === "true");
  const ssl = Option.unwrapOr(sslOpt, false);

  return Result.ok({
    host: hostResult.value,
    port: portNum,
    timeout,
    ssl,
  });
};

const validConfig = parseConfig({
  host: "localhost",
  port: "8080",
  timeout: "3000",
  ssl: "true",
});
console.log("Valid config:", validConfig);

const defaultsConfig = parseConfig({
  host: "localhost",
  port: "8080",
});
console.log("\nWith defaults:", defaultsConfig);

const missingHost = parseConfig({
  port: "8080",
});
console.log("\nMissing host:", missingHost);

const invalidPort = parseConfig({
  host: "localhost",
  port: "abc",
});
console.log("\nInvalid port:", invalidPort);
console.log();

// =============================================================================
// Example 10: Integration with Runtime Validator
// =============================================================================

console.log("Example 10: Integration with Runtime Validator");
console.log("-----------------------------------------------");

// Define a schema
const UserSchema = enc.obj([
  { name: "name", type: enc.str() },
  { name: "email", type: enc.str() },
  { name: "age", type: enc.num() },
]);

// Validate unknown data
const validateUserData = (data: unknown): Result<User, ValidationError> => {
  try {
    const validated = validate(UserSchema, data) as User;
    return Result.ok(validated);
  } catch (error) {
    return Result.err(error as ValidationError);
  }
};

// Chain with business logic validation
const validateAndCheckAdult = (data: unknown): Result<User, string> => {
  const validated = validateUserData(data);

  // Use mapErr to transform ValidationError to string
  const stringResult = Result.mapErr(validated, (e) => e.message);

  // Use ensure to check age
  const ensureAdult = Result.ensure<User, string>(
    (u) => u.age >= 18,
    "User must be at least 18",
  );

  return ensureAdult(stringResult);
};

const validAdult = validateAndCheckAdult({
  name: "Alice",
  email: "alice@example.com",
  age: 25,
});
console.log("Valid adult user:", validAdult);

const validMinor = validateAndCheckAdult({
  name: "Bob",
  email: "bob@example.com",
  age: 16,
});
console.log("\nMinor user:", validMinor);

const invalidData = validateAndCheckAdult({
  name: "Charlie",
  email: "charlie@example.com",
  // age missing
});
console.log("\nInvalid data:", invalidData);

console.log("\n=== All examples completed! ===");
