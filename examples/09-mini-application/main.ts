import { Result, match, validatePort, validateSafe } from "../../packages/lfts-type-runtime/mod.ts";
import { Command$, CommandResult$, Task$, TaskList$ } from "./src/types.schema.ts";
import { ClockPort$, TaskStorePort$ } from "./src/ports.schema.ts";
import type { Command, CommandResult, Task, TaskId } from "./src/types.ts";

const PATH_PREFIXES = ["./", "../", "../../", "../../../", "../../../../", "../../../../../"];

const memoryStore = (() => {
  let cache: readonly Task[] = [];
  return {
    load: () => cache,
    save: (tasks: readonly Task[]) => {
      cache = tasks.slice();
    },
  };
})();

const mockClock = {
  now: () => Date.now(),
};

function makeTaskId(value: string): TaskId {
  return value as TaskId;
}

function applyCommand(tasks: readonly Task[], command: Command): CommandResult {
  return match(command, {
    add: ({ title }) => {
      if (!title.trim()) {
        return Result.err({ type: "invalid", message: "title is empty" });
      }
      const next: Task = {
        id: makeTaskId(`task-${crypto.randomUUID().slice(0, 6)}`),
        title,
        completed: false,
      };
      return Result.ok([...tasks, next] as const);
    },
    toggle: ({ id }) => {
      const index = tasks.findIndex((task) => task.id === id);
      if (index === -1) {
        return Result.err({ type: "not_found", message: `No task with id ${id}` });
      }
      const next = tasks.slice();
      const item = next[index];
      next[index] = { ...item, completed: !item.completed };
      return Result.ok(next as const);
    },
  });
}

async function main() {
  let tasksJson: unknown = null;
  for (const prefix of PATH_PREFIXES) {
    try {
      tasksJson = JSON.parse(await Deno.readTextFile(new URL(prefix + "data/tasks.json", import.meta.url)));
      break;
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) continue;
      throw error;
    }
  }
  if (tasksJson === null) throw new Deno.errors.NotFound("data/tasks.json");
  const initial = validateSafe(TaskList$, tasksJson);
  if (!initial.ok) {
    console.error("Invalid seed data", initial.error);
    return;
  }

  console.log("Port validation:");
  console.log(validatePort(TaskStorePort$, memoryStore));
  console.log(validatePort(ClockPort$, mockClock));

  memoryStore.save(initial.value);

  const commands: Command[] = [
    { type: "toggle", id: makeTaskId("task-1") },
    { type: "add", title: "Ship tutorial" },
  ];

  for (const cmd of commands) {
    const validated = validateSafe<Command>(Command$, cmd);
    if (!validated.ok) {
      console.error("Bad command", validated.error);
      continue;
    }

    const applied = applyCommand(memoryStore.load(), validated.value);
    console.log("\nCommand", cmd, "->", applied);

    const checked = validateSafe(CommandResult$, applied);
    if (!checked.ok) {
      console.error("Command returned invalid structure", checked.error);
      continue;
    }

    if (Result.isOk(applied)) {
      memoryStore.save(applied.value);
    }
  }

  console.log("\nFinal task list:");
  console.log(memoryStore.load());
}

if (import.meta.main) {
  await main();
}
