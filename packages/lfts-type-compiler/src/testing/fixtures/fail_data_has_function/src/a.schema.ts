import { typeOf } from "../../../../packages/lfts-type-runtime/mod.ts";

export type User = { name: string; format(): string }; // should error LFP1003
export const User$ = typeOf<User>();
