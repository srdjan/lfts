/** @port */
export interface ConsolePort {
  log(line: string): void;
}

/** adapter to Deno console */
export function denoConsole(): ConsolePort {
  return { log: (line) => console.log(line) };
}
