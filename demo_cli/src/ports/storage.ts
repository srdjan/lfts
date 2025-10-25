/** @port */
export interface StoragePort {
  load(): string;                 // returns JSON string or empty "" on first run
  save(json: string): void;       // writes JSON
}

/** File-based storage adapter (synchronous) */
export function fileStorage(path: string): StoragePort {
  return {
    load: () => {
      try { return Deno.readTextFileSync(path); } catch { return ""; }
    },
    save: (json) => {
      Deno.writeTextFileSync(path, json);
    }
  };
}
