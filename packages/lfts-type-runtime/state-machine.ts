/**
 * Generic finite state machine (FSM) builder for LFTS
 *
 * Provides a composable, type-safe state machine implementation using
 * discriminated union schemas as state definitions. Extracted from the
 * circuit breaker pattern in distributed.ts and generalized.
 *
 * @example
 * ```typescript
 * type OrderState =
 *   | { type: "draft"; items: string[] }
 *   | { type: "pending"; submittedAt: number }
 *   | { type: "approved"; approvedBy: string }
 *   | { type: "shipped"; trackingNumber: string };
 *
 * const orderFSM = createStateMachine<OrderState>({
 *   initialState: { type: "draft", items: [] },
 *   transitions: {
 *     submit: {
 *       from: "draft",
 *       to: "pending",
 *       transform: (state) => ({
 *         type: "pending",
 *         submittedAt: Date.now()
 *       })
 *     },
 *     approve: {
 *       from: "pending",
 *       to: "approved",
 *       transform: (state, approver: string) => ({
 *         type: "approved",
 *         approvedBy: approver
 *       })
 *     }
 *   }
 * });
 *
 * const result = orderFSM.transition("approve", "admin@example.com");
 * ```
 *
 * @module state-machine
 * @since v0.11.0
 */

import type { Result } from "./mod.ts";

/**
 * State machine transition error types
 */
export type TransitionError =
  | {
      type: "invalid_transition";
      from: string;
      event: string;
      message: string;
    }
  | {
      type: "guard_failed";
      from: string;
      event: string;
      message: string;
    }
  | {
      type: "transform_failed";
      from: string;
      event: string;
      error: unknown;
    };

/**
 * State type constraint - all states must be discriminated unions with a `type` field
 */
export type StateWithType = { type: string };

/**
 * Transition definition for a specific event
 */
export type TransitionDef<TState extends StateWithType, TPayload = void> = {
  /** Source state type */
  from: TState["type"];

  /** Target state type */
  to: TState["type"];

  /** Optional guard function to check if transition is allowed */
  guard?: (state: TState, payload: TPayload) => boolean;

  /** Transform function to create the new state */
  transform: (state: TState, payload: TPayload) => TState;
};

/**
 * State machine configuration
 */
export type StateMachineConfig<TState extends StateWithType> = {
  /** Initial state */
  initialState: TState;

  /** Map of event names to transition definitions */
  transitions: Record<string, TransitionDef<TState, any>>;
};

/**
 * State machine instance
 */
export type StateMachine<TState extends StateWithType> = {
  /** Get current state */
  getState: () => TState;

  /** Get current state type */
  getStateType: () => TState["type"];

  /** Transition to a new state */
  transition: <TPayload = void>(
    event: string,
    payload?: TPayload
  ) => Result<TState, TransitionError>;

  /** Check if a transition is valid from current state */
  can: (event: string) => boolean;

  /** Get all valid events from current state */
  getValidEvents: () => string[];

  /** Reset to initial state */
  reset: () => void;
};

/**
 * Create a finite state machine with typed states and transitions
 *
 * States must be discriminated unions with a `type` field. Transitions
 * are defined as event names mapping to source/target states with
 * optional guards and transform functions.
 *
 * @template TState - Discriminated union type for all states
 *
 * @param config - State machine configuration
 *
 * @returns State machine instance
 *
 * @example
 * ```typescript
 * type TrafficLight =
 *   | { type: "red"; duration: number }
 *   | { type: "yellow"; duration: number }
 *   | { type: "green"; duration: number };
 *
 * const light = createStateMachine<TrafficLight>({
 *   initialState: { type: "red", duration: 30000 },
 *   transitions: {
 *     next: {
 *       from: "red",
 *       to: "green",
 *       transform: () => ({ type: "green", duration: 45000 })
 *     },
 *     // ... more transitions
 *   }
 * });
 *
 * const result = light.transition("next");
 * if (result.ok) {
 *   console.log("Now:", result.value.type);
 * }
 * ```
 */
