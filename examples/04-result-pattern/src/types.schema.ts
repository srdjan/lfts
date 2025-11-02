import { typeOf } from "../../../packages/lfts-type-runtime/mod.ts";
import type { AuthResult, Credentials } from "./types.ts";

export const Credentials$ = typeOf<Credentials>();
export const AuthResult$ = typeOf<AuthResult>();
