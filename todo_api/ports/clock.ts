import type { Result } from "../../packages/lfts-type-runtime/mod.ts";
import type { UnixTime } from "../domain/types.ts";

export type ClockError = Readonly<
  { readonly type: "clock_failure"; readonly message: string }
>;

export interface ClockPort {
  now(): Result<UnixTime, ClockError>;
}
