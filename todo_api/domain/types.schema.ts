import type {
  Task,
  TaskDraft,
  TaskDraftPayload,
  TaskEvent,
  TaskList,
  TaskState,
  TaskStateCommand,
  TaskUpdate,
  TaskUpdatePayload
} from "./types.ts";

export type TaskSchema = Task;
export type TaskListSchema = TaskList;
export type TaskDraftSchema = TaskDraft;
export type TaskUpdateSchema = TaskUpdate;
export type TaskStateSchema = TaskState;
export type TaskStateCommandSchema = TaskStateCommand;
export type TaskEventSchema = TaskEvent;
export type TaskDraftPayloadSchema = TaskDraftPayload;
export type TaskUpdatePayloadSchema = TaskUpdatePayload;
