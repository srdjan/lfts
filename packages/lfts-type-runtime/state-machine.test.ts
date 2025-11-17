// packages/lfts-type-runtime/state-machine.test.ts
// Comprehensive tests for finite state machine builder

import { assertEquals } from "jsr:@std/assert@1";
import {
  createStateMachine,
  stateMachine,
  type TransitionError,
} from "./state-machine.ts";

// ============================================================================
// Test State Types
// ============================================================================

type TrafficLight =
  | { type: "red"; duration: number }
  | { type: "yellow"; duration: number }
  | { type: "green"; duration: number };

type OrderState =
  | { type: "draft"; items: string[] }
  | { type: "pending"; submittedAt: number }
  | { type: "approved"; approvedBy: string; approvedAt: number }
  | { type: "shipped"; trackingNumber: string }
  | { type: "cancelled"; reason: string };

type CircuitState =
  | { type: "closed"; failureCount: number }
  | { type: "open"; openedAt: number }
  | { type: "half_open"; successCount: number };

// ============================================================================
// createStateMachine() Tests
// ============================================================================

Deno.test("createStateMachine: successful transition", () => {
  const fsm = createStateMachine<TrafficLight>({
    initialState: { type: "red", duration: 30000 },
    transitions: {
      next: {
        from: "red",
        to: "green",
        transform: () => ({ type: "green", duration: 45000 }),
      },
    },
  });

  assertEquals(fsm.getStateType(), "red");

  const result = fsm.transition("next");
  assertEquals(result.ok, true);
  if (result.ok) {
    assertEquals(result.value.type, "green");
    assertEquals(result.value.duration, 45000);
  }

  assertEquals(fsm.getStateType(), "green");
});

Deno.test("createStateMachine: invalid transition - unknown event", () => {
  const fsm = createStateMachine<TrafficLight>({
    initialState: { type: "red", duration: 30000 },
    transitions: {},
  });

  const result = fsm.transition("unknown");
  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.error.type, "invalid_transition");
    assertEquals(result.error.event, "unknown");
  }
});

Deno.test("createStateMachine: invalid transition - wrong state", () => {
  const fsm = createStateMachine<TrafficLight>({
    initialState: { type: "red", duration: 30000 },
    transitions: {
      next: {
        from: "green", // Wrong source state
        to: "yellow",
        transform: () => ({ type: "yellow", duration: 5000 }),
      },
    },
  });

  const result = fsm.transition("next");
  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.error.type, "invalid_transition");
    assertEquals(result.error.from, "red");
    assertEquals(result.error.event, "next");
  }
});

Deno.test("createStateMachine: guard blocks transition", () => {
  const fsm = createStateMachine<OrderState>({
    initialState: { type: "draft", items: [] },
    transitions: {
      submit: {
        from: "draft",
        to: "pending",
        guard: (state) => (state.type === "draft" && state.items.length > 0), // Must have items
        transform: (state) => ({
          type: "pending",
          submittedAt: Date.now(),
        }),
      },
    },
  });

  // Try to submit empty order
  const result = fsm.transition("submit");
  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.error.type, "guard_failed");
  }
});

Deno.test("createStateMachine: guard allows transition", () => {
  const fsm = createStateMachine<OrderState>({
    initialState: { type: "draft", items: ["item1"] },
    transitions: {
      submit: {
        from: "draft",
        to: "pending",
        guard: (state) => (state.type === "draft" && state.items.length > 0),
        transform: (state) => ({
          type: "pending",
          submittedAt: Date.now(),
        }),
      },
    },
  });

  const result = fsm.transition("submit");
  assertEquals(result.ok, true);
  if (result.ok) {
    assertEquals(result.value.type, "pending");
  }
});

Deno.test("createStateMachine: transition with payload", () => {
  const fsm = createStateMachine<OrderState>({
    initialState: { type: "pending", submittedAt: Date.now() },
    transitions: {
      approve: {
        from: "pending",
        to: "approved",
        transform: (state, approver: string) => ({
          type: "approved",
          approvedBy: approver,
          approvedAt: Date.now(),
        }),
      },
    },
  });

  const result = fsm.transition<string>("approve", "admin@example.com");
  assertEquals(result.ok, true);
  if (result.ok && result.value.type === "approved") {
    assertEquals(result.value.type, "approved");
    assertEquals(result.value.approvedBy, "admin@example.com");
  }
});

