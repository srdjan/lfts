/**
 * Resource builder - Exposes catalog as browsable MCP resources
 *
 * @module
 */
import { Result } from "../lfts-type-runtime/mod.js";
/**
 * Available catalog resource URIs
 */
export const CATALOG_RESOURCES = {
    /** List all stages in the catalog */
    ALL_STAGES: "lfts://catalog/stages",
    /** Query backend function stages */
    BACKEND_STAGES: "lfts://catalog/kinds/backend_function",
    /** Query full-stack HTMX stages */
    HTMX_STAGES: "lfts://catalog/kinds/fullstack_htmx",
    /** Query by tag (parameterized) */
    BY_TAG: "lfts://catalog/tags/{tag}",
    /** Get stage by name (parameterized) */
    BY_NAME: "lfts://catalog/stages/{name}",
};
/**
 * Get all available resource descriptors
 */
export function getCatalogResources() {
    return [
        {
            uri: CATALOG_RESOURCES.ALL_STAGES,
            name: "All Workflow Stages",
            description: "Complete catalog of all registered workflow stages",
            mimeType: "application/json",
        },
        {
            uri: CATALOG_RESOURCES.BACKEND_STAGES,
            name: "Backend Function Stages",
            description: "Stages classified as backend_function",
            mimeType: "application/json",
        },
        {
            uri: CATALOG_RESOURCES.HTMX_STAGES,
            name: "Full-Stack HTMX Stages",
            description: "Stages with HTMX fragment rendering capabilities",
            mimeType: "application/json",
        },
        {
            uri: CATALOG_RESOURCES.BY_TAG,
            name: "Stages by Tag",
            description: "Filter stages by tag (URI template: /tags/{tag})",
            mimeType: "application/json",
        },
        {
            uri: CATALOG_RESOURCES.BY_NAME,
            name: "Stage by Name",
            description: "Get specific stage by name (URI template: /stages/{name})",
            mimeType: "application/json",
        },
    ];
}
/**
 * List all stages in catalog
 */
export function listAllStages(catalog) {
    const stages = catalog.list();
    return Result.ok(stages);
}
/**
 * Query stages by kind
 */
export function listStagesByKind(catalog, kind) {
    const validKinds = ["backend_function", "fullstack_htmx"];
    if (!validKinds.includes(kind)) {
        return Result.err({
            type: "invalid_kind",
            kind,
        });
    }
    const stages = catalog.byKind(kind);
    return Result.ok(stages);
}
/**
 * Query stages by tag
 */
export function listStagesByTag(catalog, tag) {
    if (!tag || tag.trim() === "") {
        return Result.err({
            type: "invalid_tag",
            tag,
        });
    }
    const stages = catalog
        .list()
        .filter((stage) => stage.metadata?.tags?.includes(tag));
    if (stages.length === 0) {
        return Result.err({
            type: "empty_result",
            query: `tag:${tag}`,
        });
    }
    return Result.ok(stages);
}
/**
 * Get stage by name
 */
export function getStageByName(catalog, name) {
    const stage = catalog.get(name);
    if (!stage) {
        return Result.err({
            type: "stage_not_found",
            name,
        });
    }
    return Result.ok(stage);
}
/**
 * Parse resource URI and execute appropriate query
 */
export function handleResourceQuery(catalog, uri) {
    // List all stages
    if (uri === CATALOG_RESOURCES.ALL_STAGES) {
        return listAllStages(catalog);
    }
    // Query by kind
    if (uri === CATALOG_RESOURCES.BACKEND_STAGES) {
        return listStagesByKind(catalog, "backend_function");
    }
    if (uri === CATALOG_RESOURCES.HTMX_STAGES) {
        return listStagesByKind(catalog, "fullstack_htmx");
    }
    // Query by tag (URI template: lfts://catalog/tags/{tag})
    const tagMatch = uri.match(/^lfts:\/\/catalog\/tags\/(.+)$/);
    if (tagMatch) {
        const tag = tagMatch[1];
        return listStagesByTag(catalog, tag);
    }
    // Get by name (URI template: lfts://catalog/stages/{name})
    const nameMatch = uri.match(/^lfts:\/\/catalog\/stages\/(.+)$/);
    if (nameMatch) {
        const name = nameMatch[1];
        return getStageByName(catalog, name);
    }
    // Unknown resource
    return Result.err({
        type: "empty_result",
        query: uri,
    });
}
/**
 * Get catalog statistics for summary resource
 */
export function getCatalogStats(catalog) {
    const allStages = catalog.list();
    const backendStages = catalog.byKind("backend_function");
    const htmxStages = catalog.byKind("fullstack_htmx");
    const allTags = new Set();
    const allOwners = new Set();
    for (const stage of allStages) {
        if (stage.metadata?.tags) {
            for (const tag of stage.metadata.tags) {
                allTags.add(tag);
            }
        }
        if (stage.metadata?.owners) {
            for (const owner of stage.metadata.owners) {
                allOwners.add(owner);
            }
        }
    }
    return {
        totalStages: allStages.length,
        backendStages: backendStages.length,
        htmxStages: htmxStages.length,
        tags: Array.from(allTags).sort(),
        owners: Array.from(allOwners).sort(),
    };
}
