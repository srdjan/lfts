import { enc } from "../../../packages/lfts-type-spec/src/mod.ts";
import { Task$ } from "./types.schema.ts";

const TaskArray$ = enc.arr(Task$);

export const TaskStorePort$ = enc.port("TaskStorePort", [
  { name: "load", params: [], returnType: TaskArray$ },
  { name: "save", params: [TaskArray$], returnType: enc.und() },
]);

export const ClockPort$ = enc.port("ClockPort", [
  { name: "now", params: [], returnType: enc.num() },
]);