export function createStateMachine<TState extends StateWithType>(
  config: StateMachineConfig<TState>
): StateMachine<TState> {
  let currentState: TState = config.initialState;

  return {
    getState: () => currentState,

    getStateType: () => currentState.type,

    transition: <TPayload = void>(
      event: string,
      payload?: TPayload
    ): Result<TState, TransitionError> => {
      const transition = config.transitions[event];

      if (!transition) {
        return {
          ok: false,
          error: {
            type: "invalid_transition",
            from: currentState.type,
            event,
            message: `No transition defined for event '${event}'`,
          },
        };
      }

      // Check if transition is from current state
      if (transition.from !== currentState.type) {
        return {
          ok: false,
          error: {
            type: "invalid_transition",
            from: currentState.type,
            event,
            message:
              `Cannot transition from '${currentState.type}' to '${transition.to}' via '${event}' (expected from '${transition.from}')`,
          },
        };
      }

      // Check guard if present
      if (transition.guard && !transition.guard(currentState, payload as TPayload)) {
        return {
          ok: false,
          error: {
            type: "guard_failed",
            from: currentState.type,
            event,
            message: `Guard failed for transition '${event}' from '${currentState.type}'`,
          },
        };
      }

      // Execute transform
      try {
        const newState = transition.transform(currentState, payload as TPayload);

        // Verify new state has correct type
        if (newState.type !== transition.to) {
          return {
            ok: false,
            error: {
              type: "transform_failed",
              from: currentState.type,
              event,
              error:
                `Transform returned state type '${newState.type}' but expected '${transition.to}'`,
            },
          };
        }

        currentState = newState;
        return { ok: true, value: currentState };
      } catch (err) {
        return {
          ok: false,
          error: {
            type: "transform_failed",
            from: currentState.type,
            event,
            error: err,
          },
        };
      }
    },

    can: (event: string): boolean => {
      const transition = config.transitions[event];
      if (!transition) return false;
      if (transition.from !== currentState.type) return false;
      if (transition.guard && !transition.guard(currentState, undefined as any)) {
        return false;
      }
      return true;
    },

    getValidEvents: (): string[] => {
      return Object.keys(config.transitions).filter((event) => {
        const transition = config.transitions[event];
        return transition.from === currentState.type;
      });
    },

    reset: () => {
      currentState = config.initialState;
    },
  };
}

/**
 * Builder API for constructing state machines fluently
 */
export type StateMachineBuilder<TState extends StateWithType> = {
  /** Add a transition */
  transition: <TPayload = void>(
    event: string,
    from: TState["type"],
    to: TState["type"],
    transform: (state: TState, payload: TPayload) => TState,
    guard?: (state: TState, payload: TPayload) => boolean
  ) => StateMachineBuilder<TState>;

  /** Build the state machine */
  build: () => StateMachine<TState>;
};

/**
 * Create a state machine using a fluent builder API
 *
 * @template TState - Discriminated union type for all states
 *
 * @param initialState - Initial state
 *
 * @returns State machine builder
 *
 * @example
 * ```typescript
 * const orderFSM = stateMachine<OrderState>({ type: "draft", items: [] })
 *   .transition("submit", "draft", "pending", (state) => ({
 *     type: "pending",
 *     submittedAt: Date.now()
 *   }))
 *   .transition("approve", "pending", "approved", (state, approver: string) => ({
 *     type: "approved",
 *     approvedBy: approver
 *   }))
 *   .build();
 * ```
 */
export function stateMachine<TState extends StateWithType>(
  initialState: TState
): StateMachineBuilder<TState> {
  const transitions: Record<string, TransitionDef<TState, any>> = {};

  const builder: StateMachineBuilder<TState> = {
    transition: <TPayload = void>(
      event: string,
      from: TState["type"],
      to: TState["type"],
      transform: (state: TState, payload: TPayload) => TState,
      guard?: (state: TState, payload: TPayload) => boolean
    ) => {
      transitions[event] = {
        from,
        to,
        transform,
        guard,
      };
      return builder;
    },

    build: () => {
      return createStateMachine({ initialState, transitions });
    },
  };

  return builder;
}
