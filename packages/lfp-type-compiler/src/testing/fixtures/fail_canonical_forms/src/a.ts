import { typeOf } from "../../../../packages/lfp-type-runtime/mod.ts";
type U = {
  a: Array<string>;
  b: ReadonlyArray<number>;
  c: Readonly<{x: number}>;
  d: true | false;
};
export const U$ = typeOf<U>();
