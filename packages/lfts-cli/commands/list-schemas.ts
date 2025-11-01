// packages/lfts-cli/commands/list-schemas.ts
// List all LFTS schemas in the project

import { walk } from "https://deno.land/std@0.208.0/fs/walk.ts";
import { relative } from "https://deno.land/std@0.208.0/path/mod.ts";

export interface SchemaInfo {
  name: string;
  file: string;
  sourceType?: string;
}

/**
 * List all schemas in the project
 */
export async function listSchemasCommand(args: any) {
  const verbose = args.verbose || false;
  const cwd = Deno.cwd();

  console.log("Scanning for LFTS schemas...\n");

  // Find all .schema.ts files
  const schemaFiles: string[] = [];
  for await (
    const entry of walk(".", {
      exts: [".ts"],
      skip: [/node_modules/, /\.git/, /dist/, /build/],
    })
  ) {
    if (entry.isFile && entry.path.endsWith(".schema.ts")) {
      schemaFiles.push(entry.path);
    }
  }

  if (schemaFiles.length === 0) {
    console.log("No .schema.ts files found.");
    console.log(
      "\nTip: Schema files should end with .schema.ts and export schemas using:",
    );
    console.log('  - export type NameSchema = Type  (schema-root pattern)');
    console.log('  - export const Name$ = typeOf<Type>()  (explicit pattern)');
    return;
  }

  // Extract schemas from each file
  const allSchemas: Map<string, SchemaInfo[]> = new Map();

  for (const file of schemaFiles) {
    const schemas = await extractSchemas(file);
    if (schemas.length > 0) {
      allSchemas.set(file, schemas);
    }
  }

  // Display grouped by directory
  const directories = new Map<string, { file: string; schemas: SchemaInfo[] }[]>();

  for (const [file, schemas] of allSchemas) {
    const relPath = relative(cwd, file);
    const dir = relPath.substring(0, relPath.lastIndexOf("/")) || ".";

    if (!directories.has(dir)) {
      directories.set(dir, []);
    }
    directories.get(dir)!.push({ file: relPath, schemas });
  }

  // Sort directories and display
  const sortedDirs = Array.from(directories.keys()).sort();

  let totalSchemas = 0;

  for (const dir of sortedDirs) {
    const files = directories.get(dir)!;

    console.log(`${dir}/`);
    for (const { file, schemas } of files) {
      const fileName = file.substring(file.lastIndexOf("/") + 1);
      console.log(`  ${fileName}:`);

      for (const schema of schemas) {
        totalSchemas++;
        if (verbose && schema.sourceType) {
          console.log(`    - ${schema.name}$ (from ${schema.sourceType})`);
        } else {
          console.log(`    - ${schema.name}$`);
        }
      }
    }
    console.log();
  }

  // Summary
  console.log(
    `Found ${totalSchemas} schema(s) in ${schemaFiles.length} file(s)`,
  );
}

/**
 * Extract schema exports from a .schema.ts file
 */
async function extractSchemas(file: string): Promise<SchemaInfo[]> {
  const content = await Deno.readTextFile(file);
  const schemas: SchemaInfo[] = [];

  // Pattern 1: export const Name$ = ...
  const constPattern = /export\s+const\s+(\w+)\$\s*=/g;
  let match;
  while ((match = constPattern.exec(content)) !== null) {
    schemas.push({
      name: match[1],
      file,
    });
  }

  // Pattern 2: export type NameSchema = Type
  // (Compiler generates Name$ from this)
  const typePattern = /export\s+type\s+(\w+)Schema\s*=/g;
  while ((match = typePattern.exec(content)) !== null) {
    const baseName = match[1];
    // Try to extract source type
    const lineStart = content.lastIndexOf("\n", match.index) + 1;
    const lineEnd = content.indexOf("\n", match.index);
    const line = content.substring(lineStart, lineEnd);

    const sourceMatch = line.match(/=\s*(\w+)\s*;/);
    schemas.push({
      name: baseName,
      file,
      sourceType: sourceMatch ? sourceMatch[1] : undefined,
    });
  }

  return schemas;
}
