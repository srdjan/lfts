// demo_cli/tests/e2e.test.ts
Deno.test({
  name: "build + run CLI with persistence",
  sanitizeOps: false,
  sanitizeResources: false,
  permissions: { read: true, write: true, run: true, env: true },
  async fn(t) {
    // 1) build
    const build = new Deno.Command(Deno.execPath(), {
      args: ["run", "-A", "packages/lfp-type-compiler/src/cli.ts", "demo_cli/src", "--outDir", "dist"],
      stdout: "piped", stderr: "piped",
    }).outputSync();
    if (build.code !== 0) {
      throw new Error(new TextDecoder().decode(build.stderr));
    }

    // 2) run: add task via JSON pipe
    const addCmd = new Deno.Command(Deno.execPath(), {
      args: ["run", "-A", "dist/app.js"],
      stdin: "piped", stdout: "piped", stderr: "piped",
    });
    const addChild = addCmd.spawn();
    const w = addChild.stdin.getWriter();
    await w.write(new TextEncoder().encode(JSON.stringify({ type: "add", name: "Demo task" })));
    w.releaseLock();
    await addChild.stdin.close();
    const addOut = await addChild.output();
    const addText = new TextDecoder().decode(addOut.stdout);
    if (!addText.includes("added:")) throw new Error("add did not print 'added:'");

    // 3) run: list and check pretty print
    const list = new Deno.Command(Deno.execPath(), { args: ["run", "-A", "dist/app.js", "list"], stdout: "piped" }).outputSync();
    const listText = new TextDecoder().decode(list.stdout);
    if (!/· t_\d+/.test(listText)) throw new Error("list did not show task id");

    // 4) ensure tasks.json persisted
    const txt = await Deno.readTextFile("./tasks.json");
    if (!txt.includes("Demo task")) throw new Error("tasks.json missing task");
  }
});
