import { typeOf } from "../../../../packages/lfp-type-runtime/mod.ts";

/** @port */
export interface ClockPort { now(): number; }

export type User = { name: string; clock: ClockPort }; // should error LFP1002
export const User$ = typeOf<User>();
