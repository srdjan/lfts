import type { Result } from "./mod.ts";
import { Result as ResultNS } from "./mod.ts";
import {
  executeStep,
  type WorkflowError,
  type WorkflowStep,
} from "./workflow.ts";

const now =
  typeof performance !== "undefined" && typeof performance.now === "function"
    ? () => performance.now()
    : () => Date.now();

type MaybePromise<T> = T | Promise<T>;

type SeedSource<TSeed> =
  | MaybePromise<TSeed>
  | MaybePromise<Result<TSeed, unknown>>
  | (() => MaybePromise<TSeed> | MaybePromise<Result<TSeed, unknown>>);

function isResultLike(value: unknown): value is Result<unknown, unknown> {
  if (typeof value !== "object" || value === null) return false;
  if (!("ok" in (value as Record<string, unknown>))) return false;
  const ok = (value as { ok?: unknown }).ok;
  return typeof ok === "boolean" &&
    (ok
      ? "value" in (value as Record<string, unknown>)
      : "error" in (value as Record<string, unknown>));
}

export type WorkflowGraphMode = "fail-fast" | "continue";

export type WorkflowGraphStageResolveContext<TSeed> = {
  readonly seed: TSeed;
  readonly results: Readonly<Record<string, unknown>>;
  readonly dependencies: readonly string[];
  get<T>(stageName: string): T;
};

export type WorkflowGraphStageConfig<TSeed, TIn, TOut, TErr> = {
  readonly name: string;
  readonly step: WorkflowStep<TIn, TOut, TErr>;
  readonly dependsOn?: readonly string[];
  readonly resolve?: (
    ctx: WorkflowGraphStageResolveContext<TSeed>,
  ) => MaybePromise<TIn | Result<TIn, unknown>>;
  readonly when?: (
    ctx: WorkflowGraphStageResolveContext<TSeed>,
  ) => MaybePromise<boolean | Result<boolean, unknown>>;
  readonly metadata?: Record<string, unknown>;
};

export type WorkflowGraphSnapshotStatus =
  | "pending"
  | "running"
  | "ok"
  | "error"
  | "blocked"
  | "skipped";

export type WorkflowGraphSnapshot = {
  readonly name: string;
  readonly status: WorkflowGraphSnapshotStatus;
  readonly dependsOn: readonly string[];
  readonly startedAt?: number;
  readonly finishedAt?: number;
  readonly durationMs?: number;
  readonly error?:
    | {
      readonly type: "stage_failed";
      readonly detail: WorkflowError | unknown;
    }
    | { readonly type: "input_resolution_failed"; readonly detail: unknown }
    | { readonly type: "blocked"; readonly blockedBy: readonly string[] };
};

export type WorkflowGraphRunOptions = {
  readonly maxConcurrency?: number;
  readonly mode?: WorkflowGraphMode;
};

export type WorkflowGraphSuccess = {
  readonly seed: unknown;
  readonly outputs: Readonly<Record<string, unknown>>;
  readonly snapshots: readonly WorkflowGraphSnapshot[];
};

export type WorkflowGraphRunFailure =
  | { readonly type: "seed_failed"; readonly error: unknown }
  | {
    readonly type: "stage_failed";
    readonly stage: string;
    readonly error: WorkflowError | unknown;
  }
  | {
    readonly type: "input_resolution_failed";
    readonly stage: string;
    readonly error: unknown;
  }
  | {
    readonly type: "dependency_missing";
    readonly stage: string;
    readonly missing: string;
  }
  | { readonly type: "cycle_detected"; readonly stages: readonly string[] };

export type WorkflowGraphPlan = {
  readonly stages: readonly InternalStageConfig[];
  readonly seed: () => Promise<Result<unknown, WorkflowGraphRunFailure>>;
  readonly stageMap: Map<string, InternalStageConfig>;
  readonly adjacency: Map<string, string[]>;
  readonly indegree: Map<string, number>;
};

