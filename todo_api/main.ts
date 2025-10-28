import { createHttpHandler } from "./http/server.ts";
import { createSystemClock } from "./adapters/system_clock.ts";
import { createDenoKvStoragePort } from "./adapters/deno_kv_storage.ts";

async function main(): Promise<void> {
  const port = parsePort(Deno.env.get("PORT"));
  const kv = await Deno.openKv();
  const storage = createDenoKvStoragePort({ kv });
  const clock = createSystemClock();

  const handler = createHttpHandler({ storage, clock });

  const server = Deno.serve({ port }, handler);
  console.log(`todo_api listening on http://127.0.0.1:${port}`);

  let isClosed = false;
  const shutdown = () => {
    if (isClosed) return;
    isClosed = true;
    console.log("Shutting down todo_api...");
    server.shutdown();
    kv.close();
  };

  Deno.addSignalListener("SIGINT", shutdown);
  Deno.addSignalListener("SIGTERM", shutdown);

  await server.finished;
  shutdown();
}

function parsePort(value: string | undefined): number {
  if (!value) return 8000;
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed > 0 && parsed < 65536) {
    return parsed;
  }
  console.warn(`Invalid PORT '${value}', defaulting to 8000`);
  return 8000;
}

await main();
