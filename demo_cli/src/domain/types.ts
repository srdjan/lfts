import { typeOf } from "../../../packages/lfp-type-runtime/mod.ts";

/** Structural brand */
export type TaskId = string & { readonly __brand: "TaskId" };

/** Core data model (canonical subset: type alias, readonly props, optionals, no nulls) */
export type Task = Readonly<{
  readonly id: TaskId;
  readonly name: string;
  readonly completed?: boolean;
  readonly createdAt: number;
}>;

export type TaskList = Readonly<{
  readonly tasks: readonly Task[];
}>;

export const Task$ = typeOf<Task>();
export const TaskList$ = typeOf<TaskList>();