type InternalStageConfig = {
  readonly name: string;
  readonly step: WorkflowStep<unknown, unknown, unknown>;
  readonly dependsOn: readonly string[];
  readonly resolve?: (
    ctx: WorkflowGraphStageResolveContext<unknown>,
  ) => MaybePromise<unknown | Result<unknown, unknown>>;
  readonly when?: (
    ctx: WorkflowGraphStageResolveContext<unknown>,
  ) => MaybePromise<boolean | Result<boolean, unknown>>;
};

export interface WorkflowGraphBuilder<TSeed> {
  seed(source: SeedSource<TSeed>): WorkflowGraphBuilder<TSeed>;
  stage<TIn, TOut, TErr>(
    config: WorkflowGraphStageConfig<TSeed, TIn, TOut, TErr>,
  ): WorkflowGraphBuilder<TSeed>;
  build(): WorkflowGraph;
}

export interface WorkflowGraph {
  run(
    options?: WorkflowGraphRunOptions,
  ): Promise<Result<WorkflowGraphSuccess, WorkflowGraphRunFailure>>;
  inspect(): readonly WorkflowGraphSnapshot[];
}

type ResolveResult<T> = MaybePromise<T | Result<T, unknown>>;

export function graphBuilder<TSeed = unknown>(): WorkflowGraphBuilder<TSeed> {
  return new WorkflowGraphBuilderImpl<TSeed>();
}

class WorkflowGraphBuilderImpl<TSeed> implements WorkflowGraphBuilder<TSeed> {
  #seed: () => Promise<Result<TSeed, WorkflowGraphRunFailure>> = async () =>
    ResultNS.ok(undefined as TSeed);
  #stageOrder: InternalStageConfig[] = [];
  #stageSet = new Set<string>();

  seed(source: SeedSource<TSeed>): WorkflowGraphBuilder<TSeed> {
    this.#seed = () => normalizeSeed(source);
    return this;
  }

