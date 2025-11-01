// packages/lfts-cli/commands/find-schema.ts
// Find a specific schema by name (fuzzy matching)

import { walk } from "https://deno.land/std@0.208.0/fs/walk.ts";
import { relative } from "https://deno.land/std@0.208.0/path/mod.ts";

export interface SchemaMatch {
  name: string;
  file: string;
  importPath: string;
  sourceType?: string;
  score: number;
}

/**
 * Find schemas matching the search term
 */
export async function findSchemaCommand(args: any) {
  const searchTerm = args._[1] as string;

  if (!searchTerm) {
    console.error("Error: Missing schema name");
    console.log("\nUsage: lfts find-schema <name>");
    console.log("\nExample: lfts find-schema User");
    Deno.exit(1);
  }

  const cwd = Deno.cwd();
  console.log(`Searching for schemas matching "${searchTerm}"...\n`);

  // Find all .schema.ts files
  const matches: SchemaMatch[] = [];

  for await (
    const entry of walk(".", {
      exts: [".ts"],
      skip: [/node_modules/, /\.git/, /dist/, /build/],
    })
  ) {
    if (entry.isFile && entry.path.endsWith(".schema.ts")) {
      const schemas = await searchInFile(entry.path, searchTerm);
      matches.push(...schemas);
    }
  }

  if (matches.length === 0) {
    console.log(`No schemas found matching "${searchTerm}"`);
    console.log("\nTip: Search is case-sensitive and supports partial matches");
    console.log('Example: "User" matches "User", "UserInput", "AdminUser"');
    return;
  }

  // Sort by score (exact matches first, then by similarity)
  matches.sort((a, b) => b.score - a.score);

  // Display results
  console.log(`Found ${matches.length} match(es):\n`);

  for (const match of matches) {
    const relPath = relative(cwd, match.file);

    console.log(`  ${match.name}$`);
    console.log(`    File: ${relPath}`);

    if (match.sourceType) {
      console.log(`    Source: ${match.sourceType}`);
    }

    console.log(`    Import: import { ${match.name}$ } from "${match.importPath}";`);

    // Show usage example for top match
    if (match === matches[0]) {
      console.log(`\n    Usage:`);
      console.log(`      import { ${match.name}$ } from "${match.importPath}";`);
      console.log(`      import { validate } from "lfts-type-runtime";`);
      console.log(`      `);
      console.log(`      const result = validate(${match.name}$, data);`);
    }

    console.log();
  }
}

/**
 * Search for schemas in a specific file
 */
async function searchInFile(
  file: string,
  searchTerm: string,
): Promise<SchemaMatch[]> {
  const content = await Deno.readTextFile(file);
  const matches: SchemaMatch[] = [];

  // Generate import path (remove .ts extension, use relative path)
  const importPath = "./" + file.replace(/\.ts$/, ".js");

  // Pattern 1: export const Name$ = ...
  const constPattern = /export\s+const\s+(\w+)\$\s*=/g;
  let match;
  while ((match = constPattern.exec(content)) !== null) {
    const name = match[1];
    const score = calculateScore(name, searchTerm);

    if (score > 0) {
      matches.push({
        name,
        file,
        importPath,
        score,
      });
    }
  }

  // Pattern 2: export type NameSchema = Type
  const typePattern = /export\s+type\s+(\w+)Schema\s*=/g;
  while ((match = typePattern.exec(content)) !== null) {
    const baseName = match[1];
    const score = calculateScore(baseName, searchTerm);

    if (score > 0) {
      // Try to extract source type
      const lineStart = content.lastIndexOf("\n", match.index) + 1;
      const lineEnd = content.indexOf("\n", match.index);
      const line = content.substring(lineStart, lineEnd);

      const sourceMatch = line.match(/=\s*(\w+)\s*;/);

      matches.push({
        name: baseName,
        file,
        importPath,
        sourceType: sourceMatch ? sourceMatch[1] : undefined,
        score,
      });
    }
  }

  return matches;
}

/**
 * Calculate fuzzy match score (higher = better match)
 */
function calculateScore(name: string, searchTerm: string): number {
  const lowerName = name.toLowerCase();
  const lowerSearch = searchTerm.toLowerCase();

  // Exact match (case-insensitive): highest score
  if (lowerName === lowerSearch) return 100;

  // Exact match (case-sensitive): very high score
  if (name === searchTerm) return 90;

  // Starts with search term (case-insensitive): high score
  if (lowerName.startsWith(lowerSearch)) return 80;

  // Contains search term (case-insensitive): medium score
  if (lowerName.includes(lowerSearch)) return 60;

  // Fuzzy match: calculate based on common characters
  const commonChars = countCommonChars(lowerName, lowerSearch);
  if (commonChars >= lowerSearch.length * 0.6) {
    return 40 + (commonChars / lowerSearch.length) * 20;
  }

  // No match
  return 0;
}

/**
 * Count common characters between two strings
 */
function countCommonChars(str1: string, str2: string): number {
  let count = 0;
  const chars = new Set(str2);

  for (const char of str1) {
    if (chars.has(char)) {
      count++;
    }
  }

  return count;
}
