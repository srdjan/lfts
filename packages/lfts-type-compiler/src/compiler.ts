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
  const gateDiags = runGate(program, srcDir);
  if (gateDiags.length) return printDiagsAndExit("Gate", gateDiags);

  // 2) Policy (semantic rules) - only check files in srcDir
  const policyDiags = runPolicy(program, checker, srcDir);
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

  // Write only files from srcDir to disk
  for (const [fileName, text] of outputFiles) {
    // fileName format: "dist/deno_example/src/main.js"
    // We need to check if the original .ts file is from our srcDir

    // Remove outDir prefix if present
    const withoutOutDir = fileName.startsWith(outDir + "/")
      ? fileName.substring((outDir + "/").length)
      : fileName;

    // Replace .js with .ts to get original source file path
    const originalFile = withoutOutDir.replace(/\.js$/, ".ts");

    // Check if this source file exists in our program
    const srcFile = program.getSourceFile(originalFile);
    if (!srcFile) continue;

    // Verify it's from srcDir (not a dependency)
    if (!srcFile.fileName.startsWith(srcDir)) continue;

    // Write to the output location TypeScript chose
    await Deno.mkdir(fileName.substring(0, fileName.lastIndexOf("/")), {
      recursive: true,
    });
    await Deno.writeTextFile(fileName, text);
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
