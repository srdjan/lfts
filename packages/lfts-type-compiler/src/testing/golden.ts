// packages/lfts-type-compiler/src/testing/golden.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/assert_equals.ts";
import ts from "npm:typescript";
import { runGate } from "../gate/gate.ts";
import { runPolicy } from "../policy/engine.ts";
import { encodeType } from "../transform/type-encoder.ts";
import { Op } from "../../../lfts-type-spec/src/mod.ts";

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
  const gate = runGate(program, srcDir);
  const policy = runPolicy(program, checker, srcDir);
  const all = [...gate, ...policy];
  const codes = all.map((d) => String(d.messageText));
  return { diags: all, codes };
}

function hasAllCodes(messages: string[], codes: string[]): boolean {
  return codes.every((code) => messages.some((m) => m.includes(code)));
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
          throw new Error(
            `Expected OK, but got diagnostics:\n${codes.join("\n")}`,
          );
        }
      } else {
        if (codes.length === 0) {
          throw new Error(`Expected error diagnostics, but got none.`);
        }
        if (spec.codes && !hasAllCodes(codes, spec.codes)) {
          throw new Error(
            `Expected codes ${
              spec.codes.join(", ")
            } not all present in messages:\n${codes.join("\n")}`,
          );
        }
      }
    });
  }
});

Deno.test("encodeType emits DUNION for discriminated unions", () => {
  const fileName = "expr.ts";
  const source = `type Expr =
    | { type: "add"; x: number; y: number }
    | { type: "mul"; x: number; y: number };`;

  const compilerOptions: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ES2022,
  };

  const baseHost = ts.createCompilerHost(compilerOptions);
  const originalGetSourceFile = baseHost.getSourceFile.bind(baseHost);
  const originalReadFile = baseHost.readFile?.bind(baseHost);
  const originalFileExists = baseHost.fileExists?.bind(baseHost);

  baseHost.getSourceFile = (file, languageVersion, onError, shouldCreateNewSourceFile) => {
    if (file === fileName) {
      return ts.createSourceFile(
        file,
        source,
        languageVersion,
        true,
        ts.ScriptKind.TS,
      );
    }
    return originalGetSourceFile(
      file,
      languageVersion,
      onError,
      shouldCreateNewSourceFile,
    );
  };

  if (originalReadFile) {
    baseHost.readFile = (file) => file === fileName ? source : originalReadFile(file);
  } else {
    baseHost.readFile = (file) => file === fileName ? source : undefined;
  }

  if (originalFileExists) {
    baseHost.fileExists = (file) => file === fileName ? true : originalFileExists(file);
  } else {
    baseHost.fileExists = (file) => file === fileName;
  }

  baseHost.writeFile = () => {};

  const program = ts.createProgram([fileName], compilerOptions, baseHost);
  const checker = program.getTypeChecker();
  const sf = program.getSourceFile(fileName);
  if (!sf) throw new Error("missing source file");
  const alias = sf.statements.find(ts.isTypeAliasDeclaration);
  if (!alias) throw new Error("missing type alias");

  const bc = encodeType(alias.type, checker);

  assertEquals(bc[0], Op.DUNION, "expected discriminated union opcode");
  assertEquals(bc[1], "type");
  assertEquals(bc[2], 2);

  const tags = [bc[3], bc[5]];
  assertEquals(tags, ["add", "mul"]);

  const firstVariant = bc[4] as unknown[];
  const secondVariant = bc[6] as unknown[];
  assertEquals(firstVariant[0], Op.OBJECT);
  assertEquals(secondVariant[0], Op.OBJECT);
});
