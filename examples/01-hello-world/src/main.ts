// examples/01-hello-world/src/main.ts
import { validate } from "../../../packages/lfts-type-runtime/mod.ts";
import type { User } from "./types.ts";
import { User$ } from "./types.schema.ts";

// Load and validate JSON
const json = await Deno.readTextFile("sample.json");
const data = JSON.parse(json);

// Validate returns the typed value or throws
const user: User = validate(User$, data);
console.log("✓ Valid user:", user);
