/**
 * MCP Server unit tests
 */

import { assertEquals, assertExists } from "jsr:@std/assert@1";
import { Result, t } from "../lfts-type-runtime/mod.ts";
import {
  createStageCatalog,
  defineBackendFunctionStage,
  defineFullStackHtmxStage,
} from "../lfts-type-runtime/stage-types.ts";
import { createMcpServer } from "./server.ts";
import type { McpToolResponse } from "./types.ts";

// Test schemas
const PaymentInput$ = t.object({
  amount: t.number().min(0),
  customerId: t.string().pattern("^cust_[0-9]+$"),
}).bc;

const PaymentOutput$ = t.object({
  transactionId: t.string(),
  status: t.literal("approved"),
}).bc;

const RefundInput$ = t.object({
  transactionId: t.string(),
  amount: t.number().min(0),
}).bc;

const RefundOutput$ = t.object({
  refundId: t.string(),
  status: t.literal("processed"),
}).bc;

Deno.test("createMcpServer - Creates server with default options", () => {
  const paymentStage = defineBackendFunctionStage({
    name: "ProcessPayment",
    inputSchema: PaymentInput$,
    outputSchema: PaymentOutput$,
    execute: async (input: { amount: number; customerId: string }) =>
      Result.ok({
        transactionId: "txn_123",
        status: "approved" as const,
      }),
  });

  const catalog = createStageCatalog([paymentStage]);
  const server = createMcpServer(catalog);

  const info = server.getServerInfo();
  assertEquals(info.name, "lfts-workflow");
  assertEquals(info.version, "1.0.0");
});

Deno.test("createMcpServer - Honors custom server options", () => {
  const catalog = createStageCatalog([]);
  const server = createMcpServer(catalog, {
    name: "payment-api",
    version: "2.3.4",
    includeMetadata: false,
  });

  const info = server.getServerInfo();
  assertEquals(info.name, "payment-api");
  assertEquals(info.version, "2.3.4");
});

Deno.test("listTools - Returns all catalog stages as MCP tools", () => {
  const paymentStage = defineBackendFunctionStage({
    name: "ProcessPayment",
    inputSchema: PaymentInput$,
    outputSchema: PaymentOutput$,
    description: "Process customer payment",
    execute: async () => Result.ok({ transactionId: "123", status: "approved" as const }),
  });

  const refundStage = defineBackendFunctionStage({
    name: "ProcessRefund",
    inputSchema: RefundInput$,
    outputSchema: RefundOutput$,
    description: "Refund a previous transaction",
    execute: async () => Result.ok({ refundId: "ref_123", status: "processed" as const }),
  });

  const catalog = createStageCatalog([paymentStage, refundStage]);
  const server = createMcpServer(catalog);

  const tools = server.listTools();
  assertEquals(tools.length, 2);

  const paymentTool = tools.find((t) => t.name === "ProcessPayment");
  assertExists(paymentTool);
  assertEquals(paymentTool.description.includes("Process customer payment"), true);
  assertExists(paymentTool.inputSchema);

  const refundTool = tools.find((t) => t.name === "ProcessRefund");
  assertExists(refundTool);
  assertEquals(refundTool.description.includes("Refund a previous transaction"), true);
});

Deno.test("listTools - Includes metadata in tool descriptions", () => {
  const stage = defineBackendFunctionStage({
    name: "VerifyIdentity",
    inputSchema: PaymentInput$,
    outputSchema: PaymentOutput$,
    description: "Verify user identity",
    owners: ["security-team@example.com", "compliance@example.com"],
    tags: ["security", "compliance", "critical"],
    ports: ["IdentityProviderPort"],
    retry: {
      maxAttempts: 3,
      initialDelayMs: 1000,
    },
    execute: async () => Result.ok({ transactionId: "123", status: "approved" as const }),
  });

  const catalog = createStageCatalog([stage]);
  const server = createMcpServer(catalog, { includeRetryInfo: true });

  const tools = server.listTools();
  const tool = tools[0];

  assertEquals(tool.description.includes("security-team@example.com"), true);
  assertEquals(tool.description.includes("compliance@example.com"), true);
  assertEquals(tool.description.includes("security, compliance, critical"), true);
  assertEquals(tool.description.includes("Max attempts: 3"), true);
  assertEquals(tool.description.includes("Initial delay: 1000ms"), true);
  assertEquals(tool.description.includes("IdentityProviderPort"), true);
});

