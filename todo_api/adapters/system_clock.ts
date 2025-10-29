import type { Result } from "../../packages/lfts-type-runtime/mod.ts";
import type { ClockError, ClockPort } from "../ports/clock.ts";
import type { UnixTime } from "../domain/types.ts";

const ok = <T, E>(value: T): Result<T, E> => ({ ok: true, value });

export function createSystemClock(): ClockPort {
  return {
    now(): Result<UnixTime, ClockError> {
      const value = Date.now() as UnixTime;
      return ok(value);
    },
  };
}

export type TestClock = Readonly<{
  readonly clock: ClockPort;
  readonly set: (time: UnixTime) => void;
}>;

export function createTestClock(initial: UnixTime): TestClock {
  let current = initial;

  const clock: ClockPort = {
    now(): Result<UnixTime, ClockError> {
      return ok(current);
    },
  };

  const set = (time: UnixTime): void => {
    current = time;
  };

  return { clock, set };
}
