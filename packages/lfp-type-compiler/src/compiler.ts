// packages/lfp-type-compiler/src/compiler.ts
import ts from "npm:typescript";
import { runGate } from "./gate/gate.ts";
import { runPolicy } from "./policy/engine.ts";
import { typeOfRewriter } from "./transform/typeOf-rewriter.ts";

type Options = { srcDir: string; outDir: string };

export async function compileProject({ srcDir, outDir }: Options): Promise<number> {
  const files: string[] = [];
  for await (const e of Deno.readDir(srcDir)) {
    if (e.isFile && e.name.endsWith(".ts")) files.push(`${srcDir}/${e.name}`);
  }
  const program = ts.createProgram(files, {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ES2022,
    moduleResolution: ts.ModuleResolutionKind.Node10,
    outDir,
  });
  const checker = program.getTypeChecker();

  // 1) Gate (syntax bans)
  const gateDiags = runGate(program);
  if (gateDiags.length) return printDiagsAndExit("Gate", gateDiags);

  // 2) Policy (semantic rules)
  const policyDiags = runPolicy(program, checker);
  if (policyDiags.length) return printDiagsAndExit("Policy", policyDiags);

  // 3) Transform (typeOf<T>() → bytecode literal)
  const transformers: ts.CustomTransformers = { before: [typeOfRewriter(program, checker)] };
  for (const sf of program.getSourceFiles()) {
    if (!sf.fileName.startsWith(srcDir)) continue;
    const res = ts.transform(sf, transformers.before!);
    const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
    const transformed = printer.printFile(res.transformed[0] as ts.SourceFile);
    const outPath = sf.fileName.replace(srcDir, outDir).replace(/\.ts$/, ".js");
    await Deno.mkdir(outPath.substring(0, outPath.lastIndexOf("/")), { recursive: true });
    await Deno.writeTextFile(outPath, transformed);
    res.dispose();
  }
  return 0;
}

function printDiagsAndExit(kind: string, diags: ts.Diagnostic[]): number {
  for (const d of diags) {
    const { file, start } = d;
    const pos = file && typeof start === "number" ? file.getLineAndCharacterOfPosition(start) : null;
    console.error(`${kind}Error: ${d.messageText}` + (pos ? ` (${file!.fileName}:${pos.line + 1}:${pos.character + 1})` : ""));
  }
  return 1;
}
