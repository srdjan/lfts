import { validate } from "../../packages/lfts-type-runtime/mod.ts";
import type { Result } from "../../packages/lfts-type-runtime/mod.ts";
import {
  applyTaskUpdate,
  createTask,
  deleteTask,
  toTaskDraft,
  toTaskId,
  toTaskUpdate,
} from "../domain/task.ts";
import type {
  DomainError,
  TaskDraftPayload,
  TaskUpdatePayload,
} from "../domain/types.ts";
import type { ClockError, ClockPort } from "../ports/clock.ts";
import type { StorageError, StoragePort } from "../ports/storage.ts";

import "../domain/types.schema.ts";

declare const TaskDraftPayloadSchema$: unknown;
declare const TaskUpdatePayloadSchema$: unknown;

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
} as const;

const ok = <T, E>(value: T): Result<T, E> => ({ ok: true, value });
const err = <T, E>(error: E): Result<T, E> => ({ ok: false, error });

export type HttpDependencies = Readonly<{
  readonly storage: StoragePort;
  readonly clock: ClockPort;
}>;

export function createHttpHandler(deps: HttpDependencies) {
  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();

    if (url.pathname === "/tasks" && method === "POST") {
      return await handleCreateTask(request, deps);
    }

    if (url.pathname === "/tasks" && method === "GET") {
      return await handleListTasks(deps);
    }

    if (
      url.pathname.startsWith("/tasks/") && url.pathname.split("/").length === 3
    ) {
      const idSegment = decodeURIComponent(url.pathname.split("/")[2] ?? "");
      if (method === "GET") {
        return await handleGetTask(idSegment, deps);
      }
      if (method === "PATCH") {
        return await handleUpdateTask(idSegment, request, deps);
      }
      if (method === "DELETE") {
        return await handleDeleteTask(idSegment, deps);
      }
    }

    return jsonResponse(404, {
      error: { type: "not_found", message: "route not found" },
    });
  };
}

async function handleCreateTask(
  request: Request,
  deps: HttpDependencies,
): Promise<Response> {
  const bodyResult = await readJson<TaskDraftPayload>(request);
  if (!bodyResult.ok) return bodyResult.error;

  const validation = validatePayload(TaskDraftPayloadSchema$, bodyResult.value);
  if (!validation.ok) return validation.error;

  const draftResult = toTaskDraft(bodyResult.value);
  if (!draftResult.ok) return domainErrorResponse(draftResult.error);

  const idResult = toTaskId(crypto.randomUUID());
  if (!idResult.ok) return domainErrorResponse(idResult.error);

  const nowResult = deps.clock.now();
  if (!nowResult.ok) return clockErrorResponse(nowResult.error);

  const createResult = createTask({
    id: idResult.value,
    draft: draftResult.value,
    timestamp: nowResult.value,
  });
  if (!createResult.ok) return domainErrorResponse(createResult.error);

  const persistResult = await deps.storage.save(createResult.value.task);
  if (!persistResult.ok) return storageErrorResponse(persistResult.error);

  const location = new URL(`/tasks/${persistResult.value.id}`, request.url)
    .toString();
  const headers = new Headers(JSON_HEADERS);
  headers.set("location", location);

  return new Response(
    JSON.stringify({
      task: persistResult.value,
      events: createResult.value.events,
    }),
    { status: 201, headers },
  );
}

async function handleListTasks(deps: HttpDependencies): Promise<Response> {
  const result = await deps.storage.list();
  if (!result.ok) return storageErrorResponse(result.error);
  return jsonResponse(200, result.value);
}

async function handleGetTask(
  idSegment: string,
  deps: HttpDependencies,
): Promise<Response> {
  const idResult = toTaskId(idSegment);
  if (!idResult.ok) return domainErrorResponse(idResult.error);

  const found = await deps.storage.findById(idResult.value);
  if (!found.ok) return storageErrorResponse(found.error);
  if (!found.value) {
    return jsonResponse(404, {
      error: { type: "not_found", message: "task not found" },
    });
  }
  return jsonResponse(200, { task: found.value });
}