Deno.test("createStateMachine: can() checks valid transitions", () => {
  const fsm = createStateMachine<TrafficLight>({
    initialState: { type: "red", duration: 30000 },
    transitions: {
      next: {
        from: "red",
        to: "green",
        transform: () => ({ type: "green", duration: 45000 }),
      },
      emergency: {
        from: "red",
        to: "yellow",
        transform: () => ({ type: "yellow", duration: 5000 }),
      },
    },
  });

  assertEquals(fsm.can("next"), true);
  assertEquals(fsm.can("emergency"), true);
  assertEquals(fsm.can("unknown"), false);

  // After transition
  fsm.transition("next");
  assertEquals(fsm.can("next"), false); // Can't transition from green
});

Deno.test("createStateMachine: getValidEvents() returns valid events", () => {
  const fsm = createStateMachine<TrafficLight>({
    initialState: { type: "red", duration: 30000 },
    transitions: {
      next: {
        from: "red",
        to: "green",
        transform: () => ({ type: "green", duration: 45000 }),
      },
      emergency: {
        from: "red",
        to: "yellow",
        transform: () => ({ type: "yellow", duration: 5000 }),
      },
      skip: {
        from: "green",
        to: "yellow",
        transform: () => ({ type: "yellow", duration: 5000 }),
      },
    },
  });

  const events = fsm.getValidEvents();
  assertEquals(events.length, 2);
  assertEquals(events.includes("next"), true);
  assertEquals(events.includes("emergency"), true);
  assertEquals(events.includes("skip"), false);
});

Deno.test("createStateMachine: reset() returns to initial state", () => {
  const fsm = createStateMachine<TrafficLight>({
    initialState: { type: "red", duration: 30000 },
    transitions: {
      next: {
        from: "red",
        to: "green",
        transform: () => ({ type: "green", duration: 45000 }),
      },
    },
  });

  fsm.transition("next");
  assertEquals(fsm.getStateType(), "green");

  fsm.reset();
  assertEquals(fsm.getStateType(), "red");
  assertEquals(fsm.getState().duration, 30000);
});

// ============================================================================
// stateMachine() Builder API Tests
// ============================================================================

Deno.test("stateMachine: builder creates valid FSM", () => {
  const fsm = stateMachine<TrafficLight>({ type: "red", duration: 30000 })
    .transition("toGreen", "red", "green", () => ({
      type: "green",
      duration: 45000,
    }))
    .transition("toYellow", "green", "yellow", () => ({
      type: "yellow",
      duration: 5000,
    }))
    .transition("toRed", "yellow", "red", () => ({
      type: "red",
      duration: 30000,
    }))
    .build();

  assertEquals(fsm.getStateType(), "red");

  // Red -> Green
  fsm.transition("toGreen");
  assertEquals(fsm.getStateType(), "green");

  // Green -> Yellow
  fsm.transition("toYellow");
  assertEquals(fsm.getStateType(), "yellow");

  // Yellow -> Red
  fsm.transition("toRed");
  assertEquals(fsm.getStateType(), "red");
});

Deno.test("stateMachine: builder with guards", () => {
  const fsm = stateMachine<OrderState>({ type: "draft", items: [] })
    .transition(
      "submit",
      "draft",
      "pending",
      (state) => ({ type: "pending", submittedAt: Date.now() }),
      (state) => (state.type === "draft" && state.items.length > 0)
    )
    .build();

  const result = fsm.transition("submit");
  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.error.type, "guard_failed");
  }
});

// ============================================================================
// Complex State Machine Tests
// ============================================================================