Deno.test("getTool - Returns specific tool by name", () => {
  const stage = defineBackendFunctionStage({
    name: "ProcessPayment",
    inputSchema: PaymentInput$,
    outputSchema: PaymentOutput$,
    execute: async () => Result.ok({ transactionId: "123", status: "approved" as const }),
  });

  const catalog = createStageCatalog([stage]);
  const server = createMcpServer(catalog);

  const tool = server.getTool("ProcessPayment");
  assertExists(tool);
  assertEquals(tool.name, "ProcessPayment");
});

Deno.test("getTool - Returns null for unknown tool", () => {
  const catalog = createStageCatalog([]);
  const server = createMcpServer(catalog);

  const tool = server.getTool("UnknownTool");
  assertEquals(tool, null);
});

Deno.test("callTool - Executes stage successfully", async () => {
  const stage = defineBackendFunctionStage({
    name: "ProcessPayment",
    inputSchema: PaymentInput$,
    outputSchema: PaymentOutput$,
    execute: async (input: { amount: number; customerId: string }) =>
      Result.ok({
        transactionId: `txn_${input.amount}`,
        status: "approved" as const,
      }),
  });

  const catalog = createStageCatalog([stage]);
  const server = createMcpServer(catalog);

  const result = await server.callTool("ProcessPayment", {
    amount: 100,
    customerId: "cust_123",
  });

  assertEquals(result.success, true);
  if (result.success) {
    assertEquals(result.data.transactionId, "txn_100");
    assertEquals(result.data.status, "approved");
    assertExists(result.metadata);
    assertExists(result.metadata.durationMs);
    assertExists(result.metadata.startedAt);
    assertExists(result.metadata.finishedAt);
  }
});

Deno.test("callTool - Returns error for validation failure", async () => {
  const stage = defineBackendFunctionStage({
    name: "ProcessPayment",
    inputSchema: PaymentInput$,
    outputSchema: PaymentOutput$,
    execute: async () => Result.ok({ transactionId: "123", status: "approved" as const }),
  });

  const catalog = createStageCatalog([stage]);
  const server = createMcpServer(catalog);

  // Invalid input (negative amount)
  const result = await server.callTool("ProcessPayment", {
    amount: -50,
    customerId: "cust_123",
  });

  assertEquals(result.success, false);
  if (!result.success) {
    assertEquals(result.error.type, "validation_failed");
  }
});

Deno.test("callTool - Returns error for unknown tool", async () => {
  const catalog = createStageCatalog([]);
  const server = createMcpServer(catalog);

  const result = await server.callTool("UnknownTool", {});

  assertEquals(result.success, false);
  if (!result.success) {
    assertEquals(result.error.type, "stage_not_found");
  }
});

Deno.test("callTool - Respects includeMetadata option", async () => {
  const stage = defineBackendFunctionStage({
    name: "ProcessPayment",
    inputSchema: PaymentInput$,
    outputSchema: PaymentOutput$,
    execute: async () => Result.ok({ transactionId: "123", status: "approved" as const }),
  });

  const catalog = createStageCatalog([stage]);
  const server = createMcpServer(catalog, { includeMetadata: false });

  const result = await server.callTool("ProcessPayment", {
    amount: 100,
    customerId: "cust_123",
  });

  assertEquals(result.success, true);
  if (result.success) {
    assertEquals(result.metadata, undefined);
  }
});

Deno.test("listResources - Returns catalog resource descriptors", () => {
  const catalog = createStageCatalog([]);
  const server = createMcpServer(catalog);

  const resources = server.listResources();

  assertEquals(resources.length > 0, true);

  const allStagesResource = resources.find((r) =>
    r.uri === "lfts://catalog/stages"
  );
  assertExists(allStagesResource);
  assertEquals(allStagesResource.name, "All Workflow Stages");
});

Deno.test("readResource - Returns all stages", () => {
  const stage1 = defineBackendFunctionStage({
    name: "Stage1",
    inputSchema: PaymentInput$,
    outputSchema: PaymentOutput$,
    execute: async () => Result.ok({ transactionId: "123", status: "approved" as const }),
  });

  const stage2 = defineBackendFunctionStage({
    name: "Stage2",
    inputSchema: PaymentInput$,
    outputSchema: PaymentOutput$,
    execute: async () => Result.ok({ transactionId: "456", status: "approved" as const }),
  });

  const catalog = createStageCatalog([stage1, stage2]);
  const server = createMcpServer(catalog);

  const result = server.readResource("lfts://catalog/stages");

  assertEquals(result.ok, true);
  if (result.ok) {
    assertEquals(Array.isArray(result.value), true);
    assertEquals((result.value as unknown[]).length, 2);
  }
});

