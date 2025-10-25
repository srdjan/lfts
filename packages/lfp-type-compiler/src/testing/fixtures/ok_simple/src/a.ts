import { typeOf } from "../../../../packages/lfp-type-runtime/mod.ts";

/** @port */
export interface ClockPort { now(): number; }

export type UserId = string & { readonly __brand: "UserId" };
export type User = Readonly<{ id: UserId; name: string; }>;

export const User$ = typeOf<User>();
