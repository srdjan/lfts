import {
  type FullStackStageUiMetadata,
  type HtmxRouteSpec,
  type StageKind,
  type WorkflowMetadataLink,
  type WorkflowStep,
  type WorkflowStepMetadata,
  type RetryConfig,
} from "./workflow.ts";

const STAGE_DEFINITION = Symbol.for("lfts.stageDefinition");

export type { HtmxRouteSpec, FullStackStageUiMetadata } from "./workflow.ts";

export type StageDefinitionInfo<TErr = unknown> = {
  readonly kind: StageKind;
  readonly version?: string;
  readonly summary?: string;
  readonly tags?: readonly string[];
  readonly owners?: readonly string[];
  readonly ui?: FullStackStageUiMetadata;
};

export type StageDefinition<TIn, TOut, TErr> = WorkflowStep<TIn, TOut, TErr> & {
  readonly [STAGE_DEFINITION]: StageDefinitionInfo<TErr>;
};

export function isStageDefinition<TIn, TOut, TErr>(
  step: WorkflowStep<TIn, TOut, TErr> | StageDefinition<TIn, TOut, TErr>,
): step is StageDefinition<TIn, TOut, TErr> {
  return Boolean(step && typeof step === "object" && STAGE_DEFINITION in step);
}

export function getStageDefinitionInfo<TIn, TOut, TErr>(
  step: WorkflowStep<TIn, TOut, TErr>,
): StageDefinitionInfo<TErr> | undefined {
  return isStageDefinition(step)
    ? (step as StageDefinition<TIn, TOut, TErr>)[STAGE_DEFINITION]
    : undefined;
}

type StageCommonConfig<TIn, TOut, TErr> = {
  readonly name: string;
  readonly inputSchema: WorkflowStep<TIn, TOut, TErr>["inputSchema"];
  readonly outputSchema: WorkflowStep<TIn, TOut, TErr>["outputSchema"];
  readonly execute: WorkflowStep<TIn, TOut, TErr>["execute"];
  readonly description?: string;
  readonly owners?: readonly string[];
  readonly tags?: readonly string[];
  readonly links?: readonly WorkflowMetadataLink[];
  readonly retry?: RetryConfig<TErr>;
  readonly version?: string;
};

export type BackendFunctionStageConfig<TIn, TOut, TErr> = StageCommonConfig<
  TIn,
  TOut,
  TErr
> & {
  readonly ports?: readonly string[];
  readonly capabilities?: readonly string[];
  readonly expects?: "sync" | "async";
};

type HtmxRouteRegistrar = (route: HtmxRouteSpec) => void;

export type FullStackHtmxStageConfig<
  TIn,
  TOut,
  TErr,
  TFragmentInput = TOut,
> = StageCommonConfig<TIn, TOut, TErr> & {
  readonly fragment: (viewModel: TFragmentInput) => string | Promise<string>;
  readonly routes: readonly HtmxRouteSpec[];
  readonly hydrateFragmentInput?: (output: TOut) => TFragmentInput;
  readonly head?: string | ((viewModel: TFragmentInput) => string | Promise<string>);
};

function freezeStage<TIn, TOut, TErr>(
  stage: WorkflowStep<TIn, TOut, TErr> & {
    readonly [STAGE_DEFINITION]: StageDefinitionInfo<TErr>;
  },
): StageDefinition<TIn, TOut, TErr> {
  return Object.freeze(stage) as StageDefinition<TIn, TOut, TErr>;
}

export function defineBackendFunctionStage<TIn, TOut, TErr>(
  config: BackendFunctionStageConfig<TIn, TOut, TErr>,
): StageDefinition<TIn, TOut, TErr> {
  const metadata: WorkflowStepMetadata<TErr> = {
    stageKind: "backend_function",
    description: config.description,
    owners: config.owners,
    tags: config.tags,
    links: config.links,
    retry: config.retry,
    ports: config.ports,
    capabilities: config.capabilities,
    expects: config.expects,
  };

  return freezeStage({
    name: config.name,
    inputSchema: config.inputSchema,
    outputSchema: config.outputSchema,
    execute: config.execute,
    metadata,
    [STAGE_DEFINITION]: {
      kind: "backend_function",
      version: config.version,
      summary: config.description,
      tags: config.tags,
      owners: config.owners,
    },
  });
}

