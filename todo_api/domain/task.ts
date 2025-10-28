import {
  type CreateTaskArgs,
  type DeleteTaskArgs,
  type DomainError,
  type Task,
  type TaskDescription,
  type TaskDraft,
  type TaskDraftPayload,
  type TaskEvent,
  type TaskId,
  type TaskState,
  type TaskStateCommand,
  type TaskTitle,
  type TaskUpdate,
  type TaskUpdatePayload,
  type UpdateTaskArgs,
  type UnixTime
} from "./types.ts";

type Result<T, E> =
  | Readonly<{ readonly ok: true; readonly value: T }>
  | Readonly<{ readonly ok: false; readonly error: E }>;

const ok = <T, E>(value: T): Result<T, E> => ({ ok: true, value });
const err = <T, E>(error: E): Result<T, E> => ({ ok: false, error });

const MAX_TITLE_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 2000;

export type AggregateChange = Readonly<{
  readonly task: Task;
  readonly events: readonly TaskEvent[];
}>;

export function toTaskId(value: string): Result<TaskId, DomainError> {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return err({ type: "validation_error", message: "task id must not be empty" });
  }
  return ok(trimmed as TaskId);
}

export function toTaskDraft(payload: TaskDraftPayload): Result<TaskDraft, DomainError> {
  const titleResult = toTaskTitle(payload.title);
  if (!titleResult.ok) return titleResult;
  const descriptionResult = toTaskDescription(payload.description);
  if (!descriptionResult.ok) return descriptionResult;
  return ok({
    title: titleResult.value,
    description: descriptionResult.value,
  });
}

export function toTaskUpdate(payload: TaskUpdatePayload): Result<TaskUpdate, DomainError> {
  const nextTitle = payload.title === undefined ? undefined : toTaskTitle(payload.title);
  if (nextTitle && !nextTitle.ok) return nextTitle;

  const nextDescription = payload.description === undefined ? undefined : toTaskDescription(payload.description);
  if (nextDescription && !nextDescription.ok) return nextDescription;

  const hasTitle = nextTitle !== undefined;
  const hasDescription = nextDescription !== undefined;
  const hasState = payload.state !== undefined;

  if (!hasTitle && !hasDescription && !hasState) {
    return err({ type: "validation_error", message: "update payload must include at least one field" });
  }

  return ok({
    title: nextTitle && nextTitle.ok ? nextTitle.value : undefined,
    description: nextDescription && nextDescription.ok ? nextDescription.value : undefined,
    state: payload.state,
  });
}

export function createTask(args: CreateTaskArgs): Result<AggregateChange, DomainError> {
  const initialState: TaskState = { type: "pending" };
  const task: Task = {
    id: args.id,
    title: args.draft.title,
    description: args.draft.description,
    state: initialState,
    createdAt: args.timestamp,
  };

  const events: readonly TaskEvent[] = [
    { type: "task_created", task },
  ];

  return ok({ task, events });
}

export function applyTaskUpdate(args: UpdateTaskArgs): Result<AggregateChange, DomainError> {
  let nextState: TaskState = args.current.state;
  const events: TaskEvent[] = [];
  let changed = false;

  let nextTitle = args.current.title;
  if (args.update.title !== undefined && args.update.title !== args.current.title) {
    nextTitle = args.update.title;
    changed = true;
  }

  let nextDescription = args.current.description;
  if (args.update.description !== undefined && args.update.description !== args.current.description) {
    nextDescription = args.update.description;
    changed = true;
  }

  if (args.update.state) {
    const stateResult = deriveState(args.current.state, args.update.state, args.timestamp);
    if (!stateResult.ok) return stateResult;
    if (!statesEqual(stateResult.value, args.current.state)) {
      events.push({
        type: "task_state_changed",
        taskId: args.current.id,
        from: args.current.state,
        to: stateResult.value,
      });
      nextState = stateResult.value;
      changed = true;
    }
  }

  if (!changed) {
    return err({ type: "conflict", message: "update did not change the task" });
  }

  const updated: Task = {
    id: args.current.id,
    title: nextTitle,
    description: nextDescription,
    state: nextState,
    createdAt: args.current.createdAt,
    updatedAt: args.timestamp,
  };

  events.push({ type: "task_updated", task: updated });

  return ok({ task: updated, events });
}

export function deleteTask(args: DeleteTaskArgs): Result<readonly TaskEvent[], DomainError> {
  const deletionEvents: readonly TaskEvent[] = [
    { type: "task_deleted", taskId: args.task.id, deletedAt: args.timestamp },
  ];
  return ok(deletionEvents);
}

function toTaskTitle(value: string): Result<TaskTitle, DomainError> {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return err({ type: "validation_error", message: "title must not be empty" });
  }
  if (trimmed.length > MAX_TITLE_LENGTH) {
    return err({
      type: "validation_error",
      message: `title must be <= ${MAX_TITLE_LENGTH} characters`,
    });
  }
  return ok(trimmed as TaskTitle);
}

function toTaskDescription(value: string | undefined): Result<TaskDescription | undefined, DomainError> {
  if (value === undefined) {
    return ok(undefined);
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return ok(undefined);
  }
  if (trimmed.length > MAX_DESCRIPTION_LENGTH) {
    return err({
      type: "validation_error",
      message: `description must be <= ${MAX_DESCRIPTION_LENGTH} characters`,
    });
  }
  return ok(trimmed as TaskDescription);
}

function deriveState(current: TaskState, command: TaskStateCommand, timestamp: UnixTime): Result<TaskState, DomainError> {
  if (command.type === current.type) {
    return ok(current);
  }
  if (!isValidTransition(current.type, command.type)) {
    return err({
      type: "conflict",
      message: `cannot transition task from ${current.type} to ${command.type}`,
    });
  }
  switch (command.type) {
    case "pending":
      return ok({ type: "pending" });
    case "in_progress":
      return ok({ type: "in_progress", startedAt: timestamp });
    case "completed":
      return ok({ type: "completed", completedAt: timestamp });
    case "archived":
      return ok({ type: "archived", archivedAt: timestamp });
  }
}

function isValidTransition(from: TaskState["type"], to: TaskStateCommand["type"]): boolean {
  if (from === "archived") {
    return to === "archived";
  }
  if (from === "completed") {
    return to === "completed" || to === "archived" || to === "in_progress" || to === "pending";
  }
  if (from === "in_progress") {
    return to === "in_progress" || to === "completed" || to === "archived" || to === "pending";
  }
  if (from === "pending") {
    return to === "pending" || to === "in_progress" || to === "completed" || to === "archived";
  }
  return false;
}

function statesEqual(a: TaskState, b: TaskState): boolean {
  if (a.type !== b.type) return false;
  switch (a.type) {
    case "pending":
      return true;
    case "in_progress":
      return b.type === "in_progress" && a.startedAt === b.startedAt;
    case "completed":
      return b.type === "completed" && a.completedAt === b.completedAt;
    case "archived":
      return b.type === "archived" && a.archivedAt === b.archivedAt;
  }
}
