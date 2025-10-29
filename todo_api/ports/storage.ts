import type { Result } from "../../packages/lfts-type-runtime/mod.ts";
import type { Task, TaskId, TaskList } from "../domain/types.ts";

export type StorageError =
  | Readonly<{ readonly type: "storage_unavailable"; readonly message: string }>
  | Readonly<{ readonly type: "storage_conflict"; readonly taskId: TaskId }>
  | Readonly<{ readonly type: "storage_not_found"; readonly taskId: TaskId }>;

export interface StoragePort {
  save(task: Task): Promise<Result<Task, StorageError>>;
  update(task: Task): Promise<Result<Task, StorageError>>;
  findById(id: TaskId): Promise<Result<Task | undefined, StorageError>>;
  list(): Promise<Result<TaskList, StorageError>>;
  delete(id: TaskId): Promise<Result<boolean, StorageError>>;
}
