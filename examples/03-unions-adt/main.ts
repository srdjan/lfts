// examples/03-unions-adt/main.ts
// Focus: discriminated union validation and diagnostics.

import { validateAll } from "../../packages/lfts-type-runtime/mod.ts";
import { Scene$ } from "./src/types.schema.ts";

async function readJson(relativePath: string) {
  const prefixes = ["./", "../", "../../", "../../../", "../../../../", "../../../../../"];
  for (const prefix of prefixes) {
    try {
      return JSON.parse(await Deno.readTextFile(new URL(prefix + relativePath, import.meta.url)));
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) continue;
      throw error;
    }
  }
  throw new Deno.errors.NotFound(`Could not load ${relativePath}`);
}

async function main() {
  const validScene = await readJson("data/scene-valid.json");
  const invalidScene = await readJson("data/scene-invalid.json");

  console.log("Valid scene:");
  console.log(validateAll(Scene$, validScene));

  console.log("\nInvalid scene:");
  const result = validateAll(Scene$, invalidScene);
  console.log(result);
  if (!result.ok) {
    console.log("\nHuman readable errors:");
    for (const error of result.errors) {
      console.log(`- ${error.path}: ${error.message}`);
    }
  }
}

if (import.meta.main) {
  await main();
}
