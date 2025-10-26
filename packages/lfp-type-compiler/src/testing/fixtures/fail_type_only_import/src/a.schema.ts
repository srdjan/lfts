import { typeOf } from "../../../../packages/lfp-type-runtime/mod.ts";
import { A } from "./types.ts"; // A used only in type position
export type U = A;
export const U$ = typeOf<U>();
