// examples/04-result-pattern/main.ts
// Focus: ergonomics around Result-style return values.

import { Result, validateSafe } from "../../packages/lfts-type-runtime/mod.ts";
import { AuthResult$, Credentials$ } from "./src/types.schema.ts";
import type { AuthResult, Credentials } from "./src/types.ts";

async function loadJson(relativePath: string) {
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

function authenticate(creds: Credentials): AuthResult {
  if (creds.password.length < 6) {
    return Result.err({
      type: "invalid_credentials",
      message: "Password must be at least 6 characters.",
    });
  }
  if (creds.email.endsWith("@blocked.local")) {
    return Result.err({
      type: "locked",
      message: "Account is locked.",
    });
  }
  // Direct-style success path.
  return Result.ok({ token: crypto.randomUUID() });
}

function render(result: AuthResult) {
  if (Result.isOk(result)) {
    console.log("\nLogin succeeded! token=", result.value.token);
  } else {
    console.log(`\nLogin failed: [${result.error.type}] ${result.error.message}`);
  }
}

async function demoValid() {
  const data = await loadJson("data/credentials-valid.json");
  const validated = validateSafe<Credentials>(Credentials$, data);
  if (!validated.ok) {
    console.error("Validation failed unexpectedly", validated.error);
    return;
  }
  const auth = authenticate(validated.value);
  // Validate the Result structure as well (guards against malformed returns).
  console.log(validateSafe(AuthResult$, auth));
  render(auth);
}

async function demoInvalidPayload() {
  const data = await loadJson("data/credentials-invalid.json");
  const validated = validateSafe<Credentials>(Credentials$, data);
  console.log("Invalid payload: ", validated);
}

if (import.meta.main) {
  await demoValid();
  await demoInvalidPayload();
}
