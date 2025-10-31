// examples/01-hello-world/src/main.ts
import { validate } from "../../../packages/lfts-type-runtime/mod.js";
import { User$ } from "./types.schema.js";
// Load and validate JSON
const json = await Deno.readTextFile("sample.json");
const data = JSON.parse(json);
// Validate returns the typed value or throws
const user = validate(User$, data);
console.log("✓ Valid user:", user);
