import { AsyncResult, Result, validateSafe } from "../../packages/lfts-type-runtime/mod.ts";
import { LoadUserResult$, User$ } from "./src/types.schema.ts";
import type { LoadUserResult, User } from "./src/types.ts";

function loadUser(path: string): Promise<LoadUserResult> {
  const prefixes = ["./", "../", "../../", "../../../", "../../../../", "../../../../../"];

  const fileLoad = AsyncResult.try(
    async () => {
      for (const prefix of prefixes) {
        try {
          return await Deno.readTextFile(new URL(prefix + path, import.meta.url));
        } catch (error) {
          if (error instanceof Deno.errors.NotFound) continue;
          throw error;
        }
      }
      throw new Deno.errors.NotFound(`Could not load ${path}`);
    },
    (error) => ({ type: "network" as const, message: String(error) }),
  );

  const parsed = AsyncResult.andThen(fileLoad, (text) => {
    try {
      return Promise.resolve(Result.ok(JSON.parse(text) as unknown));
    } catch (error) {
      return Promise.resolve(Result.err({
        type: "parse" as const,
        message: String(error),
      }));
    }
  });

  const validated = AsyncResult.andThen(parsed, (raw) => {
    const checked = validateSafe<User>(User$, raw);
    if (checked.ok) {
      return Promise.resolve(Result.ok(checked.value));
    }
    return Promise.resolve(Result.err({
      type: "parse" as const,
      message: `${checked.error.path}: ${checked.error.message}`,
    }));
  });

  return validated;
}

async function run() {
  const ok = await loadUser("./data/user.json");
  console.log("Success ->", ok);
  console.log("validateSafe on success ->", validateSafe(LoadUserResult$, ok));

  const missing = await loadUser("./data/missing.json");
  console.log("\nMissing file ->", missing);
  console.log("validateSafe on failure ->", validateSafe(LoadUserResult$, missing));
}

if (import.meta.main) {
  await run();
}
