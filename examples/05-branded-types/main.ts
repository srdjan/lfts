// examples/05-branded-types/main.ts
// Focus: introducing nominal brands for safer domain modelling.

import { validateSafe } from "../../packages/lfts-type-runtime/mod.ts";
import { User$ } from "./src/types.schema.ts";
import type { Email, User, UserId } from "./src/types.ts";

async function load(relativePath: string) {
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

// Helper functions keep brand creation in one place.
function makeUserId(value: string): UserId {
  return value as UserId;
}

function makeEmail(value: string): Email {
  return value as Email;
}

function hydrate(raw: any): User {
  const result = validateSafe<User>(User$, raw);
  if (!result.ok) {
    throw new Error(`${result.error.path}: ${result.error.message}`);
  }
  // Even though validation succeeded, we re-wrap values to expose brand helpers.
  return {
    id: makeUserId(result.value.id),
    email: makeEmail(result.value.email),
    displayName: result.value.displayName,
  };
}

if (import.meta.main) {
  const valid = await load("data/user-valid.json");
  console.log("Valid user ->", hydrate(valid));

  const invalid = await load("data/user-invalid.json");
  console.log("\nInvalid user ->", validateSafe(User$, invalid));
  console.log("\nNote: email branding is structural – add refinements for stronger checks.");
}
