// packages/lfts-type-compiler/src/diag.ts
import ts from "npm:typescript";

export function formatCodeFrame(
  file: ts.SourceFile,
  start: number,
  length: number,
  context = 2,
): string {
  const src = file.getFullText();
  const startLC = file.getLineAndCharacterOfPosition(start);
  const endLC = file.getLineAndCharacterOfPosition(
    start + Math.max(0, length - 1),
  );
  const fromLine = Math.max(0, startLC.line - context);
  const toLine = Math.min(
    file.getLineAndCharacterOfPosition(src.length).line,
    endLC.line + context,
  );

  const lines = src.split(/\r?\n/);
  const numWidth = String(toLine + 1).length;
  let out = "";
  for (let ln = fromLine; ln <= toLine; ln++) {
    const lineText = lines[ln] ?? "";
    const gutter = String(ln + 1).padStart(numWidth, " ");
    const isErrorLine = ln === startLC.line;
    out += `${gutter} | ${lineText}\n`;
    if (isErrorLine) {
      const caretOffset = startLC.character;
      const caretLen = Math.max(
        1,
        ln === endLC.line ? endLC.character - startLC.character + 1 : 1,
      );
      out += `${" ".repeat(numWidth)} | ${" ".repeat(caretOffset)}${
        "^".repeat(caretLen)
      }\n`;
    }
  }
  return out;
}

export function diagnostic(
  file: ts.SourceFile,
  node: ts.Node,
  message: string,
): ts.Diagnostic {
  return {
    category: ts.DiagnosticCategory.Error,
    code: 1,
    file,
    start: node.getStart(),
    length: node.getWidth(),
    messageText: message + "\n" +
      formatCodeFrame(file, node.getStart(), node.getWidth()),
  };
}
