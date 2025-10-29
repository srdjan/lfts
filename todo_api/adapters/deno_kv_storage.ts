import type { Result } from "../../packages/lfts-type-runtime/mod.ts";
import type { Task, TaskId, TaskList } from "../domain/types.ts";
import type { StorageError, StoragePort } from "../ports/storage.ts";

const TASK_KEY_PREFIX = ["task"] as const;

const ok = <T, E>(value: T): Result<T, E> => ({ ok: true, value });
const err = <T, E>(error: E): Result<T, E> => ({ ok: false, error });

function taskKey(id: TaskId): readonly [string, TaskId] {
  return [TASK_KEY_PREFIX[0], id] as const;
}

export type DenoKvStorageDependencies = Readonly<{
  readonly kv: Deno.Kv;
}>;

export function createDenoKvStoragePort(
  deps: DenoKvStorageDependencies,
): StoragePort {
  const kv = deps.kv;

  return {
    async save(task: Task) {
      try {
        const result = await kv.atomic()
          .check({ key: taskKey(task.id), versionstamp: null })
          .set(taskKey(task.id), task)
          .commit();
        if (!result.ok) {
          return err(conflict(task.id));
        }
        return ok(task);
      } catch (error) {
        return err(unavailable(error));
      }
    },

    async update(task: Task) {
      try {
        const current = await kv.get<Task>(taskKey(task.id));
        if (current.value === null) {
          return err(notFound(task.id));
        }
        const commit = await kv.atomic()
          .check(current as Deno.KvEntry<Task>)
          .set(taskKey(task.id), task)
          .commit();
        if (!commit.ok) {
          return err(conflict(task.id));
        }
        return ok(task);
      } catch (error) {
        return err(unavailable(error));
      }
    },

    async findById(id: TaskId) {
      try {
        const entry = await kv.get<Task>(taskKey(id));
        return ok(entry.value ?? undefined);
      } catch (error) {
        return err(unavailable(error));
      }
    },

    async list() {
      try {
        const tasks: Task[] = [];
        for await (const entry of kv.list<Task>({ prefix: TASK_KEY_PREFIX })) {
          if (entry.value) {
            tasks.push(entry.value);
          }
        }
        const list: TaskList = { tasks: tasks as readonly Task[] };
        return ok(list);
      } catch (error) {
        return err(unavailable(error));
      }
    },

    async delete(id: TaskId) {
      try {
        const current = await kv.get<Task>(taskKey(id));
        if (current.value === null) {
          return ok(false);
        }
        const commit = await kv.atomic()
          .check(current as Deno.KvEntry<Task>)
          .delete(taskKey(id))
          .commit();
        if (!commit.ok) {
          return err(conflict(id));
        }
        return ok(true);
      } catch (error) {
        return err(unavailable(error));
      }
    },
  } satisfies StoragePort;
}

function conflict(taskId: TaskId): StorageError {
  return { type: "storage_conflict", taskId };
}

function notFound(taskId: TaskId): StorageError {
  return { type: "storage_not_found", taskId };
}

function unavailable(error: unknown): StorageError {
  return {
    type: "storage_unavailable",
    message: describeError(error),
  };
}

function describeError(error: unknown): string {
  if (error instanceof Error && typeof error.message === "string") {
    return error.message;
  }
  return "unexpected storage failure";
}
