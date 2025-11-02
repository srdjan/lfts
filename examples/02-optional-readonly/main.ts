// examples/02-optional-readonly/main.ts
// Run with: deno run -A ../../packages/lfts-type-compiler/src/cli.ts . --outDir ./build && deno run -A build/main.js
// Focus: optional properties and readonly array handling.

import { validateAll } from "../../packages/lfts-type-runtime/mod.ts";
import { UserProfile$ } from "./src/types.schema.ts";

async function loadJson(relativePath: string) {
  const prefixes = ["./", "../", "../../", "../../../", "../../../../", "../../../../../"];
  for (const prefix of prefixes) {
    try {
      const url = new URL(prefix + relativePath, import.meta.url);
      return JSON.parse(await Deno.readTextFile(url));
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) continue;
      throw error;
    }
  }
  throw new Deno.errors.NotFound(`Could not load ${relativePath}`);
}

async function main() {
  const validProfile = await loadJson("data/profile-valid.json");
  const invalidProfile = await loadJson("data/profile-invalid.json");

  const ok = validateAll(UserProfile$, validProfile);
  console.log("Valid profile:");
  console.log(ok);

  const bad = validateAll(UserProfile$, invalidProfile);
  console.log("\nInvalid profile errors:");
  console.log(bad);
}

if (import.meta.main) {
  await main();
}
