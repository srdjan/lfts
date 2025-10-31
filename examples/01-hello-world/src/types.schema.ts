// examples/01-hello-world/src/types.schema.ts
import type { User } from "./types.ts";

// Schema-root pattern: compiler generates User$ bytecode constant
export type UserSchema = User;
