#!/usr/bin/env -S deno run -A
/**
 * check-no-oop.ts
 *
 * Safeguard script that checks for OOP constructs in source code.
 * This runs as part of `deno task lint` to prevent accidental introduction
 * of OOP patterns in Light-FP codebase.
 *
 * Exits with code 1 if violations are found, 0 otherwise.
 */

type OOPPattern = {
  name: string;
  pattern: RegExp;
  description: string;
  allowedContexts?: RegExp[]; // Patterns that are OK (e.g., checking for keywords)
};

const OOP_PATTERNS: OOPPattern[] = [
  {
    name: "class-declaration",
    pattern: /\bclass\s+\w+/g,
    description: "Class declarations are not allowed in Light-FP",
    allowedContexts: [
      /SyntaxKind\.ClassDeclaration/,
      /["']class["']/,
      /"class\s+\w+"/,
    ],
  },
  {
    name: "extends-keyword",
    pattern: /\bclass\s+\w+\s+extends\s+\w+/g,
    description: "Class inheritance (extends) is not allowed in Light-FP",
    allowedContexts: [
      /SyntaxKind\..*Keyword/,
      /["']extends["']/,
    ],
  },
  {
    name: "implements-keyword",
    pattern: /\bclass\s+\w+\s+implements\s+\w+/g,
    description: "Class implementing interfaces is not allowed in Light-FP",
    allowedContexts: [
      /SyntaxKind\..*Keyword/,
      /["']implements["']/,
    ],
  },
  {
    name: "this-keyword",
    pattern: /\bthis\./g,
    description: "Using 'this' keyword is not allowed in Light-FP",
    allowedContexts: [
      /SyntaxKind\.ThisKeyword/,
      /["']this["']/,
      /\/\/.*this\./,  // Allow in comments
    ],
  },
  {
    name: "constructor-method",
    pattern: /\bconstructor\s*\(/g,
    description: "Constructor methods are not allowed in Light-FP",
    allowedContexts: [
      /SyntaxKind\.Constructor/,
      /["']constructor["']/,
    ],
  },
  {
    name: "super-keyword",
    pattern: /\bsuper\./g,
    description: "Super keyword is not allowed in Light-FP",
    allowedContexts: [
      /SyntaxKind\.SuperKeyword/,
      /["']super["']/,
    ],
  },
];

const DIRECTORIES_TO_CHECK = [
  "packages",
  "deno_example/src",
  "todo_api",
  "scripts",
];

const EXCLUDE_PATTERNS = [
  /\/testing\/fixtures\//,  // Test fixtures
  /\.test\.ts$/,             // May contain test cases with OOP
  /node_modules\//,
  /dist\//,
];

type Violation = {
  file: string;
  line: number;
  column: number;
  pattern: string;
  match: string;
  description: string;
};

async function* walkFiles(dir: string): AsyncGenerator<string> {
  try {
    for await (const entry of Deno.readDir(dir)) {
      const path = `${dir}/${entry.name}`;

      if (entry.isDirectory) {
        yield* walkFiles(path);
      } else if (entry.isFile && (path.endsWith(".ts") || path.endsWith(".tsx"))) {
        yield path;
      }
    }
  } catch (err) {
    // Directory might not exist, skip silently
    if (!(err instanceof Deno.errors.NotFound)) {
      console.error(`Error reading directory ${dir}:`, err);
    }
  }
}

function shouldExclude(filePath: string): boolean {
  return EXCLUDE_PATTERNS.some(pattern => pattern.test(filePath));
}

function isAllowedContext(line: string, pattern: OOPPattern): boolean {
  if (!pattern.allowedContexts) return false;
  return pattern.allowedContexts.some(ctx => ctx.test(line));
}

async function checkFile(filePath: string): Promise<Violation[]> {
  const violations: Violation[] = [];

  try {
    const content = await Deno.readTextFile(filePath);
    const lines = content.split("\n");

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum];

      for (const pattern of OOP_PATTERNS) {
        pattern.pattern.lastIndex = 0; // Reset regex state
        let match: RegExpExecArray | null;

        while ((match = pattern.pattern.exec(line)) !== null) {
          // Check if this match is in an allowed context
          if (!isAllowedContext(line, pattern)) {
            violations.push({
              file: filePath,
              line: lineNum + 1,
              column: match.index + 1,
              pattern: pattern.name,
              match: match[0],
              description: pattern.description,
            });
          }
        }
      }
    }
  } catch (err) {
    console.error(`Error reading file ${filePath}:`, err);
  }

  return violations;
}

async function main(): Promise<void> {
  console.log("🔍 Checking for OOP constructs in Light-FP codebase...\n");

  const allViolations: Violation[] = [];

  for (const dir of DIRECTORIES_TO_CHECK) {
    for await (const file of walkFiles(dir)) {
      if (shouldExclude(file)) continue;

      const violations = await checkFile(file);
      allViolations.push(...violations);
    }
  }

  if (allViolations.length === 0) {
    console.log("✅ No OOP constructs found. Light-FP purity maintained!\n");
    Deno.exit(0);
  }

  console.error("❌ Found OOP constructs in Light-FP codebase:\n");

  // Group violations by file
  const byFile = new Map<string, Violation[]>();
  for (const v of allViolations) {
    const existing = byFile.get(v.file) || [];
    existing.push(v);
    byFile.set(v.file, existing);
  }

  for (const [file, violations] of byFile.entries()) {
    console.error(`\n${file}:`);
    for (const v of violations) {
      console.error(`  Line ${v.line}:${v.column} - ${v.pattern}: "${v.match}"`);
      console.error(`    ${v.description}`);
    }
  }

  console.error(`\n❌ Total violations: ${allViolations.length}`);
  console.error("\nLight-FP does not allow OOP constructs.");
  console.error("Please refactor to use functional patterns instead.\n");

  Deno.exit(1);
}

if (import.meta.main) {
  await main();
}
