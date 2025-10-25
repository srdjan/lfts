
// packages/release/src/release.ts
import { dirname, fromFileUrl, join } from "https://deno.land/std@0.224.0/path/mod.ts";
import { ZipFile } from "https://deno.land/x/zipjs@v2.7.38/index.js";

const projectRoot = dirname(dirname(dirname(fromFileUrl(import.meta.url)))); // .../packages/release
const outDir = join(projectRoot, "out");
await Deno.mkdir(outDir, { recursive: true });

// Read version
const version = (await Deno.readTextFile(join(projectRoot, "VERSION"))).trim();
const zipPath = join(outDir, `lfp-compiler-${version}.zip`);

const include = [
  "README.md",
  "LANG-SPEC.md",
  "guide.mmd",
  "CHANGELOG.md",
  "VERSION",
  "lfp.config.json",
  "deno.json",
  "packages/",
  "demo_cli/",
];

const zip = new ZipFile();
for (const p of include) {
  const path = join(projectRoot, p);
  const stat = await Deno.stat(path);
  if (stat.isFile) {
    const bytes = await Deno.readFile(path);
    zip.addBlob(p, new Blob([bytes]));
  } else if (stat.isDirectory) {
    for await (const entry of Deno.readDir(path)) {
      const stack = [join(path, entry.name)];
      while (stack.length) {
        const cur = stack.pop()!;
        const rel = cur.substring(projectRoot.length + 1);
        const s = await Deno.stat(cur);
        if (s.isFile) {
          const bytes = await Deno.readFile(cur);
          zip.addBlob(rel, new Blob([bytes]));
        } else if (s.isDirectory) {
          for await (const e of Deno.readDir(cur)) stack.push(join(cur, e.name));
        }
      }
    }
  }
}

const blob = await zip.export();
await Deno.writeFile(zipPath, new Uint8Array(await blob.arrayBuffer()));
console.log(`Release artifact created: ${zipPath}`);
