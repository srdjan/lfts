import { typeOf } from "../../../../packages/lfp-type-runtime/mod.ts";

export type A = { type: "foo"; x: number };
export type B = { kind: "bar"; y: number }; // different tag key -> fallback to UNION
export type U = A | B;
export const U$ = typeOf<U>();
