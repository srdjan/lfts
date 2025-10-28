// packages/lfp-type-compiler/src/cli.ts
import ts from "npm:typescript";
import { compileProject } from "./compiler.ts";

const usage = "Usage: deno run -A cli.ts <srcDir> --outDir <outDir>";
const [srcDir, outFlag, outDir, ...rest] = Deno.args;

if (!srcDir || outFlag !== "--outDir" || !outDir || rest.length > 0) {
  console.error(usage);
  Deno.exit(2);
}

const exitCode = await compileProject({ srcDir, outDir });
Deno.exit(exitCode);
