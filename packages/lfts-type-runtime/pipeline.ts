// Extracted Pipeline Helpers (optional module)
// Minimal, comment-stripped version to keep file concise.

import type { Result } from "./mod.ts";
import { Result as ResultNS } from "./mod.ts";

const PIPE_STAGE = Symbol.for("lfts.pipeline.stage");
const PIPE_TOKEN = Symbol.for("lfts.pipeline.token");

type PipelineMode = "value" | "result";

export interface StageMeta {
  readonly label?: string;
  readonly expectsResult: boolean;
}

export interface StageSnapshot {
  readonly index: number;
  readonly label?: string;
  readonly mode: PipelineMode;
  readonly status: "ok" | "err";
  readonly startedAt: number;
  readonly finishedAt: number;
  readonly durationMs: number;
  readonly error?: unknown;
}

type StageInvokeResult =
  | { readonly kind: "value"; readonly value: unknown }
  | { readonly kind: "result"; readonly result: Result<unknown, unknown> };

interface StageHandler {
  readonly meta: StageMeta;
  invoke(input: unknown, ctx: PipelineRunContext): Promise<StageInvokeResult>;
}

interface PipelineRunContext { readonly mode: PipelineMode }

interface PipelineAssemblyContext {
  readonly seed: () => Promise<unknown>;
  readonly stages: StageHandler[];
  snapshots: StageSnapshot[];
}

type PipelineRunOutcome = {
  readonly mode: PipelineMode;
  readonly result: Result<unknown, unknown>;
  readonly value: unknown;
  readonly snapshots: StageSnapshot[];
  readonly thrown?: unknown;
};

type TailParameters<Fn extends (input: any, ...args: any[]) => any> =
  Parameters<Fn> extends [any, ...infer Rest] ? Rest : never;

type StageInput<Fn extends (input: any, ...args: any[]) => any> =
  Parameters<Fn> extends [infer First, ...any[]] ? First : never;

type StageReturn<Fn extends (...args: any[]) => any> = Awaited<ReturnType<Fn>>;

type StageOutput<Fn extends (input: any, ...args: any[]) => any> =
  StageReturn<Fn> extends PipelineToken<infer Value, any> ? Value
    : StageReturn<Fn> extends Result<infer Value, any> ? Value
    : StageReturn<Fn>;

type StageError<Fn extends (input: any, ...args: any[]) => any> =
  StageReturn<Fn> extends Result<any, infer Err> ? Err : never;

interface PipeStageMarker<I, O, E> {
  readonly [PIPE_STAGE]: true;
  readonly meta: StageMeta;
  readonly label?: string;
}

type PipeStageCallable<Fn extends (input: any, ...args: any[]) => any> =
  TailParameters<Fn> extends []
    ? PipeStageMarker<StageInput<Fn>, StageOutput<Fn>, StageError<Fn>>
    : (...args: TailParameters<Fn>) => PipeStageMarker<StageInput<Fn>, StageOutput<Fn>, StageError<Fn>>;

export type PipeStage<Fn extends (input: any, ...args: any[]) => any> =
  & PipeStageCallable<Fn>
  & PipeStageMarker<StageInput<Fn>, StageOutput<Fn>, StageError<Fn>>;

type PipeableShape<T> = {
  [K in keyof T]: T[K] extends (input: infer I, ...args: infer R) => infer O
    ? PipeStage<(input: I, ...args: R) => O>
    : T[K];
};

const scheduleMicrotask: (cb: () => void) => void = typeof queueMicrotask === "function"
  ? queueMicrotask.bind(globalThis) : (cb) => { Promise.resolve().then(cb) };

const now = typeof performance !== "undefined" && typeof performance.now === "function"
  ? () => performance.now() : () => Date.now();

let activePipelineContext: PipelineAssemblyContext | null = null;

export class PipelineExecutionError<E = unknown> extends Error {
  readonly error: E;
  readonly snapshots: readonly StageSnapshot[];
  constructor(message: string, error: E, snapshots: readonly StageSnapshot[]) {
    super(message);
    this.name = "PipelineExecutionError";
    this.error = error;
    this.snapshots = snapshots;
    if (error instanceof Error) (this as any).cause = error;
  }
}

export interface PipelineToken<T, E = never> {
  readonly [PIPE_TOKEN]: true;
  run(): Promise<T>;
  runResult(): Promise<Result<T, E>>;
  inspect(): readonly StageSnapshot[];
}

