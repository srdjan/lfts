// examples/06-ports/main.ts
// Focus: validating capability ports before wiring them into pure logic.

import { validatePort } from "../../packages/lfts-type-runtime/mod.ts";
import { TaskStorePort$ } from "./src/ports.schema.ts";
import type { Task } from "./src/types.ts";

const memory: Task[] = [];

const inMemoryStore = {
  load: () => memory,
  save: (tasks: readonly Task[]) => {
    memory.splice(0, memory.length, ...tasks);
  },
};

const badStore = {
  load: (flag: boolean) => [], // wrong arity
  save: () => undefined,
};

if (import.meta.main) {
  console.log("Valid port impl:");
  console.log(validatePort(TaskStorePort$, inMemoryStore));

  console.log("\nInvalid port impl:");
  console.log(validatePort(TaskStorePort$, badStore));
}
