# MCP Server Guide: AI Agent Integration for LFTS Workflows

**Version:** v0.15.0+
**Status:** Production Ready
**Package:** `packages/lfts-mcp-server/`

## Table of Contents

- [Overview](#overview)
- [Quick Start](#quick-start)
- [Core Concepts](#core-concepts)
- [Server API](#server-api)
- [Resource Browsing](#resource-browsing)
- [Metadata-Driven Descriptions](#metadata-driven-descriptions)
- [Integration with MCP Protocol](#integration-with-mcp-protocol)
- [Best Practices](#best-practices)
- [Comparison with Alternatives](#comparison-with-alternatives)
- [Troubleshooting](#troubleshooting)

---

## Overview

The LFTS MCP Server exposes workflow catalogs to AI agents via the **Model Context Protocol (MCP)**—Anthropic's open standard for tool integration. This enables conversational workflow invocation with full type safety, automatic validation, and rich metadata.

**What is MCP?**

Model Context Protocol is an open protocol that allows AI models (like Claude) to:
- **Discover tools** - Browse available workflow operations
- **Understand capabilities** - Read rich descriptions with examples, constraints, retry policies
- **Invoke functions** - Call workflows with validated parameters
- **Access resources** - Query catalogs, filter by tags/kinds, inspect metadata

### Why LFTS + MCP?

| Feature | LFTS MCP Server | Traditional REST API | Function Calling (Raw) |
|---------|-----------------|---------------------|----------------------|
| **Schema Validation** | Automatic (LFTS bytecode) | Manual | Manual |
| **Type Safety** | Full TypeScript | Runtime only | Partial |
| **Self-Documenting** | Metadata → descriptions | Requires OpenAPI | Minimal |
| **Error Taxonomy** | Typed `Result<T, E>` | HTTP codes | Strings |
| **Retry Logic** | Declarative metadata | Custom code | N/A |
| **Discoverability** | MCP resources + tools | Static endpoints | Tool list only |
| **Observability** | Execution metadata | Custom logging | N/A |

---

## Quick Start

### 1. Define Workflow Stages

```typescript
import { t, Result } from "lfts-type-runtime";
import { defineBackendFunctionStage, createStageCatalog } from "lfts-type-runtime";

// Define schemas
const PaymentInput$ = t.object({
  amount: t.number().min(0),
  customerId: t.string().pattern("^cust_[0-9]+$"),
}).bc;

const PaymentOutput$ = t.object({
  transactionId: t.string(),
  status: t.literal("approved"),
}).bc;

// Create stage with metadata
const processPaymentStage = defineBackendFunctionStage({
  name: "ProcessPayment",
  inputSchema: PaymentInput$,
  outputSchema: PaymentOutput$,

  execute: async (input) => {
    // Business logic
    return Result.ok({
      transactionId: `txn_${Date.now()}`,
      status: "approved" as const,
    });
  },

  // Metadata for AI agents
  description: "Process customer payment with fraud detection",
  owners: ["payments-team@example.com"],
  tags: ["payment", "critical"],
  retry: {
    maxAttempts: 3,
    shouldRetry: (err) => err.type === "timeout",
  },
});
```

### 2. Create MCP Server

```typescript
import { createMcpServer } from "lfts-mcp-server";

const catalog = createStageCatalog([processPaymentStage, refundStage]);

const server = createMcpServer(catalog, {
  name: "payment-workflows",
  version: "1.0.0",
  includeMetadata: true,
  includeRetryInfo: true,
});
```

### 3. Use Server API

```typescript
// List tools (MCP protocol)
const tools = server.listTools();

// Execute tool
const result = await server.callTool("ProcessPayment", {
  amount: 100,
  customerId: "cust_123",
});

if (result.success) {
  console.log(result.data); // { transactionId: "...", status: "approved" }
  console.log(result.metadata.durationMs); // Execution time
}
```

---

## Core Concepts

### Tools vs Resources

**Tools** = Invokable workflows (LFTS stages)
- Each `StageDefinition` → one MCP tool
- JSON Schema for parameters (auto-generated from LFTS bytecode)
- Rich descriptions from metadata (owners, tags, retry, links)
- Execution returns `Result<T, E>` with metadata

**Resources** = Browsable catalog data
- List all stages: `lfts://catalog/stages`
- Filter by tag: `lfts://catalog/tags/payment`
- Filter by kind: `lfts://catalog/kinds/backend_function`
- Get stage details: `lfts://catalog/stages/ProcessPayment`
- Catalog stats: `lfts://catalog/stats`

### Metadata → MCP Descriptions

LFTS automatically enriches tool descriptions from stage metadata:

```typescript
defineBackendFunctionStage({
  name: "VerifyIdentity",
  // ... schemas ...
  description: "Verify user identity via provider",
  owners: ["security-team@example.com"],
  tags: ["security", "compliance"],
  ports: ["IdentityProviderPort"],
  retry: { maxAttempts: 3, initialDelayMs: 1000 },
  links: [
    { rel: "documentation", href: "https://docs.../identity", title: "Guide" }
  ],
});
```

**Generated MCP tool description:**
```
Verify user identity via provider

**Owners:** security-team@example.com
**Tags:** security, compliance
**Kind:** backend_function

**Retry Configuration:**
- Max attempts: 3
- Initial delay: 1000ms

**Links:**
- [Guide](https://docs.../identity) (documentation)

**Port Dependencies:** IdentityProviderPort
```

---

## Server API

### `createMcpServer(catalog, options?)`

**Parameters:**
- `catalog: StageCatalog` - Workflow catalog
- `options?: McpServerOptions`

**Options:**
```typescript
{
  name?: string;                   // Server name (default: "lfts-workflow")
  version?: string;                // Server version (default: "1.0.0")
  includeMetadata?: boolean;       // Execution metadata (default: true)
  includeExamples?: boolean;       // Examples in descriptions (default: false)
  includeRetryInfo?: boolean;      // Document retry policies (default: true)
  transformToolName?: (name: string) => string;  // Custom name transform
}
```

**Returns:** `LftsMcpServer`

---

### LftsMcpServer Methods

#### `getServerInfo()`

Returns server metadata.

```typescript
const info = server.getServerInfo();
// { name: "payment-workflows", version: "1.0.0" }
```

---

#### `listTools()`

Returns all available MCP tools (one per stage).

```typescript
const tools = server.listTools();
// [
//   {
//     name: "ProcessPayment",
//     description: "Process customer payment...",
//     inputSchema: { type: "object", properties: {...}, required: [...] }
//   },
//   ...
// ]
```

**Tool Schema Format:**
```typescript
{
  name: string;                        // Tool name (stage name)
  description: string;                 // Markdown description (from metadata)
  inputSchema: Record<string, unknown>; // JSON Schema (auto-generated)
}
```

---

#### `getTool(toolName)`

Get specific tool definition by name.

```typescript
const tool = server.getTool("ProcessPayment");
if (tool) {
  console.log(tool.description);
  console.log(tool.inputSchema);
} else {
  console.log("Tool not found");
}
```

**Returns:** `McpToolDefinition | null`

---

#### `callTool<T, E>(toolName, params, context?)`

Execute a workflow stage via MCP tool invocation.

```typescript
const result = await server.callTool("ProcessPayment", {
  amount: 100,
  customerId: "cust_123",
});

if (result.success) {
  console.log(result.data);          // Typed output
  console.log(result.metadata);      // { durationMs, stageName, startedAt, finishedAt }
} else {
  console.log(result.error);         // Typed error
  console.log(result.metadata);      // Still includes timing
}
```

**Parameters:**
- `toolName: string` - Name of tool (stage) to execute
- `params: unknown` - Input parameters (validated against inputSchema)
- `context?: McpToolContext` - Optional execution context

**Returns:** `Promise<McpToolResponse<T, E>>`

**Response Format:**
```typescript
type McpToolResponse<T, E> =
  | {
      success: true;
      data: T;
      metadata?: {
        durationMs: number;
        stageName: string;
        startedAt: string;
        finishedAt: string;
      };
    }
  | {
      success: false;
      error: E;
      metadata?: { ... };
    };
```

**Error Types:**
- `{ type: "validation_failed", stage, errors }` - Input validation failed
- `{ type: "output_invalid", stage, errors }` - Output validation failed
- `{ type: "stage_not_found", name }` - Unknown tool
- Custom error types from stage execution

---

#### `listResources()`

Returns available catalog resource descriptors.

```typescript
const resources = server.listResources();
// [
//   {
//     uri: "lfts://catalog/stages",
//     name: "All Workflow Stages",
//     description: "Complete catalog of all registered workflow stages",
//     mimeType: "application/json"
//   },
//   ...
// ]
```

---

#### `readResource(uri)`

Read a catalog resource by URI.

```typescript
// List all stages
const allStages = server.readResource("lfts://catalog/stages");

// Filter by tag
const paymentStages = server.readResource("lfts://catalog/tags/payment");

// Filter by kind
const backendStages = server.readResource("lfts://catalog/kinds/backend_function");

// Get specific stage
const stage = server.readResource("lfts://catalog/stages/ProcessPayment");

// Catalog statistics
const stats = server.readResource("lfts://catalog/stats");

if (result.ok) {
  console.log(result.value);
} else {
  console.error(result.error); // CatalogQueryError
}
```

**Returns:** `Result<T, CatalogQueryError>`

---

## Resource Browsing

### Available Resource URIs

| URI Pattern | Description | Example |
|------------|-------------|---------|
| `lfts://catalog/stages` | List all stages | All 10 stages in catalog |
| `lfts://catalog/kinds/{kind}` | Filter by kind | `backend_function`, `fullstack_htmx` |
| `lfts://catalog/tags/{tag}` | Filter by tag | `payment`, `critical`, `ui` |
| `lfts://catalog/stages/{name}` | Get stage by name | `ProcessPayment` |
| `lfts://catalog/stats` | Catalog statistics | Counts, tags, owners |

### Examples

**List all payment-related workflows:**
```typescript
const result = server.readResource("lfts://catalog/tags/payment");

if (result.ok) {
  const stages = result.value as StageDefinition[];
  console.log(`Found ${stages.length} payment stages:`);
  stages.forEach(s => console.log(` - ${s.name}`));
}
```

**Get catalog overview:**
```typescript
const result = server.readResource("lfts://catalog/stats");

if (result.ok) {
  const stats = result.value;
  console.log(`Total: ${stats.totalStages}`);
  console.log(`Backend: ${stats.backendStages}`);
  console.log(`HTMX: ${stats.htmxStages}`);
  console.log(`Tags: ${stats.tags.join(", ")}`);
  console.log(`Owners: ${stats.owners.join(", ")}`);
}
```

**Filter HTMX stages only:**
```typescript
const result = server.readResource("lfts://catalog/kinds/fullstack_htmx");

if (result.ok) {
  const htmxStages = result.value as StageDefinition[];
  // These stages have UI fragment rendering capabilities
}
```

---

## Metadata-Driven Descriptions

The MCP server auto-generates comprehensive tool descriptions from stage metadata. This makes workflows self-documenting for AI agents.

### Minimal Metadata

```typescript
defineBackendFunctionStage({
  name: "ProcessPayment",
  inputSchema: PaymentInput$,
  outputSchema: PaymentOutput$,
  execute: async (input) => { ... },
  description: "Process customer payment",
});
```

**Generated description:**
```
Process customer payment
```

### Rich Metadata

```typescript
defineBackendFunctionStage({
  name: "ProcessPayment",
  inputSchema: PaymentInput$,
  outputSchema: PaymentOutput$,
  execute: async (input) => { ... },

  description: "Process payment with fraud detection and settlement",
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
```

**Generated description:**
```
Process payment with fraud detection and settlement

**Owners:** payments-team@example.com, platform@example.com
**Tags:** payment, critical, revenue
**Kind:** backend_function

**Retry Configuration:**
- Max attempts: 3
- Initial delay: 1000ms
- Backoff multiplier: 2
- Max delay: 5000ms

**Links:**
- [Payment Processing Guide](https://docs.example.com/payments/process) (documentation)
- [Payment Troubleshooting](https://runbooks.example.com/payments) (runbook)

**Port Dependencies:** PaymentGatewayPort, FraudDetectionPort
**Capabilities:** write:payment, read:customer
**Execution Mode:** async
```

### Metadata Fields → Description Sections

| Metadata Field | Description Section | Format |
|---------------|--------------------|---------
| `description` | Main description | Plain text |
| `owners` | **Owners:** | Comma-separated list |
| `tags` | **Tags:** | Comma-separated list |
| `stageKind` | **Kind:** | `backend_function` / `fullstack_htmx` |
| `retry` | **Retry Configuration:** | Bulleted list |
| `links` | **Links:** | Markdown links with rel |
| `ports` | **Port Dependencies:** | Comma-separated list |
| `capabilities` | **Capabilities:** | Comma-separated list |
| `expects` | **Execution Mode:** | `sync` / `async` |

---

## Integration with MCP Protocol

While `lfts-mcp-server` provides the core server logic (tools, resources, execution), you'll typically expose it via an MCP transport layer for full protocol compliance.

### MCP Protocol Stack

```
┌─────────────────────────────────────┐
│   AI Agent (Claude Desktop/CLI)    │
└─────────────┬───────────────────────┘
              │ MCP Protocol (JSON-RPC 2.0)
┌─────────────▼───────────────────────┐
│   MCP Transport (stdio/HTTP/WS)    │
└─────────────┬───────────────────────┘
              │
┌─────────────▼───────────────────────┐
│   LftsMcpServer (this package)     │
│   - listTools()                     │
│   - callTool()                      │
│   - readResource()                  │
└─────────────┬───────────────────────┘
              │
┌─────────────▼───────────────────────┐
│   StageCatalog (lfts-type-runtime) │
│   - Workflow stage definitions      │
│   - Metadata, schemas, execute()    │
└─────────────────────────────────────┘
```

### Example: Stdio Transport (Claude Desktop)

```typescript
import { Server } from "@modelcontextprotocol/sdk/server";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio";
import { createMcpServer } from "lfts-mcp-server";
import { createStageCatalog } from "lfts-type-runtime";

// Create LFTS MCP server
const lftsServer = createMcpServer(catalog);

// Create MCP protocol server
const mcpServer = new Server(
  {
    name: lftsServer.getServerInfo().name,
    version: lftsServer.getServerInfo().version,
  },
  {
    capabilities: {
      tools: {},       // Supports tool listing/calling
      resources: {},   // Supports resource reading
    },
  },
);

// Register tools handler
mcpServer.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: lftsServer.listTools(),
  };
});

// Register tool execution handler
mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
  const result = await lftsServer.callTool(
    request.params.name,
    request.params.arguments,
  );

  if (result.success) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result.data, null, 2),
        },
      ],
    };
  } else {
    throw new McpError(
      ErrorCode.InternalError,
      JSON.stringify(result.error),
    );
  }
});

// Register resources handler
mcpServer.setRequestHandler(ListResourcesRequestSchema, async () => {
  return {
    resources: lftsServer.listResources(),
  };
});

mcpServer.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const result = lftsServer.readResource(request.params.uri);

  if (result.ok) {
    return {
      contents: [
        {
          uri: request.params.uri,
          mimeType: "application/json",
          text: JSON.stringify(result.value, null, 2),
        },
      ],
    };
  } else {
    throw new McpError(
      ErrorCode.InvalidRequest,
      `Resource not found: ${request.params.uri}`,
    );
  }
});

// Start stdio transport (for Claude Desktop)
const transport = new StdioServerTransport();
await mcpServer.connect(transport);
```

### Claude Desktop Configuration

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "payment-workflows": {
      "command": "deno",
      "args": ["run", "-A", "/path/to/mcp-server.ts"]
    }
  }
}
```

Now Claude Desktop can discover and invoke your workflows conversationally!

---

## Best Practices

### 1. Rich Metadata is Key

AI agents rely on descriptions to understand when/how to use tools. Provide:

✅ **DO:**
```typescript
{
  description: "Process payment with fraud detection. Validates amount, checks customer status, executes authorization, and settles transaction. Returns transaction ID on success.",
  owners: ["payments-team@example.com"],
  tags: ["payment", "critical"],
  links: [
    { rel: "documentation", href: "...", title: "Guide" }
  ],
}
```

❌ **DON'T:**
```typescript
{
  description: "Process payment",
}
```

### 2. Use Semantic Tags

Tags enable discovery. Use domain-specific, searchable tags:

✅ **DO:** `["payment", "fraud-detection", "pci-compliant", "critical"]`
❌ **DON'T:** `["prod", "v2", "new"]`

### 3. Document Retry Policies

Agents can make better decisions if they understand resilience:

```typescript
{
  retry: {
    maxAttempts: 3,
    initialDelayMs: 1000,
    shouldRetry: (err) => err.type === "timeout" || err.type === "connection_refused",
  },
}
```

This communicates: "Transient failures will auto-retry; don't retry manually."

### 4. Link to Documentation

Provide runbooks, guides, troubleshooting docs:

```typescript
{
  links: [
    { rel: "documentation", href: "https://docs.../payments", title: "Payment Guide" },
    { rel: "runbook", href: "https://runbooks.../payment-failures", title: "Troubleshooting" },
    { rel: "monitoring", href: "https://grafana.../payment-dashboard", title: "Metrics" },
  ],
}
```

### 5. Declare Port Dependencies

Helps agents understand prerequisites:

```typescript
{
  ports: ["PaymentGatewayPort", "FraudDetectionPort", "LedgerPort"],
  capabilities: ["write:payment", "read:customer", "write:ledger"],
}
```

### 6. Version Your Catalogs

When updating workflows, consider backward compatibility:

```typescript
createMcpServer(catalog, {
  name: "payment-workflows",
  version: "2.0.0",  // Increment on breaking changes
});
```

### 7. Handle Errors Explicitly

Return typed errors, not exceptions:

```typescript
execute: async (input) => {
  if (!isValidCustomer(input.customerId)) {
    return Result.err({
      type: "invalid_customer",
      customerId: input.customerId,
      reason: "Customer not found in CRM",
    });
  }

  // ... rest of logic
}
```

Agents can inspect `error.type` and retry appropriately.

---

## Comparison with Alternatives

### vs. OpenAPI + Function Calling

| Feature | LFTS MCP Server | OpenAPI + Function Calling |
|---------|-----------------|---------------------------|
| **Setup Complexity** | Low (auto-generate from catalog) | High (manual OpenAPI spec) |
| **Type Safety** | Full (TypeScript → JSON Schema) | Partial (runtime only) |
| **Validation** | Automatic (LFTS bytecode) | Manual (custom code) |
| **Metadata** | Built-in (retry, owners, tags) | Custom extensions (x-*) |
| **Discoverability** | MCP resources + tools | Static spec file |
| **Error Handling** | Typed Result<T, E> | HTTP status codes |
| **Retry Logic** | Declarative metadata | Not standardized |
| **Agent Integration** | Native MCP protocol | Function calling only |

**When to use OpenAPI:**
- Public API (external consumers)
- REST-first architecture
- Existing OpenAPI tooling

**When to use LFTS MCP:**
- AI agent integration (Claude, custom agents)
- Internal tooling (developer workflows)
- Type-safe automation

### vs. gRPC

| Feature | LFTS MCP Server | gRPC |
|---------|-----------------|------|
| **Protocol** | MCP (JSON-RPC 2.0) | HTTP/2 + Protobuf |
| **Transport** | Stdio, HTTP, WebSocket | HTTP/2 |
| **Schema** | JSON Schema (from LFTS) | Protobuf (.proto files) |
| **Code Gen** | Optional | Required |
| **AI Integration** | Native (MCP) | Manual (function calling) |
| **Streaming** | Limited (MCP roadmap) | Full (bidirectional) |
| **Latency** | Higher (JSON) | Lower (binary) |
| **Bundle Size** | Small (~6KB) | Larger (protobuf runtime) |

**When to use gRPC:**
- High-throughput microservices
- Bidirectional streaming
- Performance-critical services

**When to use LFTS MCP:**
- AI agent workflows
- Human-in-the-loop automation
- Developer tooling

---

## Troubleshooting

### Tool Not Found

**Error:**
```
{ type: "stage_not_found", name: "ProcessPayment" }
```

**Cause:** Tool name doesn't match any registered stage.

**Fix:**
```typescript
// List available tools
const tools = server.listTools();
console.log(tools.map(t => t.name));

// Or check catalog directly
const catalog = server.getCatalog();
console.log(catalog.list().map(s => s.name));
```

---

### Validation Errors

**Error:**
```
{
  type: "validation_failed",
  stage: "ProcessPayment",
  errors: {
    message: "Validation failed",
    path: "amount",
    code: "min_violation"
  }
}
```

**Cause:** Input doesn't match schema constraints.

**Fix:** Check tool's input schema:
```typescript
const tool = server.getTool("ProcessPayment");
console.log(JSON.stringify(tool.inputSchema, null, 2));
```

---

### Missing Metadata

**Problem:** Tool descriptions are minimal.

**Cause:** Stage definitions lack metadata.

**Fix:** Add metadata to stage definitions:
```typescript
defineBackendFunctionStage({
  name: "ProcessPayment",
  // ... schemas ...
  execute: async (input) => { ... },

  // Add these:
  description: "Detailed description of what this does",
  owners: ["team@example.com"],
  tags: ["payment", "critical"],
  retry: { maxAttempts: 3 },
  links: [{ rel: "documentation", href: "..." }],
});
```

---

### Resource Query Errors

**Error:**
```
{ type: "empty_result", query: "tag:nonexistent" }
```

**Cause:** No stages match the query.

**Fix:** Check available tags:
```typescript
const stats = server.readResource("lfts://catalog/stats");
if (stats.ok) {
  console.log("Available tags:", stats.value.tags);
}
```

---

## Summary

The LFTS MCP Server bridges the gap between typed workflows and AI agent integration. By exposing workflow catalogs via the Model Context Protocol, you get:

- **Self-documenting tools** - Metadata → rich descriptions
- **Type-safe execution** - Automatic validation from LFTS schemas
- **Discoverable resources** - Query catalogs by tag/kind
- **Explicit error handling** - Result<T, E> instead of exceptions
- **Observability** - Execution metadata (timing, status)
- **Zero HTTP overhead** - In-process or stdio transport

See `examples/13-mcp-server/` for a complete working example.

**Next Steps:**
- Integrate with `@modelcontextprotocol/sdk` for full protocol support
- Expose via stdio transport for Claude Desktop
- Add semantic tags and rich metadata to your stages
- Build conversational workflows with AI agents

---

**References:**
- [Model Context Protocol](https://modelcontextprotocol.io)
- [LFTS Stage Types](../packages/lfts-type-runtime/stage-types.ts)
- [LFTS Workflow Guide](./EFFECTS_GUIDE.md)
- [Example 13: MCP Server](../examples/13-mcp-server/)