interface PipelineTokenInternalContext extends PipelineAssemblyContext { snapshots: StageSnapshot[] }

class PipelineTokenImpl<T = unknown, E = unknown> implements PipelineToken<T, E> {
  readonly [PIPE_TOKEN] = true as const;
  constructor(private readonly ctx: PipelineTokenInternalContext) {}
  [Symbol.toPrimitive](): number { activePipelineContext = this.ctx; return 0 }
  async run(): Promise<T> {
    const outcome = await runPipeline(this.ctx);
    this.ctx.snapshots = outcome.snapshots;
    if ("thrown" in outcome && outcome.thrown !== undefined) throw outcome.thrown;
    if (outcome.mode === "result") {
      const typed = outcome.result as Result<T, E>;
      if (typed.ok) return typed.value;
      throw new PipelineExecutionError("Pipeline produced a Result.err", typed.error, outcome.snapshots);
    }
    return outcome.value as T;
  }
  async runResult(): Promise<Result<T, E>> {
    const outcome = await runPipeline(this.ctx);
    this.ctx.snapshots = outcome.snapshots;
    if ("thrown" in outcome && outcome.thrown !== undefined) throw outcome.thrown;
    if (outcome.mode === "result") return outcome.result as Result<T, E>;
    return ResultNS.ok(outcome.value as T);
  }
  inspect(): readonly StageSnapshot[] { return this.ctx.snapshots }
}

export interface AsPipeOptions { readonly label?: string; readonly expect?: "value" | "result" }

export function asPipe<Fn extends (input: any, ...args: any[]) => any>(fn: Fn, options?: AsPipeOptions): PipeStage<Fn>;
export function asPipe<Shape extends Record<PropertyKey, unknown>>(object: Shape, options?: AsPipeOptions): PipeableShape<Shape>;
export function asPipe(fnOrObj: unknown, options?: AsPipeOptions): unknown {
  if (typeof fnOrObj === "object" && fnOrObj !== null && typeof (fnOrObj as object) !== "function") {
    const proxied = new Proxy(fnOrObj as Record<PropertyKey, unknown>, {
      get(target, prop, receiver) {
        const value = Reflect.get(target, prop, receiver);
        if (typeof value === "function") {
          const bound = (value as (...args: unknown[]) => unknown).bind(target);
          const label = options?.label ?? (typeof prop === "string" ? prop : value.name || undefined);
          return asPipe(bound, { ...options, label });
        }
        return value;
      },
    });
    return proxied as PipeableShape<typeof fnOrObj>;
  }
  if (typeof fnOrObj !== "function") throw new TypeError("asPipe expects a function or an object with methods");
  return createStageProxy(fnOrObj as (input: any, ...args: any[]) => any, options ?? {});
}

export function pipe<T>(value: T | Promise<T>): PipelineToken<T, never>;
export function pipe<T, E>(value: Result<T, E> | Promise<Result<T, E>>): PipelineToken<T, E>;
export function pipe(value: unknown): PipelineToken<unknown, unknown> {
  const ctx: PipelineTokenInternalContext = { seed: () => Promise.resolve(value), stages: [], snapshots: [] };
  return new PipelineTokenImpl(ctx);
}

export function isPipelineToken(value: unknown): value is PipelineToken<unknown> {
  return typeof value === "object" && value !== null && (value as PipelineToken<unknown>)[PIPE_TOKEN] === true;
}

function createStageProxy<Fn extends (input: any, ...args: any[]) => any>(
  fn: Fn,
  options: AsPipeOptions,
  boundArgs?: TailParameters<Fn>,
): PipeStage<Fn> {
  const label = options.label ?? (fn.name || undefined);
  const expectsResult = options.expect === "result";
  const target = function(){};
  const handler: ProxyHandler<() => void> = {
    apply(_target, _thisArg, args) { return createStageProxy(fn, options, args as TailParameters<Fn>) },
    get(_: () => void, prop: PropertyKey) {
      if (prop === Symbol.toPrimitive) {
        return () => {
          const ctx = activePipelineContext;
          if (!ctx) throw new Error("pipe() must be on the left-hand side of a | expression.");
          const args = (boundArgs ?? []) as readonly unknown[];
          ctx.stages.push(createStageHandler(fn, args, { label, expectsResult }));
          scheduleMicrotask(() => { if (activePipelineContext === ctx) activePipelineContext = null });
          return 0;
        };
      }
      if (prop === PIPE_STAGE) return true;
      if (prop === "meta") return { label, expectsResult } satisfies StageMeta;
      if (prop === "label") return label;
      return Reflect.get(fn, prop);
    },
  };
  return new Proxy(target, handler) as unknown as PipeStage<Fn>;
}

