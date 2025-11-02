// examples/01-basic-validation/main.ts
// Compile then run:
// deno run -A ../../packages/lfts-type-compiler/src/cli.ts . --outDir ./build
// deno run -A build/main.js
// Demonstrates how to use compiler-emitted bytecode to validate data.

import { validateSafe } from "../../packages/lfts-type-runtime/mod.ts";
import { User$ } from "./src/types.schema.ts";

async function loadJson(relativePath: string) {
  const prefixes = ["./", "../", "../../", "../../../", "../../../../", "../../../../../"];
  for (const prefix of prefixes) {
    try {
      const url = new URL(prefix + relativePath, import.meta.url);
      const text = await Deno.readTextFile(url);
      return JSON.parse(text);
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) continue;
      throw error;
    }
  }
  throw new Deno.errors.NotFound(`Could not resolve data file: ${relativePath}`);
}

async function main() {
  const validUser = await loadJson("data/user-valid.json");
  const invalidUser = await loadJson("data/user-invalid.json");

  const ok = validateSafe(User$, validUser);
  console.log("Valid user result:");
  console.log(ok);

  const bad = validateSafe(User$, invalidUser);
  console.log("\nInvalid user result:");
  console.log(bad);

  if (!bad.ok) {
    console.log("\nValidation error message:");
    console.log(`${bad.error.path}: ${bad.error.message}`);
  }
}

if (import.meta.main) {
  await main();
}
