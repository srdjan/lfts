// LFP1011: Disallow `null` in schemas; prefer absence with optional `?` where applicable.
import ts from "npm:typescript";
import { Rule, isTypeOfCall, resolveTypeAlias } from "../context.ts";

export const noNullInSchemasRule: Rule = {
  meta: {
    id: "LFP1011",
    name: "no-null-in-schemas",
    defaultSeverity: "error",
    defaultOptions: {},
    description: "Disallow `null` in data schemas. Use optionals (`?`) for absence semantics.",
  },
  analyzeUsage(node, ctx) {
    if (!isTypeOfCall(node)) return;
    const T = resolveTypeAlias(node.typeArguments![0], ctx.checker);
    function walk(n: ts.Node) {
      if (n.kind === ts.SyntaxKind.NullKeyword) {
        ctx.report(n, "LFP1011: `null` is not allowed in schemas. Use optionals (`?`) or explicit unions without null.\nQuick fix: remove `| null` and mark property optional if modeling absence.");
      }
      ts.forEachChild(n, walk);
    }
    walk(T);
  }
};
