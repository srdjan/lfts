/**
 * Resource builder - Exposes catalog as browsable MCP resources
 *
 * @module
 */

import type { StageCatalog } from "../lfts-type-runtime/stage-types.ts";
import type { StageKind } from "../lfts-type-runtime/workflow.ts";
import { Result } from "../lfts-type-runtime/mod.ts";
import type {
  CatalogQueryError,
  CatalogQueryResult,
  McpResourceDescriptor,
} from "./types.ts";

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
} as const;

/**
 * Get all available resource descriptors
 */
export function getCatalogResources(): McpResourceDescriptor[] {
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
export function listAllStages(
  catalog: StageCatalog,
): CatalogQueryResult<readonly unknown[]> {
  const stages = catalog.list();
  return Result.ok(stages);
}

/**
 * Query stages by kind
 */
export function listStagesByKind(
  catalog: StageCatalog,
  kind: StageKind,
): CatalogQueryResult<readonly unknown[]> {
  const validKinds: StageKind[] = ["backend_function", "fullstack_htmx"];

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
export function listStagesByTag(
  catalog: StageCatalog,
  tag: string,
): CatalogQueryResult<readonly unknown[]> {
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
export function getStageByName(
  catalog: StageCatalog,
  name: string,
): CatalogQueryResult<unknown> {
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
export function handleResourceQuery(
  catalog: StageCatalog,
  uri: string,
): CatalogQueryResult<unknown | readonly unknown[]> {
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
export function getCatalogStats(catalog: StageCatalog): {
  totalStages: number;
  backendStages: number;
  htmxStages: number;
  tags: string[];
  owners: string[];
} {
  const allStages = catalog.list();
  const backendStages = catalog.byKind("backend_function");
  const htmxStages = catalog.byKind("fullstack_htmx");

  const allTags = new Set<string>();
  const allOwners = new Set<string>();

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
