// packages/lfts-type-runtime/async-result.test.ts
import { assertEquals } from "jsr:@std/assert";
import { AsyncResult, Result } from "./mod.ts";

// ============================================================================
// AsyncResult.try Tests
// ============================================================================

Deno.test("AsyncResult.try - success case", async () => {
  const result = await AsyncResult.try(
    async () => "success",
    (err) => `error: ${err}`,
  );
  assertEquals(result, { ok: true, value: "success" });
});

Deno.test("AsyncResult.try - error case", async () => {
  const result = await AsyncResult.try(
    async () => {
      throw new Error("failed");
    },
    (err) => `caught: ${(err as Error).message}`,
  );
  assertEquals(result, { ok: false, error: "caught: failed" });
});

Deno.test("AsyncResult.try - with async fetch simulation", async () => {
  const mockFetch = async (shouldFail: boolean) => {
    if (shouldFail) throw new Error("Network error");
    return { data: "payload" };
  };

  const success = await AsyncResult.try(
    async () => mockFetch(false),
    (err) => `Network error: ${err}`,
  );
  assertEquals(success.ok, true);
  if (success.ok) {
    assertEquals(success.value, { data: "payload" });
  }

  const failure = await AsyncResult.try(
    async () => mockFetch(true),
    (err) => `Network error: ${(err as Error).message}`,
  );
  assertEquals(failure, { ok: false, error: "Network error: Network error" });
});

// ============================================================================
// AsyncResult.andThen Tests
// ============================================================================

Deno.test("AsyncResult.andThen - chain two successful operations", async () => {
  const loadUser = async (id: number) =>
    Result.ok({ id, name: "Alice", posts: 10 });
  const loadPosts = async (count: number) =>
    Result.ok(Array.from({ length: count }, (_, i) => `Post ${i + 1}`));

  const result = await AsyncResult.andThen(
    loadUser(1),
    (user) => loadPosts(user.posts),
  );

  assertEquals(result.ok, true);
  if (result.ok) {
    assertEquals(result.value.length, 10);
    assertEquals(result.value[0], "Post 1");
  }
});

Deno.test("AsyncResult.andThen - short-circuit on first error", async () => {
  const loadUser = async (id: number) =>
    Result.err<{ id: number; name: string }, string>(`User ${id} not found`);
  const loadPosts = async (count: number) => Result.ok(Array(count));

  const result = await AsyncResult.andThen(loadUser(999), (user) =>
    loadPosts(user.id)
  );

  assertEquals(result, { ok: false, error: "User 999 not found" });
});

Deno.test("AsyncResult.andThen - second operation fails", async () => {
  const loadUser = async (id: number) => Result.ok({ id, name: "Bob" });
  const loadPosts = async (_userId: number) =>
    Result.err<string[], string>("Posts service down");

  const result = await AsyncResult.andThen(loadUser(1), (user) =>
    loadPosts(user.id)
  );

  assertEquals(result, { ok: false, error: "Posts service down" });
});

Deno.test("AsyncResult.andThen - chain multiple operations", async () => {
  const step1 = async (x: number) => Result.ok(x + 1);
  const step2 = async (x: number) => Result.ok(x * 2);
  const step3 = async (x: number) => Result.ok(x - 3);

  const result = await AsyncResult.andThen(
    AsyncResult.andThen(
      AsyncResult.andThen(Promise.resolve(Result.ok(5)), step1),
      step2,
    ),
    step3,
  );

  // (5 + 1) * 2 - 3 = 9
  assertEquals(result, { ok: true, value: 9 });
});

// ============================================================================
// AsyncResult.map Tests
// ============================================================================

Deno.test("AsyncResult.map - transform success value", async () => {
  const loadUser = async () => Result.ok({ id: 1, name: "Charlie" });
  const result = await AsyncResult.map(loadUser(), (user) => user.name);

  assertEquals(result, { ok: true, value: "Charlie" });
});

Deno.test("AsyncResult.map - preserve error", async () => {
  const loadUser = async () =>
    Result.err<{ id: number; name: string }, string>("Not found");
  const result = await AsyncResult.map(loadUser(), (user) => user.name);

  assertEquals(result, { ok: false, error: "Not found" });
});

