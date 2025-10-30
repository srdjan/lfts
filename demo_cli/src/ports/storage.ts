import { AsyncResult, Result } from "../../../packages/lfts-type-runtime/mod.ts";

// Storage error types
export type LoadError = "not_found" | "read_error" | "parse_error";
export type SaveError = "write_error" | "permission_denied";

/** @port */
export interface StoragePort {
  load(): Promise<Result<string, LoadError>>;
  save(json: string): Promise<Result<void, SaveError>>;
}

/** File-based storage adapter using AsyncResult */
export function fileStorage(path: string): StoragePort {
  return {
    load: () => {
      return AsyncResult.try(
        async () => {
          try {
            return await Deno.readTextFile(path);
          } catch (err) {
            // File doesn't exist on first run
            if (err instanceof Deno.errors.NotFound) {
              return "";
            }
            throw err;
          }
        },
        (err): LoadError => {
          if (err instanceof Deno.errors.NotFound) return "not_found";
          return "read_error";
        }
      );
    },
    save: (json) => {
      return AsyncResult.try(
        async () => {
          await Deno.writeTextFile(path, json);
        },
        (err): SaveError => {
          if (err instanceof Deno.errors.PermissionDenied) {
            return "permission_denied";
          }
          return "write_error";
        }
      );
    }
  };
}
