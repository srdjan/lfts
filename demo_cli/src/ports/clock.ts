/** @port */
export interface ClockPort {
  now(): number;
}

/** trivial adapter */
export function systemClock(): ClockPort {
  return { now: () => Date.now() };
}
