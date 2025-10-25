import { typeOf } from "../../../../packages/lfp-type-runtime/mod.ts";
interface User { name: string } // not a port
export const U$ = typeOf<User>(); // should error
