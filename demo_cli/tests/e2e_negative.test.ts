// demo_cli/tests/e2e_negative.test.ts
Deno.test({
  name: "compiler fails on non-exhaustive match (LFP1007)",
  sanitizeOps: false,
  sanitizeResources: false,
  permissions: { read: true, write: true, run: true, env: true },
  async fn() {
    // 1) Write a temporary source file with a non-exhaustive match
    const src = `import { match } from "../../packages/lfp-type-runtime/mod.ts";
type Add = { type: "add"; x: number; y: number };
type Mul = { type: "mul"; x: number; y: number };
type Expr = Add | Mul;
const evalExpr = (e: Expr): number =>
  match(e, {
    add: v => v.x + v.y, // missing 'mul' -> should trigger LFP1007
  });
`;
    const tmpPath = "demo_cli/src/_tmp_non_exhaustive.ts";
    await Deno.writeTextFile(tmpPath, src);

    // 2) Run the compiler over demo_cli/src -> expect non-zero exit code and LFP1007 in stderr
    const proc = new Deno.Command(Deno.execPath(), {
      args: ["run", "-A", "packages/lfp-type-compiler/src/cli.ts", "demo_cli/src", "--outDir", "dist"],
      stdout: "piped", stderr: "piped",
    }).outputSync();

    try {
      if (proc.code === 0) {
        throw new Error("Compiler unexpectedly succeeded; expected LFP1007 failure");
      }
      const err = new TextDecoder().decode(proc.stderr);
      if (!err.includes("LFP1007")) {
        throw new Error("Expected LFP1007 in diagnostics, got:\n" + err);
      }
    } finally {
      // 3) Cleanup temporary file
      try { await Deno.remove(tmpPath); } catch {}
    }
  }
});
