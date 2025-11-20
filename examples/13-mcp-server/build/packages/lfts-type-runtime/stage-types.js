const STAGE_DEFINITION = Symbol.for("lfts.stageDefinition");
export function isStageDefinition(step) {
    return Boolean(step && typeof step === "object" && STAGE_DEFINITION in step);
}
export function getStageDefinitionInfo(step) {
    return isStageDefinition(step)
        ? step[STAGE_DEFINITION]
        : undefined;
}
function freezeStage(stage) {
    return Object.freeze(stage);
}
export function defineBackendFunctionStage(config) {
    const metadata = {
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
export function defineFullStackHtmxStage(config) {
    const hydrate = config.hydrateFragmentInput ?? ((output) => output);
    const fragmentRenderer = (input) => config.fragment(input);
    let headRenderer;
    if (typeof config.head === "string" || typeof config.head === "undefined") {
        headRenderer = config.head;
    }
    else if (config.head) {
        const fn = config.head;
        headRenderer = (input) => fn(input);
    }
    const hydrateUnknown = (output) => hydrate(output);
    const ui = {
        fragment: fragmentRenderer,
        routes: [...config.routes],
        head: headRenderer,
        hydrate: hydrateUnknown,
    };
    const metadata = {
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
export function createStageCatalog(initial) {
    const stages = new Map();
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
            return [...stages.values()].filter((stage) => stage[STAGE_DEFINITION].kind === kind);
        },
    };
}
export function registerHtmxStageRoutes(stage, register) {
    const info = stage[STAGE_DEFINITION];
    if (info.kind !== "fullstack_htmx") {
        throw new Error(`registerHtmxStageRoutes requires a fullstack_htmx stage, received ${info.kind}`);
    }
    if (!info.ui) {
        throw new Error("Full-stack stage missing UI metadata");
    }
    for (const route of info.ui.routes) {
        register(route);
    }
}
export { STAGE_DEFINITION };