  stage<TIn, TOut, TErr>(
    config: WorkflowGraphStageConfig<TSeed, TIn, TOut, TErr>,
  ): WorkflowGraphBuilder<TSeed> {
    const name = config.name;
    if (!name) throw new Error("Workflow graph stage must have a name");
    if (this.#stageSet.has(name)) {
      throw new Error(`Duplicate workflow stage name: ${name}`);
    }
    const dependsOn = [...(config.dependsOn ?? [])];
    this.#stageOrder.push({
      name,
      dependsOn,
      step: config.step as WorkflowStep<unknown, unknown, unknown>,
      resolve: config.resolve as InternalStageConfig["resolve"],
      when: config.when as InternalStageConfig["when"],
    });
    this.#stageSet.add(name);
    return this;
  }

  build(): WorkflowGraph {
    if (this.#stageOrder.length === 0) {
      throw new Error("Workflow graph requires at least one stage");
    }
    const stageMap = new Map<string, InternalStageConfig>();
    for (const stage of this.#stageOrder) stageMap.set(stage.name, stage);

    for (const stage of this.#stageOrder) {
      for (const dep of stage.dependsOn) {
        if (!stageMap.has(dep)) {
          throw new Error(
            `Stage "${stage.name}" depends on missing stage "${dep}"`,
          );
        }
      }
    }

    if (hasCycle(this.#stageOrder)) {
      throw new Error("Workflow graph contains a dependency cycle");
    }

    const adjacency = new Map<string, string[]>();
    const indegree = new Map<string, number>();
    for (const stage of this.#stageOrder) {
      indegree.set(stage.name, stage.dependsOn.length);
      adjacency.set(stage.name, []);
    }
    for (const stage of this.#stageOrder) {
      for (const dep of stage.dependsOn) {
        adjacency.get(dep)!.push(stage.name);
      }
    }

    const plan: WorkflowGraphPlan = {
      stages: this.#stageOrder,
      seed: () =>
        this.#seed() as Promise<Result<unknown, WorkflowGraphRunFailure>>,
      stageMap,
      adjacency,
      indegree,
    };

    return new WorkflowGraphImpl(plan);
  }
}

class WorkflowGraphImpl implements WorkflowGraph {
  #plan: WorkflowGraphPlan;
  #snapshots: WorkflowGraphSnapshot[] = [];

  constructor(plan: WorkflowGraphPlan) {
    this.#plan = plan;
  }

  inspect(): readonly WorkflowGraphSnapshot[] {
    return this.#snapshots;
  }

  async run(
    options: WorkflowGraphRunOptions = {},
  ): Promise<Result<WorkflowGraphSuccess, WorkflowGraphRunFailure>> {
    const { maxConcurrency = Infinity, mode = "fail-fast" } = options;
    const concurrency = Math.max(1, Math.floor(maxConcurrency));
    const snapshots: WorkflowGraphSnapshot[] = [];
    const outputs: Record<string, unknown> = {};

    const seedResult = await this.#plan.seed();
    if (!seedResult.ok) {
      const failure = seedResult.error;
      this.#snapshots = snapshots;
      return ResultNS.err(failure);
    }
    const seedValue = seedResult.value;

    const indegree = new Map(this.#plan.indegree);
    const ready: string[] = [];
    for (const [name, degree] of indegree.entries()) {
      if (degree === 0) ready.push(name);
    }

    const pending = new Set(this.#plan.stageMap.keys());
    const active = new Map<string, Promise<StageRunOutcome>>();
    let failure: WorkflowGraphRunFailure | null = null;

    const schedule = () => {
      while (
        ready.length > 0 && active.size < concurrency &&
        !(failure && mode === "fail-fast")
      ) {
        const name = ready.shift()!;
        const stage = this.#plan.stageMap.get(name)!;
        const promise = this.#runStage(stage, seedValue, outputs, snapshots);
        active.set(name, promise);
      }
    };

    schedule();

    while (active.size > 0) {
      const [name, outcome] = await Promise.race(
        active.entries().map(([n, p]) =>
          p.then((value) => [n, value] as const)
        ),
      );
      active.delete(name);
      pending.delete(name);

      if (outcome.kind === "success") {
        outputs[outcome.name] = outcome.value;
        for (const dependent of this.#plan.adjacency.get(outcome.name) ?? []) {
          const degree = indegree.get(dependent)! - 1;
          indegree.set(dependent, degree);
          if (degree === 0) ready.push(dependent);
        }
      } else {
        failure ??= outcome.failure;
      }

      if (failure && mode === "fail-fast") {
        break;
      }

      schedule();
      if (
        active.size === 0 && ready.length === 0 && pending.size > 0 && !failure
      ) {
        // Deadlock -> cycle
        failure = { type: "cycle_detected", stages: [...pending.keys()] };
        break;
      }
    }

    if (active.size > 0) {
      await Promise.allSettled(active.values());
    }

    if (pending.size > 0) {
      for (const name of pending) {
        snapshots.push({
          name,
          status: "blocked",
          dependsOn: this.#plan.stageMap.get(name)!.dependsOn,
          error: {
            type: "blocked",
            blockedBy: this.#plan.stageMap.get(name)!.dependsOn,
          },
        });
      }
    }

    this.#snapshots = snapshots;

    if (failure) {
      return ResultNS.err(failure);
    }

    return ResultNS.ok({ seed: seedValue, outputs, snapshots });
  }

  async #runStage(
    stage: InternalStageConfig,
    seedValue: unknown,
    outputs: Record<string, unknown>,
    snapshots: WorkflowGraphSnapshot[],
  ): Promise<StageRunOutcome> {
    const startedAt = now();
    const finish = (
      status: WorkflowGraphSnapshotStatus,
      error?: WorkflowGraphSnapshot["error"],
    ) => {
      const finishedAt = now();
      snapshots.push({
        name: stage.name,
        status,
        dependsOn: stage.dependsOn,
        startedAt,
        finishedAt,
        durationMs: finishedAt - startedAt,
        error,
      });
    };
    try {
      // Check conditional execution predicate
      if (stage.when) {
        const ctx: WorkflowGraphStageResolveContext<unknown> = {
          seed: seedValue,
          results: outputs,
          dependencies: stage.dependsOn,
          get<T>(name: string): T {
            if (!(name in outputs)) {
              throw new Error(
                `Stage "${stage.name}" cannot access result of "${name}" before it completes`,
              );
            }
            return outputs[name] as T;
          },
        };

        const shouldRun = await stage.when(ctx);

        // Handle Result-based predicate returns
        const shouldRunValue = isResultLike(shouldRun)
          ? (shouldRun.ok ? shouldRun.value : false)
          : shouldRun;

        if (!shouldRunValue) {
          finish("skipped");
          return { kind: "success", name: stage.name, value: undefined };
        }
      }

      const inputResult = await this.#resolveInput(stage, seedValue, outputs);
      if (!inputResult.ok) {
        finish("error", {
          type: "input_resolution_failed",
          detail: inputResult.error,
        });
        return {
          kind: "error",
          failure: {
            type: "input_resolution_failed",
            stage: stage.name,
            error: inputResult.error,
          },
        };
      }

      const result = await executeStep(stage.step, inputResult.value);
      if (!result.ok) {
        finish("error", { type: "stage_failed", detail: result.error });
        return {
          kind: "error",
          failure: {
            type: "stage_failed",
            stage: stage.name,
            error: result.error,
          },
        };
      }

      finish("ok");
      return { kind: "success", name: stage.name, value: result.value };
    } catch (error) {
      finish("error", { type: "stage_failed", detail: error });
      return {
        kind: "error",
        failure: { type: "stage_failed", stage: stage.name, error },
      };
    }
  }

  async #resolveInput(
    stage: InternalStageConfig,
    seedValue: unknown,
    outputs: Record<string, unknown>,
  ): Promise<Result<unknown, unknown>> {
    try {
      const ctx: WorkflowGraphStageResolveContext<unknown> = {
        seed: seedValue,
        results: outputs,
        dependencies: stage.dependsOn,
        get<T>(name: string): T {
          if (!(name in outputs)) {
            throw new Error(
              `Stage "${stage.name}" cannot access result of "${name}" before it completes`,
            );
          }
          return outputs[name] as T;
        },
      };
      const resolved = stage.resolve
        ? await stage.resolve(ctx)
        : await defaultInputResolver(ctx);
      if (isResultLike(resolved)) return resolved as Result<unknown, unknown>;
      return ResultNS.ok(resolved);
    } catch (error) {
      return ResultNS.err(error);
    }
  }
}

type StageRunOutcome =
  | { kind: "success"; name: string; value: unknown }
  | { kind: "error"; failure: WorkflowGraphRunFailure };

async function normalizeSeed<TSeed>(
  source: SeedSource<TSeed>,
): Promise<Result<TSeed, WorkflowGraphRunFailure>> {
  try {
    const asValue = typeof source === "function"
      ? (source as () => MaybePromise<TSeed | Result<TSeed, unknown>>)()
      : source;
    const awaited = await asValue;
    if (isResultLike(awaited)) {
      return awaited.ok
        ? ResultNS.ok(awaited.value as TSeed)
        : ResultNS.err({ type: "seed_failed", error: awaited.error });
    }
    return ResultNS.ok(awaited as TSeed);
  } catch (error) {
    return ResultNS.err({ type: "seed_failed", error });
  }
}

function hasCycle(stages: readonly InternalStageConfig[]): boolean {
  const indegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();
  for (const stage of stages) {
    indegree.set(stage.name, stage.dependsOn.length);
    adjacency.set(stage.name, []);
  }
  for (const stage of stages) {
    for (const dep of stage.dependsOn) adjacency.get(dep)?.push(stage.name);
  }
  const queue: string[] = [];
  for (const [name, degree] of indegree.entries()) {
    if (degree === 0) queue.push(name);
  }
  let visited = 0;
  while (queue.length > 0) {
    const current = queue.shift()!;
    visited++;
    for (const neighbor of adjacency.get(current) ?? []) {
      const next = (indegree.get(neighbor) ?? 0) - 1;
      indegree.set(neighbor, next);
      if (next === 0) queue.push(neighbor);
    }
  }
  return visited !== stages.length;
}

async function defaultInputResolver(
  ctx: WorkflowGraphStageResolveContext<unknown>,
): Promise<unknown> {
  if (ctx.dependencies.length === 0) return ctx.seed;
  if (ctx.dependencies.length === 1) return ctx.get(ctx.dependencies[0]);
  const aggregate: Record<string, unknown> = {};
  for (const dep of ctx.dependencies) aggregate[dep] = ctx.get(dep);
  return aggregate;
}

export function fromStage<TSeed, TOutput, TMapped = TOutput>(
  stageName: string,
  projector?: (
    value: TOutput,
    ctx: WorkflowGraphStageResolveContext<TSeed>,
  ) => ResolveResult<TMapped>,
): (ctx: WorkflowGraphStageResolveContext<TSeed>) => ResolveResult<TMapped> {
  return (ctx) => {
    const value = ctx.get<TOutput>(stageName);
    if (projector) return projector(value, ctx);
    return value as unknown as TMapped;
  };
}

export function fromStages<
  TSeed,
  TValues extends Record<string, unknown>,
  TMapped,
>(
  dependencies: readonly (keyof TValues & string)[],
  projector: (
    values: TValues,
    ctx: WorkflowGraphStageResolveContext<TSeed>,
  ) => ResolveResult<TMapped>,
): (ctx: WorkflowGraphStageResolveContext<TSeed>) => ResolveResult<TMapped> {
  return (ctx) => {
    const values = Object.create(null) as TValues;
    for (const dep of dependencies) {
      values[dep] = ctx.get(dep);
    }
    return projector(values, ctx);
  };
}

/**
 * Pattern matching helper for routing based on discriminated union type field.
 *
 * Provides type-safe routing from a discriminated union value to a result type.
 * Throws an error if no route matches the discriminant value (fail-fast).
 *
 * @template TValue - Discriminated union type with a `type` field
 * @template TRoute - Result type to return based on the discriminant
 *
 * @param value - The discriminated union value to match against
 * @param routes - Map of discriminant values to route results
 *
 * @returns The route result corresponding to the value's discriminant
 *
 * @throws Error if no route is defined for the value's discriminant
 *
 * @example
 * ```typescript
 * type ReviewStatus = { type: "approved" } | { type: "rejected" } | { type: "needs_changes" };
 *
 * const review: ReviewStatus = { type: "approved" };
 * const action = matchRoute(review, {
 *   "approved": { nextStage: "merge", priority: "high" },
 *   "rejected": { nextStage: "close", priority: "low" },
 *   "needs_changes": { nextStage: "notify", priority: "medium" }
 * });
 * // action = { nextStage: "merge", priority: "high" }
 * ```
 */
export function matchRoute<TValue extends { type: string }, TRoute>(
  value: TValue,
  routes: { [K in TValue["type"]]: TRoute },
): TRoute {
  const discriminant = value.type as TValue["type"];
  const route = routes[discriminant];

  if (route === undefined) {
    const availableRoutes = Object.keys(routes).join(", ");
    throw new Error(
      `matchRoute: No route defined for discriminant "${discriminant}". Available routes: ${availableRoutes}`,
    );
  }

  return route;
}
