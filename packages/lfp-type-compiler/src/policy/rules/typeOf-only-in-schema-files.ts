// LFP1016: Forbid typeOf<T>() outside *.schema.ts files
import ts from "npm:typescript";
import { Rule } from "../context.ts";

export const typeOfOnlyInSchemaFilesRule: Rule = {
  meta: {
    id: "LFP1016",
    name: "typeof-only-in-schema-files",
    defaultSeverity: "error",
    defaultOptions: {},
    description: "typeOf<T>() may only appear in files named *.schema.ts to avoid leaking compiler internals into domain types.",
  },
  analyzeUsage(node, ctx) {
    if (!ts.isCallExpression(node)) return;
    if (!ts.isIdentifier(node.expression) || node.expression.text !== "typeOf") return;
    const sf = node.getSourceFile();
    if (!sf.fileName.endsWith(".schema.ts")) {
      ctx.report(node, "LFP1016: Move `typeOf<T>()` calls to a dedicated *.schema.ts file. Quick fix: create `schemas.schema.ts` and export your schema there.");
    }
  }
};