async function handleUpdateTask(
  idSegment: string,
  request: Request,
  deps: HttpDependencies,
): Promise<Response> {
  const idResult = toTaskId(idSegment);
  if (!idResult.ok) return domainErrorResponse(idResult.error);

  const existingResult = await deps.storage.findById(idResult.value);
  if (!existingResult.ok) return storageErrorResponse(existingResult.error);
  const current = existingResult.value;
  if (!current) {
    return jsonResponse(404, {
      error: { type: "not_found", message: "task not found" },
    });
  }

  const bodyResult = await readJson<TaskUpdatePayload>(request);
  if (!bodyResult.ok) return bodyResult.error;

  const validation = validatePayload(
    TaskUpdatePayloadSchema$,
    bodyResult.value,
  );
  if (!validation.ok) return validation.error;

  const updateResult = toTaskUpdate(bodyResult.value);
  if (!updateResult.ok) return domainErrorResponse(updateResult.error);

  const nowResult = deps.clock.now();
  if (!nowResult.ok) return clockErrorResponse(nowResult.error);

  const applyResult = applyTaskUpdate({
    current,
    update: updateResult.value,
    timestamp: nowResult.value,
  });
  if (!applyResult.ok) return domainErrorResponse(applyResult.error);

  const persistResult = await deps.storage.update(applyResult.value.task);
  if (!persistResult.ok) return storageErrorResponse(persistResult.error);

  return jsonResponse(200, {
    task: persistResult.value,
    events: applyResult.value.events,
  });
}

async function handleDeleteTask(
  idSegment: string,
  deps: HttpDependencies,
): Promise<Response> {
  const idResult = toTaskId(idSegment);
  if (!idResult.ok) return domainErrorResponse(idResult.error);

  const existingResult = await deps.storage.findById(idResult.value);
  if (!existingResult.ok) return storageErrorResponse(existingResult.error);
  const current = existingResult.value;
  if (!current) {
    return jsonResponse(404, {
      error: { type: "not_found", message: "task not found" },
    });
  }

  const nowResult = deps.clock.now();
  if (!nowResult.ok) return clockErrorResponse(nowResult.error);

  const deleteResult = deleteTask({
    task: current,
    timestamp: nowResult.value,
  });
  if (!deleteResult.ok) return domainErrorResponse(deleteResult.error);

  const removal = await deps.storage.delete(idResult.value);
  if (!removal.ok) return storageErrorResponse(removal.error);
  if (!removal.value) {
    return jsonResponse(404, {
      error: { type: "not_found", message: "task not found" },
    });
  }

  return new Response(null, { status: 204 });
}

async function readJson<T>(request: Request): Promise<Result<T, Response>> {
  try {
    const value = (await request.clone().json()) as T;
    return ok(value);
  } catch {
    return err(
      jsonResponse(400, {
        error: {
          type: "invalid_json",
          message: "request body must be valid JSON",
        },
      }),
    );
  }
}

function validatePayload(
  schema: unknown,
  value: unknown,
): Result<true, Response> {
  try {
    validate(schema, value);
    return ok(true);
  } catch (error) {
    return err(validationErrorResponse(error));
  }
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: JSON_HEADERS,
  });
}

function validationErrorResponse(error: unknown): Response {
  if (error instanceof Error) {
    return jsonResponse(422, {
      error: { type: "validation_error", message: error.message },
    });
  }
  return jsonResponse(422, {
    error: { type: "validation_error", message: "payload failed validation" },
  });
}

function domainErrorResponse(error: DomainError): Response {
  switch (error.type) {
    case "validation_error":
      return jsonResponse(422, { error });
    case "task_not_found":
      return jsonResponse(404, { error });
    case "conflict":
      return jsonResponse(409, { error });
  }
}

function storageErrorResponse(error: StorageError): Response {
  switch (error.type) {
    case "storage_unavailable":
      return jsonResponse(503, { error });
    case "storage_conflict":
      return jsonResponse(409, { error });
    case "storage_not_found":
      return jsonResponse(404, { error });
  }
}

function clockErrorResponse(error: ClockError): Response {
  return jsonResponse(503, { error });
}
