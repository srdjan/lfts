export type TaskId = string & { readonly __brand: "TaskId" };
export type TaskTitle = string & { readonly __brand: "TaskTitle" };
export type TaskDescription = string & { readonly __brand: "TaskDescription" };
export type UnixTime = number & { readonly __brand: "UnixTime" };

export type TaskState =
  | Readonly<{ readonly type: "pending" }>
  | Readonly<{ readonly type: "in_progress"; readonly startedAt: UnixTime }>
  | Readonly<{ readonly type: "completed"; readonly completedAt: UnixTime }>
  | Readonly<{ readonly type: "archived"; readonly archivedAt: UnixTime }>;

export type TaskStateCommand =
  | Readonly<{ readonly type: "pending" }>
  | Readonly<{ readonly type: "in_progress" }>
  | Readonly<{ readonly type: "completed" }>
  | Readonly<{ readonly type: "archived" }>;

export type Task = Readonly<{
  readonly id: TaskId;
  readonly title: TaskTitle;
  readonly description?: TaskDescription;
  readonly state: TaskState;
  readonly createdAt: UnixTime;
  readonly updatedAt?: UnixTime;
}>;

export type TaskDraft = Readonly<{
  readonly title: TaskTitle;
  readonly description?: TaskDescription;
}>;

export type TaskDraftPayload = Readonly<{
  readonly title: string;
  readonly description?: string;
}>;

export type TaskUpdate = Readonly<{
  readonly title?: TaskTitle;
  readonly description?: TaskDescription;
  readonly state?: TaskStateCommand;
}>;

export type TaskUpdatePayload = Readonly<{
  readonly title?: string;
  readonly description?: string;
  readonly state?: TaskStateCommand;
}>;

export type CreateTaskArgs = Readonly<{
  readonly id: TaskId;
  readonly draft: TaskDraft;
  readonly timestamp: UnixTime;
}>;

export type UpdateTaskArgs = Readonly<{
  readonly current: Task;
  readonly update: TaskUpdate;
  readonly timestamp: UnixTime;
}>;

export type DeleteTaskArgs = Readonly<{
  readonly task: Task;
  readonly timestamp: UnixTime;
}>;

export type TaskEvent =
  | Readonly<{ readonly type: "task_created"; readonly task: Task }>
  | Readonly<{ readonly type: "task_updated"; readonly task: Task }>
  | Readonly<{
      readonly type: "task_state_changed";
      readonly taskId: TaskId;
      readonly from: TaskState;
      readonly to: TaskState;
    }>
  | Readonly<{ readonly type: "task_deleted"; readonly taskId: TaskId; readonly deletedAt: UnixTime }>;

export type DomainError =
  | Readonly<{ readonly type: "validation_error"; readonly message: string }>
  | Readonly<{ readonly type: "task_not_found"; readonly taskId: TaskId }>
  | Readonly<{ readonly type: "conflict"; readonly message: string }>;

export type ValidationIssue = Readonly<{ readonly path: readonly string[]; readonly message: string }>;

export type TaskList = Readonly<{ readonly tasks: readonly Task[] }>;
