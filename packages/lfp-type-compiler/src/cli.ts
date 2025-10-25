// packages/lfp-type-compiler/src/cli.ts
import ts from "npm:typescript";
import { compileProject } from "./compiler.ts";

const [srcDir, , outFlag, outDir] = Deno.args;
if (!srcDir || outFlag !== "--outDir" || !outDir) {
  console.error("Usage: deno run -A cli.ts <srcDir> --outDir <outDir>");
  Deno.exit(2);
}

const exitCode = await compileProject({ srcDir, outDir });
Deno.exit(exitCode);
