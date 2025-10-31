// packages/lfts-type-compiler/src/compiler.ts
import ts from "npm:typescript";
import { runGate } from "./gate/gate.ts";
import { runPolicy } from "./policy/engine.ts";
import { schemaRootRewriter } from "./transform/schema-root-rewriter.ts";
import { typeOfRewriter } from "./transform/typeOf-rewriter.ts";

type Options = { srcDir: string; outDir: string };

export async function compileProject(
  { srcDir, outDir }: Options,
): Promise<number> {
  // Resolve srcDir to absolute path for comparison
  const absSrcDir = await Deno.realPath(srcDir);

  // Recursively discover all .ts files in srcDir and subdirectories
  async function* walkDir(dir: string): AsyncGenerator<string> {
    for await (const entry of Deno.readDir(dir)) {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory) {
        yield* walkDir(path);
      } else if (entry.isFile && entry.name.endsWith(".ts")) {
        yield path;
      }
    }
  }

  const files: string[] = [];
  for await (const file of walkDir(srcDir)) {
    files.push(file);
  }
  const program = ts.createProgram(files, {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ES2022,
    moduleResolution: ts.ModuleResolutionKind.Node10,
    outDir,
    // Remove type-only imports and declarations
    importsNotUsedAsValues: ts.ImportsNotUsedAsValues.Remove,
    preserveValueImports: false,
  });
  const checker = program.getTypeChecker();

  // 1) Gate (syntax bans) - only check files in srcDir
  const gateDiags = runGate(program, absSrcDir);
  if (gateDiags.length) return printDiagsAndExit("Gate", gateDiags);

  // 2) Policy (semantic rules) - only check files in srcDir
  const policyDiags = runPolicy(program, checker, absSrcDir);
  if (policyDiags.length) return printDiagsAndExit("Policy", policyDiags);

  // 3) Transform (schema-root rewriter + typeOf<T>() → bytecode literal)
  const transformers: ts.CustomTransformers = {
    before: [
      schemaRootRewriter(program, checker), // Must run first to add schema constants
      typeOfRewriter(program, checker),     // Then replace typeOf<T>() calls
    ],
  };

  // 4) Emit with proper TypeScript stripping
  const outputFiles = new Map<string, string>();

  const emitResult = program.emit(
    undefined, // emit all files
    (fileName, text) => {
      // Capture output in memory
      outputFiles.set(fileName, text);
    },
    undefined, // no cancellation token
    false,     // emitOnlyDtsFiles = false
    transformers,
  );

  if (emitResult.diagnostics.length > 0) {
    return printDiagsAndExit("Emit", emitResult.diagnostics);
  }

  // Write all emitted files to disk (including dependencies)
  for (const [fileName, text] of outputFiles) {

    // Post-process: rewrite .ts extensions to .js in import statements
    // This is needed for Deno which uses explicit file extensions
    const processedText = text
      .replace(/(from\s+["'].*?)\.ts(["'])/g, "$1.js$2")  // from "..." imports
      .replace(/(import\s+["'].*?)\.ts(["'])/g, "$1.js$2"); // bare imports

    // Write to the output location TypeScript chose
    await Deno.mkdir(fileName.substring(0, fileName.lastIndexOf("/")), {
      recursive: true,
    });
    await Deno.writeTextFile(fileName, processedText);
  }

  return 0;
}

function printDiagsAndExit(kind: string, diags: ts.Diagnostic[]): number {
  for (const d of diags) {
    const { file, start } = d;
    const pos = file && typeof start === "number"
      ? file.getLineAndCharacterOfPosition(start)
      : null;
    console.error(
      `${kind}Error: ${d.messageText}` +
        (pos
          ? ` (${file!.fileName}:${pos.line + 1}:${pos.character + 1})`
          : ""),
    );
  }
  return 1;
}
