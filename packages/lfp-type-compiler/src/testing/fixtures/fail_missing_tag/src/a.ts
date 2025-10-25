import { typeOf } from "../../../../packages/lfp-type-runtime/mod.ts";

export type A = { type: "foo"; x: number };
export type B = { y: number }; // no tag
export type U = A | B;

export const U$ = typeOf<U>(); // should trigger LFP1006
