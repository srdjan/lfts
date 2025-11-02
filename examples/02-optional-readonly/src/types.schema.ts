// examples/02-optional-readonly/src/types.schema.ts
// Schema roots showcasing optional and readonly constructs.

import { typeOf } from "../../../packages/lfts-type-runtime/mod.ts";
import type { Address, UserProfile } from "./types.ts";

export const Address$ = typeOf<Address>();
export const UserProfile$ = typeOf<UserProfile>();
