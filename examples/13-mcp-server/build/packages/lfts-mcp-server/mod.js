/**
 * LFTS MCP Server - Model Context Protocol integration for LFTS workflows
 *
 * Exposes LFTS workflow catalogs to AI agents via the Model Context Protocol (MCP).
 * Enables conversational workflow invocation with full type safety and automatic validation.
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
 *   execute: async (input) => Result.ok({ transactionId: "txn_123" }),
 *   description: "Process payment with fraud detection",
 *   tags: ["payment", "critical"],
 *   owners: ["payments-team@example.com"],
 * });
 *
 * const catalog = createStageCatalog([paymentStage]);
 * const server = createMcpServer(catalog, {
 *   name: "payment-workflows",
 *   includeMetadata: true,
 *   includeRetryInfo: true,
 * });
 *
 * // List available tools
 * const tools = server.listTools();
 * console.log(tools); // [{ name: "ProcessPayment", description: "...", inputSchema: {...} }]
 *
 * // Execute tool
 * const result = await server.callTool("ProcessPayment", {
 *   amount: 100,
 *   customerId: "cust_123"
 * });
 *
 * if (result.success) {
 *   console.log("Payment processed:", result.data);
 * } else {
 *   console.error("Payment failed:", result.error);
 * }
 *
 * // Browse catalog resources
 * const allStages = server.readResource("lfts://catalog/stages");
 * const backendStages = server.readResource("lfts://catalog/kinds/backend_function");
 * const paymentStages = server.readResource("lfts://catalog/tags/payment");
 * ```
 *
 * @module
 */
// Core server
export { createMcpServer, LftsMcpServer } from "./server.js";
// Tool builder utilities
export { stageToMcpTool, stagesToMcpTools, } from "./tool-builder.js";
// Resource builder utilities
export { getCatalogResources, handleResourceQuery, listAllStages, listStagesByKind, listStagesByTag, getStageByName, getCatalogStats, CATALOG_RESOURCES, } from "./resource-builder.js";
