// demo_cli/src/util.ts
// Utility functions that use OOP constructs (not compiled by LFTS)

export function decodeText(buf: Uint8Array): string {
  return new TextDecoder().decode(buf);
}

export function concatenateChunks(chunks: Uint8Array[]): Uint8Array {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const buf = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    buf.set(chunk, offset);
    offset += chunk.length;
  }
  return buf;
}
