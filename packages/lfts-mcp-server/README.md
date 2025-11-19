# LFTS MCP Server

Model Context Protocol (MCP) integration for LFTS workflows. Expose your workflow catalogs to AI agents (Claude Desktop, CLI tools, custom agents) with full type safety and automatic validation.

## Features

- **🤖 AI Agent Integration** - Works with Claude Desktop, Anthropic CLI, and any MCP-compatible agent
- **🔒 Type-Safe Tool Invocation** - Automatic input/output validation via LFTS schemas
- **📊 Metadata-Driven** - Rich tool descriptions from stage metadata (owners, tags, retry policies)
- **🔍 Catalog Browsing** - Discover workflows via MCP resources (filter by tag, kind, name)
- **⚡ Zero-Overhead** - Direct execution, no HTTP/RPC overhead for in-process usage
- **📈 Observability** - Execution metadata (timing, status) included in responses

## Installation

```typescript
import { createMcpServer } from "./packages/lfts-mcp-server/mod.ts";
import { createStageCatalog, defineBackendFunctionStage } from "lfts-type-runtime";
```

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

// Create workflow stage with rich metadata
const processPaymentStage = defineBackendFunctionStage({
  name: "ProcessPayment",
  inputSchema: PaymentInput$,
  outputSchema: PaymentOutput$,

  // Business logic
  execute: async (input) => {
    // Your payment processing logic here
    const transactionId = `txn_${Date.now()}`;
    return Result.ok({
      transactionId,
      status: "approved" as const,
    });
  },

  // Metadata for AI agents
  description: "Process customer payment with fraud detection and authorization",
  owners: ["payments-team@example.com"],
  tags: ["payment", "critical"],

  // Automatic retry configuration
  retry: {
    maxAttempts: 3,
    initialDelayMs: 1000,
    backoffMultiplier: 2,
    shouldRetry: (error) => error.type === "timeout",
  },
});
```

### 2. Create MCP Server

```typescript
import { createMcpServer } from "lfts-mcp-server";

// Create catalog with your stages
const catalog = createStageCatalog([
  processPaymentStage,
  refundPaymentStage,
  checkPaymentStatusStage,
]);

// Create MCP server
const server = createMcpServer(catalog, {
  name: "payment-workflows",
  version: "1.0.0",
  includeMetadata: true,      // Include execution timing
  includeRetryInfo: true,      // Document retry policies
});
```

### 3. Use Server API

```typescript
// List available tools (for MCP protocol)
const tools = server.listTools();
console.log(tools);
// [
//   {
//     name: "ProcessPayment",
//     description: "Process customer payment with fraud detection...",
//     inputSchema: { type: "object", properties: { ... } }
//   },
//   ...
// ]

// Execute a tool
const result = await server.callTool("ProcessPayment", {
  amount: 100,
  customerId: "cust_123",
});

if (result.success) {
  console.log("Payment processed:", result.data);
  console.log("Duration:", result.metadata?.durationMs, "ms");
} else {
  console.error("Payment failed:", result.error);
}
```

### 4. Browse Catalog Resources

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
```

## API Reference

### `createMcpServer(catalog, options?)`

Creates an MCP server from a workflow catalog.

**Parameters:**
- `catalog: StageCatalog` - Workflow catalog containing stage definitions
- `options?: McpServerOptions` - Server configuration

**Options:**
```typescript
{
  name?: string;                    // Server name (default: "lfts-workflow")
  version?: string;                 // Server version (default: "1.0.0")
  includeMetadata?: boolean;        // Include execution metadata (default: true)
  includeExamples?: boolean;        // Include examples in descriptions (default: false)
  includeRetryInfo?: boolean;       // Document retry policies (default: true)
  transformToolName?: (name: string) => string;  // Custom name transform
}
```

### `LftsMcpServer`

**Methods:**

- `getServerInfo()` - Returns `{ name, version }`
- `listTools()` - Returns array of MCP tool definitions
- `getTool(name)` - Get specific tool by name (returns `null` if not found)
- `callTool<T, E>(name, params, context?)` - Execute a tool, returns `McpToolResponse<T, E>`
- `listResources()` - Returns array of resource descriptors
- `readResource(uri)` - Read resource by URI, returns `Result<T, CatalogQueryError>`
- `getCatalog()` - Get underlying catalog instance

### Resource URIs

- `lfts://catalog/stages` - List all stages
- `lfts://catalog/kinds/backend_function` - Backend function stages only
- `lfts://catalog/kinds/fullstack_htmx` - HTMX stages only
- `lfts://catalog/tags/{tag}` - Stages with specific tag
- `lfts://catalog/stages/{name}` - Specific stage by name
- `lfts://catalog/stats` - Catalog statistics