Deno.test("complex: circuit breaker pattern", () => {
  const breaker = createStateMachine<CircuitState>({
    initialState: { type: "closed", failureCount: 0 },
    transitions: {
      fail: {
        from: "closed",
        to: "open",
        guard: (state) => (state.type === "closed" && state.failureCount >= 4), // Open after 5 failures
        transform: (state) => ({ type: "open", openedAt: Date.now() }),
      },
      recordFailure: {
        from: "closed",
        to: "closed",
        transform: (state) => ({
          type: "closed",
          failureCount: state.type === "closed" ? state.failureCount + 1 : 0,
        }),
      },
      halfOpen: {
        from: "open",
        to: "half_open",
        transform: () => ({ type: "half_open", successCount: 0 }),
      },
      success: {
        from: "half_open",
        to: "closed",
        guard: (state) => (state.type === "half_open" && state.successCount >= 1), // Close after 2 successes
        transform: () => ({ type: "closed", failureCount: 0 }),
      },
      recordSuccess: {
        from: "half_open",
        to: "half_open",
        transform: (state) => ({
          type: "half_open",
          successCount: state.type === "half_open" ? state.successCount + 1 : 0,
        }),
      },
      failAgain: {
        from: "half_open",
        to: "open",
        transform: () => ({ type: "open", openedAt: Date.now() }),
      },
    },
  });

  // Closed state - record failures
  for (let i = 0; i < 4; i++) {
    breaker.transition("recordFailure");
  }
  assertEquals(breaker.getStateType(), "closed");
  const closedState = breaker.getState();
  if (closedState.type === "closed") {
    assertEquals(closedState.failureCount, 4);
  }

  // 5th failure opens circuit
  const openResult = breaker.transition("fail");
  assertEquals(openResult.ok, true);
  assertEquals(breaker.getStateType(), "open");

  // Move to half-open
  breaker.transition("halfOpen");
  assertEquals(breaker.getStateType(), "half_open");

  // Record successes
  breaker.transition("recordSuccess");
  assertEquals(breaker.getStateType(), "half_open");

  // 2nd success closes circuit
  const closeResult = breaker.transition("success");
  assertEquals(closeResult.ok, true);
  assertEquals(breaker.getStateType(), "closed");
});

Deno.test("complex: order workflow with cancellation", () => {
  const order = stateMachine<OrderState>({
    type: "draft",
    items: ["item1"],
  })
    .transition("submit", "draft", "pending", (state) => ({
      type: "pending",
      submittedAt: Date.now(),
    }))
    .transition(
      "approve",
      "pending",
      "approved",
      (state, approver: string) => ({
        type: "approved",
        approvedBy: approver,
        approvedAt: Date.now(),
      })
    )
    .transition(
      "ship",
      "approved",
      "shipped",
      (state, trackingNumber: string) => ({
        type: "shipped",
        trackingNumber,
      })
    )
    .transition(
      "cancel",
      "draft",
      "cancelled",
      (state, reason: string) => ({
        type: "cancelled",
        reason,
      })
    )
    .transition(
      "cancel",
      "pending",
      "cancelled",
      (state, reason: string) => ({
        type: "cancelled",
        reason,
      })
    )
    .build();

  // Submit order
  order.transition("submit");
  assertEquals(order.getStateType(), "pending");

  // Approve order
  order.transition<string>("approve", "admin@example.com");
  assertEquals(order.getStateType(), "approved");

  // Ship order
  order.transition<string>("ship", "TRACK123");
  assertEquals(order.getStateType(), "shipped");
  const shippedState = order.getState();
  if (shippedState.type === "shipped") {
    assertEquals(shippedState.trackingNumber, "TRACK123");
  }
});

Deno.test("complex: cancellation from different states", () => {
  const order1 = stateMachine<OrderState>({
    type: "draft",
    items: [],
  })
    .transition(
      "cancel",
      "draft",
      "cancelled",
      (state, reason: string) => ({
        type: "cancelled",
        reason,
      })
    )
    .build();

  const result = order1.transition<string>("cancel", "Out of stock");
  assertEquals(result.ok, true);
  if (result.ok && result.value.type === "cancelled") {
    assertEquals(result.value.type, "cancelled");
    assertEquals(result.value.reason, "Out of stock");
  }
});

// ============================================================================
// Error Handling Tests
// ============================================================================

Deno.test("error: transform throws exception", () => {
  const fsm = createStateMachine<TrafficLight>({
    initialState: { type: "red", duration: 30000 },
    transitions: {
      crash: {
        from: "red",
        to: "green",
        transform: () => {
          throw new Error("Transform failed");
        },
      },
    },
  });

  const result = fsm.transition("crash");
  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.error.type, "transform_failed");
  }
});

Deno.test("error: transform returns wrong state type", () => {
  const fsm = createStateMachine<TrafficLight>({
    initialState: { type: "red", duration: 30000 },
    transitions: {
      bad: {
        from: "red",
        to: "green",
        transform: () => ({ type: "yellow", duration: 5000 }) as any, // Wrong type!
      },
    },
  });

  const result = fsm.transition("bad");
  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.error.type, "transform_failed");
  }
});
