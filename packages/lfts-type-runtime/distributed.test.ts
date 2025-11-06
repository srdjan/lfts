// packages/lfts-type-runtime/distributed.test.ts
// Tests for distributed execution helpers

import { assertEquals } from "jsr:@std/assert";
import {
  createCircuitBreaker,
  httpDelete,
  httpGet,
  httpPost,
  httpPut,
  type NetworkError,
  withFallback,
  withRetry,
  withTimeout,
} from "./distributed.ts";
import { Result } from "./mod.ts";
import { enc } from "../lfts-type-spec/src/mod.ts";

// Test schemas
const UserSchema = enc.obj([
  { name: "id", type: enc.num() },
  { name: "name", type: enc.str() },
  { name: "email", type: enc.str() },
]);

const CreateUserRequest = enc.obj([
  { name: "name", type: enc.str() },
  { name: "email", type: enc.str() },
]);

type User = {
  id: number;
  name: string;
  email: string;
};

type CreateUserRequestType = {
  name: string;
  email: string;
};

// Mock HTTP server helpers
function startMockServer(port: number, handler: (req: Request) => Response | Promise<Response>) {
  const server = Deno.serve({ port, hostname: "localhost" }, handler);
  return server;
}

// ============================================================================
// httpGet Tests
// ============================================================================