## Tool Response Format

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

## Advanced Usage

### Custom Tool Name Transformation

```typescript
const server = createMcpServer(catalog, {
  transformToolName: (name) => name.toLowerCase().replace(/([A-Z])/g, "_$1"),
});

// "ProcessPayment" → "process_payment"
```

### Metadata-Rich Descriptions

The MCP server automatically generates comprehensive tool descriptions from stage metadata:

```typescript
const stage = defineBackendFunctionStage({
  name: "VerifyIdentity",
  inputSchema: Input$,
  outputSchema: Output$,
  execute: async (input) => { ... },

  // All of this appears in MCP tool description
  description: "Verify user identity via third-party provider",
  owners: ["security-team@example.com"],
  tags: ["security", "compliance", "critical"],
  ports: ["IdentityProviderPort"],
  capabilities: ["read:user_profile"],

  retry: {
    maxAttempts: 3,
    initialDelayMs: 1000,
  },

  links: [
    {
      rel: "documentation",
      href: "https://docs.example.com/identity-verification",
      title: "Identity Verification Guide",
    },
    {
      rel: "runbook",
      href: "https://runbooks.example.com/verify-identity",
      title: "Troubleshooting Guide",
    },
  ],
});
```

**Generated description:**
```
Verify user identity via third-party provider

**Owners:** security-team@example.com
**Tags:** security, compliance, critical
**Kind:** backend_function

**Retry Configuration:**
- Max attempts: 3
- Initial delay: 1000ms

**Links:**
- [Identity Verification Guide](https://docs.example.com/identity-verification) (documentation)
- [Troubleshooting Guide](https://runbooks.example.com/verify-identity) (runbook)

**Port Dependencies:** IdentityProviderPort
**Capabilities:** read:user_profile
**Execution Mode:** async
```

### Error Handling

The server maps LFTS `Result<T, E>` types to MCP responses:

```typescript
// Validation errors
const result = await server.callTool("ProcessPayment", {
  amount: -50,  // Invalid: negative amount
  customerId: "invalid",
});

if (!result.success) {
  console.error(result.error);
  // {
  //   type: "validation_failed",
  //   stage: "ProcessPayment",
  //   errors: {
  //     message: "Validation failed",
  //     path: "amount",
  //     code: "min_violation"
  //   }
  // }
}

// Unknown tool
const result2 = await server.callTool("UnknownTool", {});
if (!result2.success) {
  console.error(result2.error);
  // { type: "stage_not_found", name: "UnknownTool" }
}
```

## Integration with MCP Protocol

While this package provides the core server logic, you'll typically expose it via an MCP transport layer (stdio, HTTP, WebSocket). Example:

```typescript
import { Server } from "@modelcontextprotocol/sdk/server";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio";
import { createMcpServer } from "lfts-mcp-server";

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
      tools: {},
      resources: {},
    },
  },
);

// Register tools
mcpServer.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: lftsServer.listTools(),
  };
});

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
    throw new Error(JSON.stringify(result.error));
  }
});

// Start server
const transport = new StdioServerTransport();
await mcpServer.connect(transport);
```

## Testing

```bash
# Run tests
deno test -A packages/lfts-mcp-server/server.test.ts

# Run with type checking
deno test -A packages/lfts-mcp-server/server.test.ts
```

## Examples

See `examples/13-mcp-server/` for a complete working example demonstrating:

- Payment workflow stages with retry configuration
- Catalog creation and server setup
- Tool listing and execution
- Resource browsing
- Error handling
- MCP protocol integration

## Why MCP + LFTS?

| Feature | LFTS MCP Server | Traditional REST API |
|---------|-----------------|---------------------|
| **Schema Validation** | Automatic (from LFTS schemas) | Manual |
| **Type Safety** | Full TypeScript types | Runtime only |
| **Self-Documenting** | Auto-generated from metadata | Manual OpenAPI |
| **Error Handling** | Typed `Result<T, E>` | HTTP status codes |
| **Retry Logic** | Declarative metadata | Custom code |
| **Discoverability** | MCP resources + tools | Static endpoints |
| **AI Agent Integration** | Native MCP protocol | Custom prompts |

## Related Packages

- [`lfts-type-runtime`](../lfts-type-runtime/) - Core runtime with validation and workflow execution
- [`lfts-codegen`](../lfts-codegen/) - Code generation (JSON Schema, OpenAPI, docs)
- [`@modelcontextprotocol/sdk`](https://npmjs.com/package/@modelcontextprotocol/sdk) - Official MCP SDK

## License

MIT
