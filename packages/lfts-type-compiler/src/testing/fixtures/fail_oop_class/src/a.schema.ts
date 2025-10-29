import { typeOf } from "../../../../packages/lfts-type-runtime/mod.ts";

export class Thing {
  x = 1;
} // should be caught by gate (LFP000x)