export function defineFullStackHtmxStage<TIn, TOut, TErr, TFragmentInput = TOut>(
  config: FullStackHtmxStageConfig<TIn, TOut, TErr, TFragmentInput>,
): StageDefinition<TIn, TOut, TErr> {
  const hydrate = config.hydrateFragmentInput ?? ((output: TOut) =>
    output as unknown as TFragmentInput);
  const fragmentRenderer: FullStackStageUiMetadata["fragment"] = (input) =>
    config.fragment(input as TFragmentInput);
  let headRenderer: FullStackStageUiMetadata["head"];
  if (typeof config.head === "string" || typeof config.head === "undefined") {
    headRenderer = config.head;
  } else if (config.head) {
    const fn = config.head;
    headRenderer = (input: unknown) => fn(input as TFragmentInput);
  }
  const hydrateUnknown: FullStackStageUiMetadata["hydrate"] = (output) =>
    hydrate(output as TOut);
  const ui: FullStackStageUiMetadata = {
    fragment: fragmentRenderer,
    routes: [...config.routes],
    head: headRenderer,
    hydrate: hydrateUnknown,
  };

  const metadata: WorkflowStepMetadata<TErr> = {
    stageKind: "fullstack_htmx",
    description: config.description,
    owners: config.owners,
    tags: config.tags,
    links: config.links,
    retry: config.retry,
    ui,
  };

  return freezeStage({
    name: config.name,
    inputSchema: config.inputSchema,
    outputSchema: config.outputSchema,
    execute: config.execute,
    metadata,
    [STAGE_DEFINITION]: {
      kind: "fullstack_htmx",
      version: config.version,
      summary: config.description,
      tags: config.tags,
      owners: config.owners,
      ui,
    },
  });
}

export interface StageCatalog {
  register<TIn, TOut, TErr>(
    stage: StageDefinition<TIn, TOut, TErr>,
  ): void;
  get(name: string): StageDefinition<any, any, any> | undefined;
  list(): readonly StageDefinition<any, any, any>[];
  byKind(kind: StageKind): readonly StageDefinition<any, any, any>[];
}

export function createStageCatalog(
  initial?: readonly StageDefinition<any, any, any>[],
): StageCatalog {
  const stages = new Map<string, StageDefinition<any, any, any>>();
  if (initial) {
    for (const stage of initial) {
      if (stages.has(stage.name)) {
        throw new Error(`Duplicate stage registered: ${stage.name}`);
      }
      stages.set(stage.name, stage);
    }
  }

  return {
    register(stage) {
      if (stages.has(stage.name)) {
        throw new Error(`Duplicate stage registered: ${stage.name}`);
      }
      stages.set(stage.name, stage);
    },
    get(name) {
      return stages.get(name);
    },
    list() {
      return [...stages.values()];
    },
    byKind(kind) {
      return [...stages.values()].filter((stage) =>
        stage[STAGE_DEFINITION].kind === kind
      );
    },
  };
}

export function registerHtmxStageRoutes<TIn, TOut, TErr>(
  stage: StageDefinition<TIn, TOut, TErr>,
  register: HtmxRouteRegistrar,
): void {
  const info = stage[STAGE_DEFINITION];
  if (info.kind !== "fullstack_htmx") {
    throw new Error(
      `registerHtmxStageRoutes requires a fullstack_htmx stage, received ${info.kind}`,
    );
  }
  if (!info.ui) {
    throw new Error("Full-stack stage missing UI metadata");
  }
  for (const route of info.ui.routes) {
    register(route);
  }
}

export { STAGE_DEFINITION };
