// examples/06-ports/src/types.ts
// Domain model for demonstrating the ports/capabilities pattern.

export type Task = {
  readonly id: string;
  readonly title: string;
  readonly completed: boolean;
};

/** @port */
export interface TaskStorePort {
  load(): readonly Task[];
  save(tasks: readonly Task[]): void;
}

/** @port */
export interface ClockPort {
  now(): number;
}
