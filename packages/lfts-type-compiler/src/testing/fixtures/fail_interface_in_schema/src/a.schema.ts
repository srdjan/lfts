import { typeOf } from "../../../../packages/lfts-type-runtime/mod.ts";
interface User {
  name: string;
} // not a port
export const U$ = typeOf<User>(); // should error
