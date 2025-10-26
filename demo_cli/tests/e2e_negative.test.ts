// demo_cli/tests/e2e_negative.test.ts
Deno.test({
  name: "compiler fails on non-exhaustive match (LFP1007)",
  sanitizeOps: false,
  sanitizeResources: false,
  permissions: { read: true, write: true, run: true, env: true },
  async fn() {
    // Create isolated temporary directory for test source
    const tempDir = await Deno.makeTempDir({ prefix: "lfp_e2e_negative_" });
    const tmpPath = `${tempDir}/_tmp_non_exhaustive.ts`;

    try {
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
      await Deno.writeTextFile(tmpPath, src);

      // 2) Run the compiler over temp dir -> expect non-zero exit code and LFP1007 in stderr
      const proc = new Deno.Command(Deno.execPath(), {
        args: ["run", "-A", "packages/lfp-type-compiler/src/cli.ts", tempDir, "--outDir", "dist"],
        stdout: "piped", stderr: "piped",
      }).outputSync();

      if (proc.code === 0) {
        throw new Error("Compiler unexpectedly succeeded; expected LFP1007 failure");
      }
      const err = new TextDecoder().decode(proc.stderr);
      if (!err.includes("LFP1007")) {
        throw new Error("Expected LFP1007 in diagnostics, got:\n" + err);
      }
    } finally {
      // 3) Cleanup temporary directory
      await Deno.remove(tempDir, { recursive: true }).catch(() => {});
    }
  }
});