Deno.test("httpGet - success case with validation", async () => {
  const server = startMockServer(8001, (req) => {
    if (req.url.endsWith("/users/123")) {
      return new Response(
        JSON.stringify({ id: 123, name: "Alice", email: "alice@example.com" }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
    return new Response("Not found", { status: 404 });
  });

  try {
    const result = await httpGet<User>(
      "http://localhost:8001/users/123",
      UserSchema
    );

    assertEquals(result.ok, true);
    if (result.ok) {
      assertEquals(result.value.id, 123);
      assertEquals(result.value.name, "Alice");
      assertEquals(result.value.email, "alice@example.com");
    }
  } finally {
    await server.shutdown();
  }
});

Deno.test("httpGet - 404 returns http_error", async () => {
  const server = startMockServer(8002, () => {
    return new Response("User not found", { status: 404 });
  });

  try {
    const result = await httpGet<User>(
      "http://localhost:8002/users/999",
      UserSchema
    );

    assertEquals(result.ok, false);
    if (!result.ok) {
      assertEquals(result.error.type, "http_error");
      if (result.error.type === "http_error") {
        assertEquals(result.error.status, 404);
        assertEquals(result.error.url, "http://localhost:8002/users/999");
      }
    }
  } finally {
    await server.shutdown();
  }
});

Deno.test("httpGet - validation failure returns serialization_error", async () => {
  const server = startMockServer(8003, () => {
    return new Response(
      JSON.stringify({ id: "not-a-number", name: "Bob", email: "bob@test.com" }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  });

  try {
    const result = await httpGet<User>(
      "http://localhost:8003/users/123",
      UserSchema
    );

    assertEquals(result.ok, false);
    if (!result.ok) {
      assertEquals(result.error.type, "serialization_error");
    }
  } finally {
    await server.shutdown();
  }
});

Deno.test("httpGet - timeout returns timeout error", async () => {
  const server = startMockServer(8004, async () => {
    // Delay response to trigger timeout
    await new Promise(resolve => setTimeout(resolve, 200));
    return new Response("Too slow");
  });

  try {
    const result = await httpGet<User>(
      "http://localhost:8004/users/123",
      UserSchema,
      { timeoutMs: 50 } // Very short timeout
    );

    assertEquals(result.ok, false);
    if (!result.ok) {
      assertEquals(result.error.type, "timeout");
      if (result.error.type === "timeout") {
        assertEquals(result.error.ms, 50);
        assertEquals(result.error.url, "http://localhost:8004/users/123");
      }
    }
  } finally {
    await server.shutdown();
  }
});

Deno.test("httpGet - connection refused", async () => {
  // No server running on port 9999
  const result = await httpGet<User>(
    "http://localhost:9999/users/123",
    UserSchema,
    { timeoutMs: 1000 }
  );

  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.error.type, "connection_refused");
    if (result.error.type === "connection_refused") {
      assertEquals(result.error.url, "http://localhost:9999/users/123");
    }
  }
});

Deno.test("httpGet - invalid JSON returns serialization_error", async () => {
  const server = startMockServer(8005, () => {
    return new Response(
      "not valid json",
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  });

  try {
    const result = await httpGet<User>(
      "http://localhost:8005/users/123",
      UserSchema
    );

    assertEquals(result.ok, false);
    if (!result.ok) {
      assertEquals(result.error.type, "serialization_error");
    }
  } finally {
    await server.shutdown();
  }
});

// ============================================================================
// httpPost Tests
// ============================================================================

Deno.test("httpPost - success case", async () => {
  const server = startMockServer(8006, async (req) => {
    const body = await req.json();
    return new Response(
      JSON.stringify({ id: 456, name: body.name, email: body.email }),
      {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }
    );
  });

  try {
    const result = await httpPost<CreateUserRequestType, User>(
      "http://localhost:8006/users",
      { name: "Charlie", email: "charlie@example.com" },
      CreateUserRequest,
      UserSchema
    );

    assertEquals(result.ok, true);
    if (result.ok) {
      assertEquals(result.value.id, 456);
      assertEquals(result.value.name, "Charlie");
      assertEquals(result.value.email, "charlie@example.com");
    }
  } finally {
    await server.shutdown();
  }
});

Deno.test("httpPost - request validation failure", async () => {
  const server = startMockServer(8007, async (req) => {
    const body = await req.json();
    return new Response(
      JSON.stringify({ id: 456, name: body.name, email: body.email }),
      {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }
    );
  });

  try {
    const invalidRequest = { name: 123, email: "invalid" }; // name should be string

    const result = await httpPost<any, User>(
      "http://localhost:8007/users",
      invalidRequest,
      CreateUserRequest,
      UserSchema
    );

    assertEquals(result.ok, false);
    if (!result.ok) {
      assertEquals(result.error.type, "serialization_error");
    }
  } finally {
    await server.shutdown();
  }
});

Deno.test("httpPost - 409 conflict", async () => {
  const server = startMockServer(8008, () => {
    return new Response(
      JSON.stringify({ error: "Email already exists" }),
      {
        status: 409,
        headers: { "Content-Type": "application/json" },
      }
    );
  });

  try {
    const result = await httpPost<CreateUserRequestType, User>(
      "http://localhost:8008/users",
      { name: "Duplicate", email: "exists@example.com" },
      CreateUserRequest,
      UserSchema
    );

    assertEquals(result.ok, false);
    if (!result.ok) {
      assertEquals(result.error.type, "http_error");
      if (result.error.type === "http_error") {
        assertEquals(result.error.status, 409);
      }
    }
  } finally {
    await server.shutdown();
  }
});

Deno.test("httpPost - timeout", async () => {
  const server = startMockServer(8009, async () => {
    await new Promise(resolve => setTimeout(resolve, 200));
    return new Response("Too slow");
  });

  try {
    const result = await httpPost<CreateUserRequestType, User>(
      "http://localhost:8009/users",
      { name: "Slow", email: "slow@example.com" },
      CreateUserRequest,
      UserSchema,
      { timeoutMs: 50 }
    );

    assertEquals(result.ok, false);
    if (!result.ok) {
      assertEquals(result.error.type, "timeout");
    }
  } finally {
    await server.shutdown();
  }
});

// ============================================================================
// httpPut Tests
// ============================================================================

Deno.test("httpPut - success case", async () => {
  const server = startMockServer(8010, async (req) => {
    const body = await req.json();
    return new Response(
      JSON.stringify({ id: 789, name: body.name, email: body.email }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  });

  try {
    const result = await httpPut<CreateUserRequestType, User>(
      "http://localhost:8010/users/789",
      { name: "Updated", email: "updated@example.com" },
      CreateUserRequest,
      UserSchema
    );

    assertEquals(result.ok, true);
    if (result.ok) {
      assertEquals(result.value.name, "Updated");
      assertEquals(result.value.email, "updated@example.com");
    }
  } finally {
    await server.shutdown();
  }
});

Deno.test("httpPut - 404 not found", async () => {
  const server = startMockServer(8011, () => {
    return new Response("Resource not found", { status: 404 });
  });

  try {
    const result = await httpPut<CreateUserRequestType, User>(
      "http://localhost:8011/users/999",
      { name: "Missing", email: "missing@example.com" },
      CreateUserRequest,
      UserSchema
    );

    assertEquals(result.ok, false);
    if (!result.ok) {
      assertEquals(result.error.type, "http_error");
      if (result.error.type === "http_error") {
        assertEquals(result.error.status, 404);
      }
    }
  } finally {
    await server.shutdown();
  }
});

// ============================================================================
// httpDelete Tests
// ============================================================================

Deno.test("httpDelete - success with 204 No Content", async () => {
  const server = startMockServer(8012, () => {
    return new Response(null, { status: 204 });
  });

  try {
    const result = await httpDelete("http://localhost:8012/users/123");

    assertEquals(result.ok, true);
  } finally {
    await server.shutdown();
  }
});

Deno.test("httpDelete - success with 200 OK", async () => {
  const server = startMockServer(8013, () => {
    return new Response(JSON.stringify({ message: "Deleted" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });

  try {
    const result = await httpDelete("http://localhost:8013/users/123");

    assertEquals(result.ok, true);
  } finally {
    await server.shutdown();
  }
});

Deno.test("httpDelete - 404 not found", async () => {
  const server = startMockServer(8014, () => {
    return new Response("Not found", { status: 404 });
  });

  try {
    const result = await httpDelete("http://localhost:8014/users/999");

    assertEquals(result.ok, false);
    if (!result.ok) {
      assertEquals(result.error.type, "http_error");
      if (result.error.type === "http_error") {
        assertEquals(result.error.status, 404);
      }
    }
  } finally {
    await server.shutdown();
  }
});

Deno.test("httpDelete - timeout", async () => {
  const server = startMockServer(8015, async () => {
    await new Promise(resolve => setTimeout(resolve, 200));
    return new Response(null, { status: 204 });
  });

  try {
    const result = await httpDelete("http://localhost:8015/users/123", {
      timeoutMs: 50,
    });

    assertEquals(result.ok, false);
    if (!result.ok) {
      assertEquals(result.error.type, "timeout");
    }
  } finally {
    await server.shutdown();
  }
});

// ============================================================================
// Custom Headers Tests
// ============================================================================

Deno.test("httpGet - custom headers", async () => {
  let receivedAuth = "";

  const server = startMockServer(8016, (req) => {
    receivedAuth = req.headers.get("Authorization") || "";
    return new Response(
      JSON.stringify({ id: 1, name: "Test", email: "test@example.com" }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  });

  try {
    await httpGet<User>(
      "http://localhost:8016/users/1",
      UserSchema,
      { headers: { "Authorization": "Bearer test-token" } }
    );

    assertEquals(receivedAuth, "Bearer test-token");
  } finally {
    await server.shutdown();
  }
});

// ============================================================================
// Resilience Pattern Tests
// ============================================================================

Deno.test("withRetry - success on first attempt", async () => {
  const server = startMockServer(8017, () => {
    return new Response(
      JSON.stringify({ id: 1, name: "Test", email: "test@example.com" }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  });

  try {
    let attempts = 0;
    const result = await withRetry(
      async () => {
        attempts++;
        return await httpGet<User>("http://localhost:8017/users/1", UserSchema);
      },
      { maxAttempts: 3 }
    );

    assertEquals(result.ok, true);
    assertEquals(attempts, 1); // Should succeed on first try
  } finally {
    await server.shutdown();
  }
});

Deno.test("withRetry - success after failures", async () => {
  let callCount = 0;
  const server = startMockServer(8018, () => {
    callCount++;
    if (callCount < 3) {
      return new Response("Temporary error", { status: 500 });
    }
    return new Response(
      JSON.stringify({ id: 1, name: "Test", email: "test@example.com" }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  });

  try {
    const result = await withRetry(
      async () => {
        return await httpGet<User>("http://localhost:8018/users/1", UserSchema);
      },
      {
        maxAttempts: 5,
        initialDelayMs: 10, // Short delay for tests
      }
    );

    assertEquals(result.ok, true);
    assertEquals(callCount, 3); // Should succeed on third attempt
  } finally {
    await server.shutdown();
  }
});

Deno.test("withRetry - exhausts attempts", async () => {
  const server = startMockServer(8019, () => {
    return new Response("Always fails", { status: 500 });
  });

  try {
    let attempts = 0;
    const result = await withRetry(
      async () => {
        attempts++;
        return await httpGet<User>("http://localhost:8019/users/1", UserSchema);
      },
      {
        maxAttempts: 3,
        initialDelayMs: 10,
      }
    );

    assertEquals(result.ok, false);
    assertEquals(attempts, 3); // Should attempt exactly 3 times
  } finally {
    await server.shutdown();
  }
});

Deno.test("withRetry - shouldRetry predicate", async () => {
  let attempts = 0;
  const server = startMockServer(8020, () => {
    return new Response("Not found", { status: 404 });
  });

  try {
    const result = await withRetry(
      async () => {
        attempts++;
        return await httpGet<User>("http://localhost:8020/users/999", UserSchema);
      },
      {
        maxAttempts: 3,
        shouldRetry: (err) => {
          // Don't retry 404 errors
          return !(err.type === "http_error" && err.status === 404);
        },
      }
    );

    assertEquals(result.ok, false);
    assertEquals(attempts, 1); // Should not retry 404
  } finally {
    await server.shutdown();
  }
});

// ============================================================================
// Circuit Breaker Tests
// ============================================================================

Deno.test("createCircuitBreaker - closed state allows requests", async () => {
  const server = startMockServer(8031, () => {
    return new Response(
      JSON.stringify({ id: 1, name: "Test", email: "test@example.com" }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  });

  try {
    const breaker = createCircuitBreaker({ failureThreshold: 3 });

    const result = await breaker.execute(() =>
      httpGet<User>("http://localhost:8031/users/1", UserSchema)
    );

    assertEquals(result.ok, true);
    assertEquals(breaker.getState(), "closed");
  } finally {
    await server.shutdown();
  }
});

Deno.test("createCircuitBreaker - opens after threshold failures", async () => {
  const server = startMockServer(8022, () => {
    return new Response("Server error", { status: 500 });
  });

  try {
    const breaker = createCircuitBreaker({
      failureThreshold: 3,
      timeoutMs: 10000,
    });

    // First 3 failures should open the circuit
    for (let i = 0; i < 3; i++) {
      const result = await breaker.execute(() =>
        httpGet<User>("http://localhost:8022/users/1", UserSchema)
      );
      assertEquals(result.ok, false);
    }

    assertEquals(breaker.getState(), "open");

    // Next request should be rejected immediately
    const result = await breaker.execute(() =>
      httpGet<User>("http://localhost:8022/users/1", UserSchema)
    );

    assertEquals(result.ok, false);
    if (!result.ok) {
      const error = result.error as NetworkError | { type: "circuit_open"; message: string };
      if (error.type === "circuit_open") {
        assertEquals(error.type, "circuit_open");
      }
    }
  } finally {
    await server.shutdown();
  }
});

Deno.test("createCircuitBreaker - half-open after timeout", async () => {
  let callCount = 0;
  const server = startMockServer(8023, () => {
    callCount++;
    if (callCount <= 3) {
      return new Response("Server error", { status: 500 });
    }
    return new Response(
      JSON.stringify({ id: 1, name: "Test", email: "test@example.com" }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  });

  try {
    const breaker = createCircuitBreaker({
      failureThreshold: 3,
      successThreshold: 2,
      timeoutMs: 100, // Very short timeout for testing
    });

    // Trigger 3 failures to open circuit
    for (let i = 0; i < 3; i++) {
      await breaker.execute(() =>
        httpGet<User>("http://localhost:8023/users/1", UserSchema)
      );
    }

    assertEquals(breaker.getState(), "open");

    // Wait for timeout to allow half-open
    await new Promise((resolve) => setTimeout(resolve, 150));

    // Next request should transition to half-open
    const result = await breaker.execute(() =>
      httpGet<User>("http://localhost:8023/users/1", UserSchema)
    );

    assertEquals(result.ok, true);
    assertEquals(breaker.getState(), "half_open");
  } finally {
    await server.shutdown();
  }
});

Deno.test("createCircuitBreaker - closes after success threshold", async () => {
  let callCount = 0;
  const server = startMockServer(8024, () => {
    callCount++;
    if (callCount <= 3) {
      return new Response("Server error", { status: 500 });
    }
    return new Response(
      JSON.stringify({ id: 1, name: "Test", email: "test@example.com" }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  });

  try {
    const breaker = createCircuitBreaker({
      failureThreshold: 3,
      successThreshold: 2,
      timeoutMs: 100,
    });

    // Open the circuit
    for (let i = 0; i < 3; i++) {
      await breaker.execute(() =>
        httpGet<User>("http://localhost:8024/users/1", UserSchema)
      );
    }

    // Wait for half-open
    await new Promise((resolve) => setTimeout(resolve, 150));

    // Two successful requests should close the circuit
    await breaker.execute(() =>
      httpGet<User>("http://localhost:8024/users/1", UserSchema)
    );
    await breaker.execute(() =>
      httpGet<User>("http://localhost:8024/users/1", UserSchema)
    );

    assertEquals(breaker.getState(), "closed");
  } finally {
    await server.shutdown();
  }
});

// ============================================================================
// Fallback Tests
// ============================================================================

Deno.test("withFallback - uses primary on success", async () => {
  const server = startMockServer(8025, () => {
    return new Response(
      JSON.stringify({ id: 1, name: "Primary", email: "primary@example.com" }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  });

  try {
    const result = await withFallback(
      httpGet<User>("http://localhost:8025/users/1", UserSchema),
      Promise.resolve(
        Result.ok({ id: 2, name: "Fallback", email: "fallback@example.com" })
      )
    );

    assertEquals(result.ok, true);
    if (result.ok) {
      assertEquals(result.value.name, "Primary");
    }
  } finally {
    await server.shutdown();
  }
});

Deno.test("withFallback - uses fallback on primary failure", async () => {
  const server = startMockServer(8026, () => {
    return new Response("Server error", { status: 500 });
  });

  try {
    const result = await withFallback(
      httpGet<User>("http://localhost:8026/users/1", UserSchema),
      Promise.resolve(
        Result.ok({ id: 2, name: "Fallback", email: "fallback@example.com" })
      )
    );

    assertEquals(result.ok, true);
    if (result.ok) {
      assertEquals(result.value.name, "Fallback");
    }
  } finally {
    await server.shutdown();
  }
});

// ============================================================================
// Timeout Tests
// ============================================================================

Deno.test("withTimeout - completes within timeout", async () => {
  const server = startMockServer(8027, async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
    return new Response(
      JSON.stringify({ id: 1, name: "Test", email: "test@example.com" }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  });

  try {
    const result = await withTimeout(
      httpGet<User>("http://localhost:8027/users/1", UserSchema),
      1000,
      "test-service"
    );

    assertEquals(result.ok, true);
  } finally {
    await server.shutdown();
  }
});

Deno.test("withTimeout - exceeds timeout", async () => {
  const server = startMockServer(8028, async () => {
    await new Promise((resolve) => setTimeout(resolve, 200));
    return new Response(
      JSON.stringify({ id: 1, name: "Test", email: "test@example.com" }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  });

  try {
    const result = await withTimeout(
      httpGet<User>("http://localhost:8028/users/1", UserSchema),
      50, // Shorter than server delay
      "test-service"
    );

    assertEquals(result.ok, false);
    if (!result.ok) {
      assertEquals(result.error.type, "timeout");
      if (result.error.type === "timeout") {
        assertEquals(result.error.ms, 50);
        assertEquals(result.error.url, "test-service");
      }
    }
  } finally {
    await server.shutdown();
  }
});

// ============================================================================
// Pattern Composition Tests
// ============================================================================

Deno.test("composition - retry with circuit breaker", async () => {
  let callCount = 0;
  const server = startMockServer(8029, () => {
    callCount++;
    if (callCount <= 2) {
      return new Response("Temporary error", { status: 500 });
    }
    return new Response(
      JSON.stringify({ id: 1, name: "Test", email: "test@example.com" }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  });

  try {
    const breaker = createCircuitBreaker({
      failureThreshold: 5,
      timeoutMs: 10000,
    });

    const result = await withRetry(
      () =>
        breaker.execute(() =>
          httpGet<User>("http://localhost:8029/users/1", UserSchema)
        ),
      {
        maxAttempts: 5,
        initialDelayMs: 10,
      }
    );

    assertEquals(result.ok, true);
    assertEquals(breaker.getState(), "closed");
  } finally {
    await server.shutdown();
  }
});

Deno.test("composition - retry with fallback", async () => {
  let attempts = 0;
  const server = startMockServer(8030, () => {
    attempts++;
    return new Response("Always fails", { status: 500 });
  });

  try {
    const result = await withRetry(
      async () => {
        return await withFallback(
          httpGet<User>("http://localhost:8030/users/1", UserSchema),
          Promise.resolve(
            Result.ok({
              id: 999,
              name: "Fallback",
              email: "fallback@example.com",
            })
          )
        );
      },
      {
        maxAttempts: 3,
        initialDelayMs: 10,
      }
    );

    // Should succeed immediately via fallback without retries
    assertEquals(result.ok, true);
    if (result.ok) {
      assertEquals(result.value.name, "Fallback");
    }
    assertEquals(attempts, 1); // Only one attempt since fallback succeeds
  } finally {
    await server.shutdown();
  }
});
