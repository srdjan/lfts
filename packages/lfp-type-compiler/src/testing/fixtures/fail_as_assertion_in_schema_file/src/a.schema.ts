import { typeOf } from "../../../../packages/lfp-type-runtime/mod.ts";
type U = { x: number };
const a = 1 as number; // should fail because file has typeOf
export const U$ = typeOf<U>();