Deno.test("AsyncResult.map - complex transformation", async () => {
  const loadData = async () =>
    Result.ok({ items: [1, 2, 3, 4, 5], meta: { count: 5 } });
  const result = await AsyncResult.map(loadData(), (data) =>
    data.items.filter((x) => x % 2 === 0)
  );

  assertEquals(result, { ok: true, value: [2, 4] });
});

// ============================================================================
// AsyncResult.mapErr Tests
// ============================================================================

Deno.test("AsyncResult.mapErr - transform error value", async () => {
  const loadUser = async () => Result.err<never, number>(404);
  const result = await AsyncResult.mapErr(
    loadUser(),
    (code) => `HTTP Error ${code}`,
  );

  assertEquals(result, { ok: false, error: "HTTP Error 404" });
});

Deno.test("AsyncResult.mapErr - preserve success", async () => {
  const loadUser = async () => Result.ok("success");
  const result = await AsyncResult.mapErr(
    loadUser(),
    (err) => `Error: ${err}`,
  );

  assertEquals(result, { ok: true, value: "success" });
});

// ============================================================================
// AsyncResult.all Tests
// ============================================================================

Deno.test("AsyncResult.all - all operations succeed", async () => {
  const op1 = async () => Result.ok(1);
  const op2 = async () => Result.ok(2);
  const op3 = async () => Result.ok(3);

  const result = await AsyncResult.all([op1(), op2(), op3()]);

  assertEquals(result, { ok: true, value: [1, 2, 3] });
});

Deno.test("AsyncResult.all - fail-fast on first error", async () => {
  const op1 = async () => Result.ok(1);
  const op2 = async () => Result.err<number, string>("failed at 2");
  const op3 = async () => Result.ok(3);

  const result = await AsyncResult.all([op1(), op2(), op3()]);

  assertEquals(result, { ok: false, error: "failed at 2" });
});

Deno.test("AsyncResult.all - empty array", async () => {
  const result = await AsyncResult.all([]);
  assertEquals(result, { ok: true, value: [] });
});

Deno.test("AsyncResult.all - parallel execution", async () => {
  let executionOrder: number[] = [];

  const delayedOp = (id: number, delayMs: number) => async () => {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    executionOrder.push(id);
    return Result.ok(id);
  };

  const startTime = Date.now();
  const result = await AsyncResult.all([
    delayedOp(1, 50)(),
    delayedOp(2, 30)(),
    delayedOp(3, 10)(),
  ]);
  const elapsed = Date.now() - startTime;

  // All should run in parallel, so total time < sum of delays
  assertEquals(result, { ok: true, value: [1, 2, 3] });
  assertEquals(elapsed < 100, true); // Should be ~50ms, not 90ms

  // Execution order shows they completed at different times
  assertEquals(executionOrder, [3, 2, 1]); // Shortest delay finishes first
});

// ============================================================================
// AsyncResult.allSettled Tests
// ============================================================================

Deno.test("AsyncResult.allSettled - all succeed", async () => {
  const op1 = async () => Result.ok(1);
  const op2 = async () => Result.ok(2);
  const op3 = async () => Result.ok(3);

  const result = await AsyncResult.allSettled([op1(), op2(), op3()]);

  assertEquals(result, { successes: [1, 2, 3], failures: [] });
});

Deno.test("AsyncResult.allSettled - all fail", async () => {
  const op1 = async () => Result.err<never, string>("error 1");
  const op2 = async () => Result.err<never, string>("error 2");
  const op3 = async () => Result.err<never, string>("error 3");

  const result = await AsyncResult.allSettled([op1(), op2(), op3()]);

  assertEquals(result, {
    successes: [],
    failures: ["error 1", "error 2", "error 3"],
  });
});

Deno.test("AsyncResult.allSettled - mixed results", async () => {
  const op1 = async () => Result.ok(1);
  const op2 = async () => Result.err<number, string>("failed");
  const op3 = async () => Result.ok(3);
  const op4 = async () => Result.err<number, string>("also failed");

  const result = await AsyncResult.allSettled([op1(), op2(), op3(), op4()]);

  assertEquals(result, {
    successes: [1, 3],
    failures: ["failed", "also failed"],
  });
});