function createStageHandler(
  fn: (input: unknown, ...args: unknown[]) => unknown,
  boundArgs: readonly unknown[],
  meta: StageMeta,
): StageHandler {
  return { meta, async invoke(input, ctx): Promise<StageInvokeResult> { const raw = await Promise.resolve(fn(input, ...boundArgs)); return normalizeStageOutput(raw, ctx, meta.expectsResult) } };
}

async function normalizeStageOutput(raw: unknown, ctx: PipelineRunContext, expectsResult: boolean): Promise<StageInvokeResult> {
  if (isPipelineToken(raw)) {
    if (ctx.mode === "result") return { kind: "result", result: await raw.runResult() };
    return { kind: "value", value: await raw.run() };
  }
  if (expectsResult) return { kind: "result", result: ensureResult(raw) };
  if (isResultLike(raw)) return { kind: "result", result: raw };
  return { kind: "value", value: raw };
}

function ensureResult<T, E = never>(value: T | Result<T, E>): Result<T, E> {
  return isResultLike(value) ? value : ResultNS.ok(value);
}

function isResultLike(value: unknown): value is Result<unknown, unknown> {
  if (typeof value !== "object" || value === null) return false;
  if (!("ok" in (value as any))) return false;
  const ok = (value as Record<string, unknown>).ok;
  return typeof ok === "boolean" && (ok ? "value" in (value as any) : "error" in (value as any));
}

async function runPipeline(ctx: PipelineTokenInternalContext): Promise<PipelineRunOutcome> {
  const snapshots: StageSnapshot[] = [];
  let mode: PipelineMode = "value";
  let currentValue: unknown;
  let currentResult: Result<unknown, unknown> | null = null;
  const resolvedSeed = await ctx.seed();
  if (isResultLike(resolvedSeed)) {
    mode = "result";
    currentResult = resolvedSeed;
    if (!resolvedSeed.ok) return { mode, result: resolvedSeed, value: undefined, snapshots };
    currentValue = resolvedSeed.value;
  } else {
    currentValue = resolvedSeed;
  }
  for (let index = 0; index < ctx.stages.length; index++) {
    const stage = ctx.stages[index];
    const startedAt = now();
    let status: "ok" | "err" = "ok";
    let errorValue: unknown;
    try {
      const output = await stage.invoke(currentValue, { mode });
      if (output.kind === "result") {
        mode = "result";
        currentResult = output.result;
        if (!output.result.ok) {
          status = "err"; errorValue = output.result.error;
          snapshots.push(createSnapshot(stage.meta, index, startedAt, status, mode, errorValue));
          return { mode, result: output.result, value: undefined, snapshots };
        }
        currentValue = output.result.value;
      } else {
        currentValue = output.value;
        if (mode === "result") currentResult = ResultNS.ok(currentValue);
      }
    } catch (err) {
      status = "err"; errorValue = err;
      snapshots.push(createSnapshot(stage.meta, index, startedAt, status, mode, errorValue));
      if (mode === "result") return { mode, result: ResultNS.err(err), value: undefined, snapshots };
      return { mode, result: ResultNS.err(err), value: undefined, snapshots, thrown: err };
    }
    snapshots.push(createSnapshot(stage.meta, index, startedAt, status, mode, errorValue));
  }
  if (mode === "result") {
    const finalResult = currentResult ?? ResultNS.ok(currentValue);
    return { mode, result: finalResult, value: finalResult.ok ? finalResult.value : undefined, snapshots };
  }
  return { mode, result: ResultNS.ok(currentValue), value: currentValue, snapshots };
}

function createSnapshot(meta: StageMeta, index: number, startedAt: number, status: "ok" | "err", mode: PipelineMode, errorValue: unknown): StageSnapshot {
  const finishedAt = now();
  return { index, label: meta.label, mode, status, startedAt, finishedAt, durationMs: finishedAt - startedAt, error: status === "err" ? errorValue : undefined };
}

