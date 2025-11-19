/**
 * MCP Server types for LFTS workflow integration
 *
 * @module
 */

import type { Result } from "../lfts-type-runtime/mod.ts";

/**
 * MCP tool response wrapping LFTS Result types
 */
export type McpToolResponse<T, E> =
  | { success: true; data: T; metadata?: McpExecutionMetadata }
  | { success: false; error: E; metadata?: McpExecutionMetadata };

/**
 * Execution metadata attached to MCP responses
 */
export type McpExecutionMetadata = {
  /** Execution duration in milliseconds */
  durationMs?: number;
  /** Stage name that was executed */
  stageName?: string;
  /** Timestamp when execution started */
  startedAt?: string;
  /** Timestamp when execution finished */
  finishedAt?: string;
};

/**
 * Options for creating an MCP server from a catalog
 */
export type McpServerOptions = {
  /** Server name (defaults to "lfts-workflow") */
  name?: string;
  /** Server version (defaults to "1.0.0") */
  version?: string;
  /** Include execution metadata in responses */
  includeMetadata?: boolean;
  /** Include examples in tool descriptions */
  includeExamples?: boolean;
  /** Include retry configuration in tool metadata */
  includeRetryInfo?: boolean;
  /** Custom tool name transformer */
  transformToolName?: (stageName: string) => string;
};

/**
 * MCP resource descriptor for catalog browsing
 */
export type McpResourceDescriptor = {
  /** Resource URI (e.g., "lfts://catalog/stages") */
  uri: string;
  /** Human-readable name */
  name: string;
  /** Resource description */
  description?: string;
  /** MIME type (defaults to "application/json") */
  mimeType?: string;
};

/**
 * Result type for catalog queries
 */
export type CatalogQueryResult<T> = Result<T, CatalogQueryError>;

/**
 * Catalog query error types
 */
export type CatalogQueryError =
  | { type: "stage_not_found"; name: string }
  | { type: "invalid_kind"; kind: string }
  | { type: "invalid_tag"; tag: string }
  | { type: "empty_result"; query: string };

/**
 * Tool execution context for MCP handlers
 */
export type McpToolContext = {
  /** Tool name */
  toolName: string;
  /** Request timestamp */
  timestamp: string;
  /** Optional request ID for tracing */
  requestId?: string;
};
