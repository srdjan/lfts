#!/usr/bin/env -S deno run --allow-read --allow-write
// packages/lfts-cli/mod.ts
// LFTS Command Line Interface
//
// Usage:
//   deno run -A packages/lfts-cli/mod.ts <command> [options]
//
// Commands:
//   list-schemas              List all schemas in the project
//   find-schema <name>        Find a specific schema by name
//   generate-index [dir]      Generate barrel export index file
//   help                      Show help

import { parseArgs } from "https://deno.land/std@0.208.0/cli/parse_args.ts";
import { listSchemasCommand } from "./commands/list-schemas.ts";
import { findSchemaCommand } from "./commands/find-schema.ts";
import { generateIndexCommand } from "./commands/generate-index.ts";

const COMMANDS = {
  "list-schemas": listSchemasCommand,
  "find-schema": findSchemaCommand,
  "generate-index": generateIndexCommand,
  "help": helpCommand,
} as const;

type CommandName = keyof typeof COMMANDS;

async function main() {
  const args = parseArgs(Deno.args, {
    string: ["dir"],
    boolean: ["help", "verbose"],
    alias: { h: "help", v: "verbose" },
  });

  const command = args._[0] as string;

  // Show help if no command or --help flag
  if (!command || args.help) {
    helpCommand(args);
    return;
  }

  // Check if command exists
  if (!(command in COMMANDS)) {
    console.error(`Error: Unknown command "${command}"\n`);
    helpCommand(args);
    Deno.exit(1);
  }

  // Execute command
  try {
    await COMMANDS[command as CommandName](args);
  } catch (error) {
    console.error(`Error executing ${command}:`, error.message);
    if (args.verbose) {
      console.error(error.stack);
    }
    Deno.exit(1);
  }
}

function helpCommand(_args: any) {
  console.log(`
LFTS CLI - Light-FP TypeScript Tooling

Usage:
  lfts <command> [options]

Commands:
  list-schemas              List all schemas in the project
  find-schema <name>        Find a specific schema by name
  generate-index [--dir]    Generate barrel export index file
  help                      Show this help message

Options:
  --help, -h               Show help
  --verbose, -v            Show verbose output
  --dir <path>             Specify directory (for generate-index)

Examples:
  # List all schemas
  lfts list-schemas

  # Find a specific schema
  lfts find-schema User

  # Generate index in src/domain
  lfts generate-index --dir src/domain

  # Show help
  lfts help

Documentation:
  https://github.com/yourusername/lfts

Version: 0.8.0
`);
}

// Run if this is the main module
if (import.meta.main) {
  main();
}

export { main };
