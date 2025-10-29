import { typeOf } from "../../../../packages/lfts-type-runtime/mod.ts";

/** @port */
export interface ClockPort {
  now(): number;
}

export type UserId = string & { readonly __brand: "UserId" };
export type User = { readonly id: UserId; readonly name: string };

export const User$ = typeOf<User>();
