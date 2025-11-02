// examples/09-mini-application/src/types.ts
// Mini-application that combines multiple concepts from previous lessons.

export type TaskId = string & { readonly __brand: "TaskId" };

export type Task = {
  readonly id: TaskId;
  readonly title: string;
  readonly completed: boolean;
  readonly tags?: readonly string[];
};

export type Command =
  | { readonly type: "toggle"; readonly id: TaskId }
  | { readonly type: "add"; readonly title: string };

export type CommandError =
  | { readonly type: "not_found"; readonly message: string }
  | { readonly type: "invalid"; readonly message: string };

export type CommandResult =
  | { readonly ok: true; readonly value: readonly Task[] }
  | { readonly ok: false; readonly error: CommandError };

/** @port */
export interface TaskStorePort {
  load(): readonly Task[];
  save(tasks: readonly Task[]): void;
}

/** @port */
export interface ClockPort {
  now(): number;
}
