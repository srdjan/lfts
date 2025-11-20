/**
 * Example 13: MCP Server - AI Agent Integration
 *
 * Demonstrates how to expose LFTS workflows to AI agents via the Model Context Protocol (MCP).
 * This example shows:
 * - Creating workflow stages with rich metadata
 * - Building an MCP server from a catalog
 * - Tool listing and invocation
 * - Resource browsing (catalog queries)
 * - Error handling and validation
 */
import { t, Result } from "../../packages/lfts-type-runtime/mod.js";
import { createStageCatalog, defineBackendFunctionStage, defineFullStackHtmxStage, } from "../../packages/lfts-type-runtime/stage-types.js";
import { createMcpServer } from "../../packages/lfts-mcp-server/mod.js";
// ===== Schemas =====
const PaymentInput$ = t.object({
    amount: t.number().min(0),
    customerId: t.string().pattern("^cust_[0-9]+$"),
    currency: t.string().pattern("^[A-Z]{3}$"), // ISO 4217 currency code (3 uppercase letters)
}).bc;
const PaymentOutput$ = t.object({
    transactionId: t.string(),
    status: t.stringEnum(["approved", "pending", "declined"]),
    processedAt: t.string(),
}).bc;
const RefundInput$ = t.object({
    transactionId: t.string(),
    amount: t.number().min(0),
    reason: t.string().minLength(10),
}).bc;
const RefundOutput$ = t.object({
    refundId: t.string(),
    status: t.literal("processed"),
    processedAt: t.string(),
}).bc;
const StatusInput$ = t.object({
    transactionId: t.string(),
}).bc;
const StatusOutput$ = t.object({
    transactionId: t.string(),
    status: t.stringEnum(["approved", "pending", "declined", "refunded"]),
    amount: t.number(),
    createdAt: t.string(),
}).bc;
// ===== Workflow Stages =====
const processPaymentStage = defineBackendFunctionStage({
    name: "ProcessPayment",
    inputSchema: PaymentInput$,
    outputSchema: PaymentOutput$,
    execute: async (input) => {
        // Simulate payment processing
        console.log(`Processing payment: $${input.amount} for ${input.customerId}`);
        // Simulate API delay
        await new Promise((resolve) => setTimeout(resolve, 100));
        // Simulate approval (90% success rate)
        const approved = Math.random() > 0.1;
        return Result.ok({
            transactionId: `txn_${Date.now()}`,
            status: approved ? "approved" : "declined",
            processedAt: new Date().toISOString(),
        });
    },
    // Rich metadata for AI agents
    description: "Process customer payment with fraud detection, authorization, and settlement. Automatically retries on network failures.",
    owners: ["payments-team@example.com", "platform@example.com"],
    tags: ["payment", "critical", "revenue"],
    ports: ["PaymentGatewayPort", "FraudDetectionPort"],
    capabilities: ["write:payment", "read:customer"],
    expects: "async",
    retry: {
        maxAttempts: 3,
        initialDelayMs: 1000,
        backoffMultiplier: 2,
        maxDelayMs: 5000,
    },
    links: [
        {
            rel: "documentation",
            href: "https://docs.example.com/payments/process",
            title: "Payment Processing Guide",
        },
        {
            rel: "runbook",
            href: "https://runbooks.example.com/payments",
            title: "Payment Troubleshooting",
        },
    ],
});
const refundPaymentStage = defineBackendFunctionStage({
    name: "RefundPayment",
    inputSchema: RefundInput$,
    outputSchema: RefundOutput$,
    execute: async (input) => {
        console.log(`Processing refund: $${input.amount} for ${input.transactionId}`);
        console.log(`Reason: ${input.reason}`);
        await new Promise((resolve) => setTimeout(resolve, 80));
        return Result.ok({
            refundId: `ref_${Date.now()}`,
            status: "processed",
            processedAt: new Date().toISOString(),
        });
    },
    description: "Refund a previous payment transaction. Validates original transaction exists and amount is valid. Creates audit trail.",
    owners: ["payments-team@example.com"],
    tags: ["payment", "refund"],
    ports: ["PaymentGatewayPort", "LedgerPort"],
    capabilities: ["write:refund", "read:transaction"],
    retry: {
        maxAttempts: 2,
        initialDelayMs: 500,
    },
    links: [
        {
            rel: "documentation",
            href: "https://docs.example.com/payments/refund",
            title: "Refund Processing Guide",
        },
    ],
});
const checkPaymentStatusStage = defineBackendFunctionStage({
    name: "CheckPaymentStatus",
    inputSchema: StatusInput$,
    outputSchema: StatusOutput$,
    execute: async (input) => {
        console.log(`Checking status for transaction: ${input.transactionId}`);
        await new Promise((resolve) => setTimeout(resolve, 50));
        // Simulate status lookup
        return Result.ok({
            transactionId: input.transactionId,
            status: "approved",
            amount: 100,
            createdAt: new Date().toISOString(),
        });
    },
    description: "Query payment transaction status. Read-only operation with no side effects.",
    owners: ["payments-team@example.com"],
    tags: ["payment", "query"],
    ports: ["PaymentGatewayPort"],
    capabilities: ["read:transaction"],
    expects: "sync",
});
const renderPaymentUIStage = defineFullStackHtmxStage({
    name: "RenderPaymentUI",
    inputSchema: StatusOutput$,
    outputSchema: StatusOutput$,
    fragment: (data) => {
        const statusColor = data.status === "approved" ? "green" : data.status === "declined" ? "red" : "orange";
        return `
      <div class="payment-card" style="border: 2px solid ${statusColor}; padding: 20px; border-radius: 8px;">
        <h2>Payment ${data.transactionId}</h2>
        <p><strong>Status:</strong> <span style="color: ${statusColor}">${data.status.toUpperCase()}</span></p>
        <p><strong>Amount:</strong> $${data.amount}</p>
        <p><strong>Created:</strong> ${data.createdAt}</p>
      </div>
    `;
    },
    routes: [
        {
            method: "GET",
            path: "/payments/:id",
            description: "Render payment status card",
            handler: () => ({
                status: 200,
                body: "<div>Payment status</div>",
            }),
        },
    ],
    execute: async (input) => {
        // Just pass through the data for HTMX rendering
        return Result.ok(input);
    },
    description: "Render payment status as HTMX fragment for UI display",
    owners: ["frontend-team@example.com"],
    tags: ["ui", "payment"],
});
// ===== Create MCP Server =====
console.log("🚀 Creating MCP server for payment workflows...\n");
const catalog = createStageCatalog([
    processPaymentStage,
    refundPaymentStage,
    checkPaymentStatusStage,
    renderPaymentUIStage,
]);
const server = createMcpServer(catalog, {
    name: "payment-workflows",
    version: "1.0.0",
    includeMetadata: true,
    includeRetryInfo: true,
});
// ===== Demo: Server Info =====
console.log("=".repeat(60));
console.log("SERVER INFO");
console.log("=".repeat(60));
const info = server.getServerInfo();
console.log(`Name: ${info.name}`);
console.log(`Version: ${info.version}\n`);
// ===== Demo: List Tools =====
console.log("=".repeat(60));
console.log("AVAILABLE TOOLS");
console.log("=".repeat(60));
const tools = server.listTools();
console.log(`Total tools: ${tools.length}\n`);
for (const tool of tools) {
    console.log(`📦 ${tool.name}`);
    console.log(`   ${tool.description.split("\n")[0]}`);
    console.log("");
}
// ===== Demo: Tool Invocation =====
console.log("=".repeat(60));
console.log("TOOL INVOCATION EXAMPLES");
console.log("=".repeat(60));
// Example 1: Successful payment
console.log("\n1️⃣  Processing payment (valid input):");
const paymentResult = await server.callTool("ProcessPayment", {
    amount: 100,
    customerId: "cust_123",
    currency: "USD",
});
if (paymentResult.success) {
    console.log("   ✅ Success!");
    console.log(`   Transaction ID: ${paymentResult.data.transactionId}`);
    console.log(`   Status: ${paymentResult.data.status}`);
    console.log(`   Duration: ${paymentResult.metadata?.durationMs}ms`);
}
else {
    console.log("   ❌ Failed:", paymentResult.error);
}
// Example 2: Validation error
console.log("\n2️⃣  Processing payment (invalid input - negative amount):");
const invalidPaymentResult = await server.callTool("ProcessPayment", {
    amount: -50,
    customerId: "cust_456",
    currency: "USD",
});
if (invalidPaymentResult.success) {
    console.log("   ✅ Success (unexpected!)");
}
else {
    console.log("   ❌ Validation failed (expected)");
    console.log(`   Error type: ${invalidPaymentResult.error.type}`);
}
// Example 3: Unknown tool
console.log("\n3️⃣  Calling unknown tool:");
const unknownResult = await server.callTool("UnknownTool", {});
if (unknownResult.success) {
    console.log("   ✅ Success (unexpected!)");
}
else {
    console.log("   ❌ Tool not found (expected)");
    console.log(`   Error: ${unknownResult.error.type} - ${unknownResult.error.name}`);
}
// Example 4: Refund
console.log("\n4️⃣  Processing refund:");
const refundResult = await server.callTool("RefundPayment", {
    transactionId: "txn_12345",
    amount: 50,
    reason: "Customer requested refund due to duplicate charge",
});
if (refundResult.success) {
    console.log("   ✅ Refund processed!");
    console.log(`   Refund ID: ${refundResult.data.refundId}`);
    console.log(`   Duration: ${refundResult.metadata?.durationMs}ms`);
}
// ===== Demo: Resource Browsing =====
console.log("\n" + "=".repeat(60));
console.log("CATALOG RESOURCE BROWSING");
console.log("=".repeat(60));
// List all resources
console.log("\n📚 Available resources:");
const resources = server.listResources();
for (const resource of resources) {
    console.log(`   ${resource.uri}`);
    console.log(`      ${resource.description}`);
}
// Query by tag
console.log("\n🏷️  Stages with tag 'payment':");
const paymentStagesResult = server.readResource("lfts://catalog/tags/payment");
if (paymentStagesResult.ok) {
    const stages = paymentStagesResult.value;
    console.log(`   Found ${stages.length} stages:`);
    for (const stage of stages) {
        console.log(`   - ${stage.name}`);
    }
}
// Query by kind
console.log("\n🔧 Backend function stages:");
const backendResult = server.readResource("lfts://catalog/kinds/backend_function");
if (backendResult.ok) {
    const stages = backendResult.value;
    console.log(`   Found ${stages.length} stages:`);
    for (const stage of stages) {
        console.log(`   - ${stage.name}`);
    }
}
// Catalog stats
console.log("\n📊 Catalog statistics:");
const statsResult = server.readResource("lfts://catalog/stats");
if (statsResult.ok) {
    const stats = statsResult.value;
    console.log(`   Total stages: ${stats.totalStages}`);
    console.log(`   Backend stages: ${stats.backendStages}`);
    console.log(`   HTMX stages: ${stats.htmxStages}`);
    console.log(`   Tags: ${stats.tags.join(", ")}`);
    console.log(`   Owners: ${stats.owners.join(", ")}`);
}
// ===== Demo: Tool Description Detail =====
console.log("\n" + "=".repeat(60));
console.log("DETAILED TOOL DESCRIPTION");
console.log("=".repeat(60));
const processTool = server.getTool("ProcessPayment");
if (processTool) {
    console.log(`\n${processTool.name}`);
    console.log("-".repeat(60));
    console.log(processTool.description);
    console.log("\nInput Schema:");
    console.log(JSON.stringify(processTool.inputSchema, null, 2));
}
console.log("\n" + "=".repeat(60));
console.log("✅ MCP Server Demo Complete!");
console.log("=".repeat(60));
console.log("\nNext steps:");
console.log("- Integrate with @modelcontextprotocol/sdk for full MCP protocol support");
console.log("- Expose via stdio transport for Claude Desktop integration");
console.log("- Add more workflow stages to your catalog");
console.log("- Customize tool descriptions and metadata");
