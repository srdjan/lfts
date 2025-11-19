/**
 * Tool builder - Converts LFTS stages to MCP tool definitions
 *
 * @module
 */

import type { StageDefinition } from "../lfts-type-runtime/stage-types.ts";
import type { WorkflowMetadataLink } from "../lfts-type-runtime/workflow.ts";
import { generateJsonSchema } from "../lfts-codegen/json-schema.ts";
import type { McpServerOptions } from "./types.ts";

/**
 * MCP Tool definition (compatible with @modelcontextprotocol/sdk)
 */
export type McpToolDefinition = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>; // JSON Schema
};

/**
 * Convert a StageDefinition to an MCP tool definition
 */
export function stageToMcpTool(
  stage: StageDefinition<unknown, unknown, unknown>,
  options: McpServerOptions = {},
): McpToolDefinition {
  const toolName = options.transformToolName
    ? options.transformToolName(stage.name)
    : formatToolName(stage.name);

  const description = buildToolDescription(stage, options);
  const inputSchema = generateJsonSchema(stage.inputSchema);

  return {
    name: toolName,
    description,
    inputSchema,
  };
}

/**
 * Format stage name for MCP tool naming conventions
 * Converts "ProcessPayment" → "process_payment"
 */
function formatToolName(stageName: string): string {
  return stageName
    .replace(/([A-Z])/g, "_$1")
    .toLowerCase()
    .replace(/^_/, "");
}

/**
 * Build rich tool description from stage metadata
 */
function buildToolDescription(
  stage: StageDefinition<unknown, unknown, unknown>,
  options: McpServerOptions,
): string {
  const parts: string[] = [];

  // Main description
  if (stage.metadata?.description) {
    parts.push(stage.metadata.description);
  } else {
    parts.push(`Execute ${stage.name} workflow stage`);
  }

  // Owners
  if (stage.metadata?.owners && stage.metadata.owners.length > 0) {
    parts.push("");
    parts.push(`**Owners:** ${stage.metadata.owners.join(", ")}`);
  }

  // Tags
  if (stage.metadata?.tags && stage.metadata.tags.length > 0) {
    parts.push(`**Tags:** ${stage.metadata.tags.join(", ")}`);
  }

  // Stage kind
  if (stage.metadata?.stageKind) {
    parts.push(`**Kind:** ${stage.metadata.stageKind}`);
  }

  // Retry configuration
  if (options.includeRetryInfo && stage.metadata?.retry) {
    parts.push("");
    parts.push("**Retry Configuration:**");
    parts.push(`- Max attempts: ${stage.metadata.retry.maxAttempts || 3}`);
    if (stage.metadata.retry.initialDelayMs) {
      parts.push(`- Initial delay: ${stage.metadata.retry.initialDelayMs}ms`);
    }
    if (stage.metadata.retry.backoffMultiplier) {
      parts.push(
        `- Backoff multiplier: ${stage.metadata.retry.backoffMultiplier}`,
      );
    }
    if (stage.metadata.retry.maxDelayMs) {
      parts.push(`- Max delay: ${stage.metadata.retry.maxDelayMs}ms`);
    }
  }

  // Links (documentation, runbooks, etc.)
  if (stage.metadata?.links && stage.metadata.links.length > 0) {
    parts.push("");
    parts.push("**Links:**");
    for (const link of stage.metadata.links) {
      parts.push(formatLink(link));
    }
  }

  // Port dependencies (backend function only)
  if (stage.metadata?.stageKind === "backend_function") {
    const backendMeta = stage.metadata as {
      ports?: readonly string[];
      capabilities?: readonly string[];
      expects?: "sync" | "async";
    };

    if (backendMeta.ports && backendMeta.ports.length > 0) {
      parts.push("");
      parts.push(`**Port Dependencies:** ${backendMeta.ports.join(", ")}`);
    }

    if (backendMeta.capabilities && backendMeta.capabilities.length > 0) {
      parts.push(`**Capabilities:** ${backendMeta.capabilities.join(", ")}`);
    }

    if (backendMeta.expects) {
      parts.push(`**Execution Mode:** ${backendMeta.expects}`);
    }
  }

  return parts.join("\n");
}

/**
 * Format a WorkflowMetadataLink for markdown
 */
function formatLink(link: WorkflowMetadataLink): string {
  if (link.title) {
    return `- [${link.title}](${link.href}) (${link.rel})`;
  }
  return `- [${link.rel}](${link.href})`;
}

/**
 * Convert multiple stages to MCP tool definitions
 */
export function stagesToMcpTools(
  stages: StageDefinition<unknown, unknown, unknown>[],
  options: McpServerOptions = {},
): McpToolDefinition[] {
  return stages.map((stage) => stageToMcpTool(stage, options));
}
