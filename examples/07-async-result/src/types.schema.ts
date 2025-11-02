import { typeOf } from "../../../packages/lfts-type-runtime/mod.ts";
import type { LoadUserResult, User } from "./types.ts";

export const User$ = typeOf<User>();
export const LoadUserResult$ = typeOf<LoadUserResult>();
