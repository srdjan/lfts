import { assertEquals, assert } from "https://deno.land/std@0.224.0/testing/asserts.ts";
import { applyTaskUpdate, createTask, toTaskDraft, toTaskId, toTaskUpdate } from "../domain/task.ts";
import type { DomainError, TaskStateCommand, UnixTime } from "../domain/types.ts";

function unixTime(value: number): UnixTime {
  return value as UnixTime;
}

function errorMessage(error: DomainError): string {
  switch (error.type) {
    case "validation_error":
    case "conflict":
      return error.message;
    case "task_not_found":
      return `task not found: ${error.taskId}`;
  }
}

Deno.test("createTask produces pending task with events", () => {
  const draftResult = toTaskDraft({ title: "Write docs" });
  if (!draftResult.ok) {
    throw new Error(errorMessage(draftResult.error));
  }
  const idResult = toTaskId("task-1");
  if (!idResult.ok) {
    throw new Error(errorMessage(idResult.error));
  }

  const created = createTask({
    id: idResult.value,
    draft: draftResult.value,
    timestamp: unixTime(1700000000000),
  });

  if (!created.ok) {
    throw new Error(errorMessage(created.error));
  }

  assertEquals(created.value.task.state.type, "pending");
  assertEquals(created.value.events[0]?.type, "task_created");
});

Deno.test("applyTaskUpdate transitions to completed", () => {
  const idResult = toTaskId("task-2");
  if (!idResult.ok) {
    throw new Error(errorMessage(idResult.error));
  }

  const draft = toTaskDraft({ title: "Initial" });
  if (!draft.ok) {
    throw new Error(errorMessage(draft.error));
  }

  const created = createTask({
    id: idResult.value,
    draft: draft.value,
    timestamp: unixTime(1700000000000),
  });
  if (!created.ok) {
    throw new Error(errorMessage(created.error));
  }

  const baseTask = created.value.task;

  const stateCommand: TaskStateCommand = { type: "completed" };
  const updateResult = toTaskUpdate({ state: stateCommand });
  if (!updateResult.ok) {
    throw new Error(errorMessage(updateResult.error));
  }

  const result = applyTaskUpdate({
    current: baseTask,
    update: updateResult.value,
    timestamp: unixTime(1700000005000),
  });

  if (!result.ok) {
    throw new Error(errorMessage(result.error));
  }
  assertEquals(result.value.task.state.type, "completed");
  const stateChanged = result.value.events.find((evt) => evt.type === "task_state_changed");
  assert(stateChanged !== undefined);
});
