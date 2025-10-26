/** @port */
export interface StoragePort {
  load(): string;                 // returns JSON string or empty "" on first run
  save(json: string): boolean;    // writes JSON, returns true on success
}

/** File-based storage adapter (synchronous) */
export function fileStorage(path: string): StoragePort {
  return {
    load: () => {
      try {
        return Deno.readTextFileSync(path);
      } catch {
        // File doesn't exist yet (first run) or permission error
        return "";
      }
    },
    save: (json) => {
      try {
        Deno.writeTextFileSync(path, json);
        return true;
      } catch (err) {
        console.error(`Failed to save to ${path}: ${err instanceof Error ? err.message : String(err)}`);
        return false;
      }
    }
  };
}
