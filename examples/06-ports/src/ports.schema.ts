import { enc } from "../../../packages/lfts-type-spec/src/mod.ts";
import { Task$ } from "./types.schema.ts";

const TasksArray$ = enc.arr(Task$);

export const TaskStorePort$ = enc.port("TaskStorePort", [
  {
    name: "load",
    params: [],
    returnType: TasksArray$,
  },
  {
    name: "save",
    params: [TasksArray$],
    returnType: enc.und(),
  },
]);

export const ClockPort$ = enc.port("ClockPort", [
  {
    name: "now",
    params: [],
    returnType: enc.num(),
  },
]);