Deno.test("AsyncResult.allSettled - empty array", async () => {
  const result = await AsyncResult.allSettled([]);
  assertEquals(result, { successes: [], failures: [] });
});

// ============================================================================
// AsyncResult.race Tests
// ============================================================================

Deno.test("AsyncResult.race - first to complete wins (success)", async () => {
  let counter = 0;
  const op1 = async () => {
    counter++;
    return Result.ok(1);
  };
  const op2 = async () => {
    counter++;
    return Result.ok(2);
  };

  const result = await AsyncResult.race([op1(), op2()]);

  // Both start immediately due to Promise.race, so one wins
  assertEquals(result.ok, true);
  if (result.ok) {
    // Result should be either 1 or 2
    assertEquals([1, 2].includes(result.value), true);
  }
});

Deno.test("AsyncResult.race - first to complete wins (error)", async () => {
  const op1 = async () => Result.err<number, string>("error 1");
  const op2 = async () => Result.ok(2);

  const result = await AsyncResult.race([op1(), op2()]);

  // Since both resolve immediately, we get whichever Promise.race picks
  // This tests that race works correctly for error results
  assertEquals(result.ok === false || (result.ok && result.value === 2), true);
});

Deno.test("AsyncResult.race - single operation", async () => {
  const op = async () => Result.ok(42);
  const result = await AsyncResult.race([op()]);

  assertEquals(result, { ok: true, value: 42 });
});

// ============================================================================
// Integration Tests
// ============================================================================

Deno.test("Integration: simulate effectful port operations", async () => {
  // Simulate a storage port with effectful operations
  type User = { id: number; name: string; email: string };
  type LoadError = "not_found" | "network_error" | "permission_denied";

  const mockStorage = {
    loadUser: async (id: number): Promise<Result<User, LoadError>> => {
      if (id === 999) return Result.err("not_found");
      return Result.ok({ id, name: `User${id}`, email: `user${id}@test.com` });
    },
    validateEmail: async (
      email: string,
    ): Promise<Result<boolean, "invalid_format">> => {
      return email.includes("@")
        ? Result.ok(true)
        : Result.err("invalid_format");
    },
  };

  // Use AsyncResult helpers to compose operations
  const result = await AsyncResult.andThen(
    mockStorage.loadUser(1),
    (user) =>
      AsyncResult.map(
        mockStorage.validateEmail(user.email),
        (isValid) => ({ user, isValid }),
      ),
  );

  assertEquals(result.ok, true);
  if (result.ok) {
    assertEquals(result.value.user.name, "User1");
    assertEquals(result.value.isValid, true);
  }
});

Deno.test("Integration: batch load multiple users", async () => {
  type User = { id: number; name: string };
  type LoadError = string;

  const loadUser = async (id: number): Promise<Result<User, LoadError>> => {
    if (id > 100) return Result.err(`Invalid ID: ${id}`);
    return Result.ok({ id, name: `User${id}` });
  };

  // Load multiple users in parallel
  const userIds = [1, 2, 3, 4, 5];
  const result = await AsyncResult.all(userIds.map((id) => loadUser(id)));

  assertEquals(result.ok, true);
  if (result.ok) {
    assertEquals(result.value.length, 5);
    assertEquals(result.value[0].name, "User1");
    assertEquals(result.value[4].name, "User5");
  }
});

Deno.test("Integration: error handling with allSettled", async () => {
  type User = { id: number; name: string };
  type LoadError = string;

  const loadUser = async (id: number): Promise<Result<User, LoadError>> => {
    if (id === 3) return Result.err("User 3 not found");
    if (id === 7) return Result.err("User 7 permission denied");
    return Result.ok({ id, name: `User${id}` });
  };

  const userIds = [1, 2, 3, 4, 5, 6, 7, 8];
  const result = await AsyncResult.allSettled(userIds.map((id) => loadUser(id)));

  // 6 successes, 2 failures
  assertEquals(result.successes.length, 6);
  assertEquals(result.failures.length, 2);
  assertEquals(result.failures, ["User 3 not found", "User 7 permission denied"]);
});
