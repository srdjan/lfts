import { typeOf } from "../../../../packages/lfp-type-runtime/mod.ts";
type UserId = string & Brand<"UserId">;
type User = { id: UserId };
export const U$ = typeOf<User>();
