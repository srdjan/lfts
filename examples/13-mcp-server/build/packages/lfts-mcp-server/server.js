/**
 * MCP Server implementation for LFTS workflows
 *
 * @module
 */
import { executeStep } from "../lfts-type-runtime/workflow.js";
import { Result } from "../lfts-type-runtime/mod.js";
import { stageToMcpTool, stagesToMcpTools } from "./tool-builder.js";
import { getCatalogResources, handleResourceQuery, getCatalogStats, } from "./resource-builder.js";
/**
 * LFTS MCP Server
 *
 * Exposes workflow catalog as MCP tools and resources
 */
export class LftsMcpServer {
    catalog;
    options;
    constructor(catalog, options = {}) {
        this.catalog = catalog;
        this.options = {
            name: options.name ?? "lfts-workflow",
            version: options.version ?? "1.0.0",
            includeMetadata: options.includeMetadata ?? true,
            includeExamples: options.includeExamples ?? false,
            includeRetryInfo: options.includeRetryInfo ?? true,
            transformToolName: options.transformToolName ?? ((name) => name),
        };
    }
    /**
     * Get server info (MCP protocol)
     */
    getServerInfo() {
        return {
            name: this.options.name,
            version: this.options.version,
        };
    }
    /**
     * List all available tools
     */
    listTools() {
        const stages = [...this.catalog.list()]; // Convert readonly to mutable
        return stagesToMcpTools(stages, this.options);
    }
    /**
     * Get tool definition by name
     */
    getTool(toolName) {
        const stage = this.catalog.get(toolName);
        if (!stage) {
            return null;
        }
        return stageToMcpTool(stage, this.options);
    }
    /**
     * Execute a tool (invoke workflow stage)
     */
    async callTool(toolName, params, context) {
        const startTime = performance.now();
        const startedAt = new Date().toISOString();
        // Get stage from catalog
        const stage = this.catalog.get(toolName);
        if (!stage) {
            return {
                success: false,
                error: {
                    type: "stage_not_found",
                    name: toolName,
                },
            };
        }
        // Execute stage with automatic validation
        const result = await executeStep(stage, params);
        const finishedAt = new Date().toISOString();
        const durationMs = performance.now() - startTime;
        // Build metadata
        const metadata = this.options
            .includeMetadata
            ? {
                durationMs,
                stageName: toolName,
                startedAt,
                finishedAt,
            }
            : undefined;
        // Return formatted response
        if (result.ok) {
            return {
                success: true,
                data: result.value,
                metadata,
            };
        }
        else {
            return {
                success: false,
                error: result.error,
                metadata,
            };
        }
    }
    /**
     * List available resources
     */
    listResources() {
        return getCatalogResources();
    }
    /**
     * Read a resource by URI
     */
    readResource(uri) {
        // Handle catalog statistics special resource
        if (uri === "lfts://catalog/stats") {
            return Result.ok(getCatalogStats(this.catalog));
        }
        // Handle standard catalog queries
        return handleResourceQuery(this.catalog, uri);
    }
    /**
     * Get catalog instance (for advanced usage)
     */
    getCatalog() {
        return this.catalog;
    }
}
/**
 * Create an MCP server from a workflow catalog
 *
 * @param catalog - Stage catalog containing workflow definitions
 * @param options - Server configuration options
 * @returns MCP server instance
 *
 * @example
 * ```typescript
 * import { createStageCatalog, defineBackendFunctionStage } from "lfts-type-runtime";
 * import { createMcpServer } from "lfts-mcp-server";
 *
 * const paymentStage = defineBackendFunctionStage({
 *   name: "ProcessPayment",
 *   inputSchema: PaymentInput$,
 *   outputSchema: PaymentOutput$,
 *   execute: async (input) => { ... },
 * });
 *
 * const catalog = createStageCatalog([paymentStage]);
 * const server = createMcpServer(catalog);
 *
 * // Server is now ready to expose via MCP transport
 * ```
 */
export function createMcpServer(catalog, options) {
    return new LftsMcpServer(catalog, options);
}