Deno.test("readResource - Filters by kind", () => {
  const backendStage = defineBackendFunctionStage({
    name: "Backend",
    inputSchema: PaymentInput$,
    outputSchema: PaymentOutput$,
    execute: async () => Result.ok({ transactionId: "123", status: "approved" as const }),
  });

  const htmxStage = defineFullStackHtmxStage({
    name: "HTMX",
    inputSchema: PaymentInput$,
    outputSchema: PaymentOutput$,
    fragment: () => "<div>test</div>",
    routes: [],
    execute: async () => Result.ok({ transactionId: "456", status: "approved" as const }),
  });

  const catalog = createStageCatalog([backendStage, htmxStage]);
  const server = createMcpServer(catalog);

  const backendResult = server.readResource(
    "lfts://catalog/kinds/backend_function",
  );
  assertEquals(backendResult.ok, true);
  if (backendResult.ok) {
    assertEquals((backendResult.value as unknown[]).length, 1);
  }

  const htmxResult = server.readResource("lfts://catalog/kinds/fullstack_htmx");
  assertEquals(htmxResult.ok, true);
  if (htmxResult.ok) {
    assertEquals((htmxResult.value as unknown[]).length, 1);
  }
});

Deno.test("readResource - Filters by tag", () => {
  const paymentStage = defineBackendFunctionStage({
    name: "ProcessPayment",
    inputSchema: PaymentInput$,
    outputSchema: PaymentOutput$,
    tags: ["payment", "critical"],
    execute: async () => Result.ok({ transactionId: "123", status: "approved" as const }),
  });

  const refundStage = defineBackendFunctionStage({
    name: "ProcessRefund",
    inputSchema: RefundInput$,
    outputSchema: RefundOutput$,
    tags: ["payment"],
    execute: async () => Result.ok({ refundId: "ref_123", status: "processed" as const }),
  });

  const catalog = createStageCatalog([paymentStage, refundStage]);
  const server = createMcpServer(catalog);

  const paymentResult = server.readResource("lfts://catalog/tags/payment");
  assertEquals(paymentResult.ok, true);
  if (paymentResult.ok) {
    assertEquals((paymentResult.value as unknown[]).length, 2);
  }

  const criticalResult = server.readResource("lfts://catalog/tags/critical");
  assertEquals(criticalResult.ok, true);
  if (criticalResult.ok) {
    assertEquals((criticalResult.value as unknown[]).length, 1);
  }
});

Deno.test("readResource - Gets stage by name", () => {
  const stage = defineBackendFunctionStage({
    name: "ProcessPayment",
    inputSchema: PaymentInput$,
    outputSchema: PaymentOutput$,
    execute: async () => Result.ok({ transactionId: "123", status: "approved" as const }),
  });

  const catalog = createStageCatalog([stage]);
  const server = createMcpServer(catalog);

  const result = server.readResource("lfts://catalog/stages/ProcessPayment");

  assertEquals(result.ok, true);
  if (result.ok) {
    const stageData = result.value as { name: string };
    assertEquals(stageData.name, "ProcessPayment");
  }
});

Deno.test("readResource - Returns catalog stats", () => {
  const stage1 = defineBackendFunctionStage({
    name: "Stage1",
    inputSchema: PaymentInput$,
    outputSchema: PaymentOutput$,
    tags: ["payment"],
    owners: ["team-a@example.com"],
    execute: async () => Result.ok({ transactionId: "123", status: "approved" as const }),
  });

  const stage2 = defineFullStackHtmxStage({
    name: "Stage2",
    inputSchema: PaymentInput$,
    outputSchema: PaymentOutput$,
    tags: ["ui", "payment"],
    owners: ["team-b@example.com"],
    fragment: () => "<div>test</div>",
    routes: [],
    execute: async () => Result.ok({ transactionId: "456", status: "approved" as const }),
  });

  const catalog = createStageCatalog([stage1, stage2]);
  const server = createMcpServer(catalog);

  const result = server.readResource("lfts://catalog/stats");

  assertEquals(result.ok, true);
  if (result.ok) {
    const stats = result.value as {
      totalStages: number;
      backendStages: number;
      htmxStages: number;
      tags: string[];
      owners: string[];
    };
    assertEquals(stats.totalStages, 2);
    assertEquals(stats.backendStages, 1);
    assertEquals(stats.htmxStages, 1);
    assertEquals(stats.tags.includes("payment"), true);
    assertEquals(stats.tags.includes("ui"), true);
    assertEquals(stats.owners.includes("team-a@example.com"), true);
    assertEquals(stats.owners.includes("team-b@example.com"), true);
  }
});
