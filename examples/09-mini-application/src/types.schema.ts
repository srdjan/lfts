import { typeOf } from "../../../packages/lfts-type-runtime/mod.ts";
import { enc } from "../../../packages/lfts-type-spec/src/mod.ts";
import type { Command, CommandResult, Task } from "./types.ts";

export const Task$ = typeOf<Task>();
export const TaskList$ = enc.arr(Task$);
export const Command$ = typeOf<Command>();
export const CommandResult$ = typeOf<CommandResult>();
