
// packages/lfp-type-compiler/src/testing/golden.ts
import ts from "npm:typescript";
import { runGate } from "../gate/gate.ts";
import { runPolicy } from "../policy/engine.ts";

type Expect = { expect: "ok" } | { expect: "error"; codes?: string[] };

async function analyzeFixture(dir: string) {
  const srcDir = `${dir}/src`;
  const files: string[] = [];
  for await (const e of Deno.readDir(srcDir)) {
    if (e.isFile && e.name.endsWith(".ts")) files.push(`${srcDir}/${e.name}`);
  }
  const program = ts.createProgram(files, {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ES2022,
    moduleResolution: ts.ModuleResolutionKind.Node10,
  });
  const checker = program.getTypeChecker();
  const gate = runGate(program);
  const policy = runPolicy(program, checker);
  const all = [...gate, ...policy];
  const codes = all.map(d => String(d.messageText));
  return { diags: all, codes };
}

function hasAllCodes(messages: string[], codes: string[]): boolean {
  return codes.every(code => messages.some(m => m.includes(code)));
}

Deno.test("golden fixtures", async (t) => {
  const base = new URL("./fixtures/", import.meta.url).pathname;
  for await (const e of Deno.readDir(base)) {
    if (!e.isDirectory) continue;
    const dir = `${base}/${e.name}`;
    const specText = await Deno.readTextFile(`${dir}/test.json`);
    const spec: Expect = JSON.parse(specText);
    await t.step(e.name, async () => {
      const { codes } = await analyzeFixture(dir);
      if (spec.expect === "ok") {
        if (codes.length) {
          throw new Error(`Expected OK, but got diagnostics:\n${codes.join("\n")}`);
        }
      } else {
        if (codes.length === 0) {
          throw new Error(`Expected error diagnostics, but got none.`);
        }
        if (spec.codes && !hasAllCodes(codes, spec.codes)) {
          throw new Error(`Expected codes ${spec.codes.join(", ")} not all present in messages:\n${codes.join("\n")}`);
        }
      }
    });
  }
});
