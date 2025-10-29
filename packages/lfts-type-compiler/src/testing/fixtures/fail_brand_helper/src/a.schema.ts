import { typeOf } from "../../../../packages/lfts-type-runtime/mod.ts";
type UserId = string & Brand<"UserId">;
type User = { id: UserId };
export const U$ = typeOf<User>();
