// LFP1014: Ban `as` assertions in files that define schemas (contain typeOf<T>()).
import ts from "npm:typescript";
import { Rule } from "../context.ts";

export const noAsAssertionsInSchemaFilesRule: Rule = {
  meta: {
    id: "LFP1014",
    name: "no-as-assertions-in-schema-files",
    defaultSeverity: "error",
    defaultOptions: {},
    description: "Files that define schemas must not use `as` assertions; prefer type annotations or `satisfies`.",
  },
  analyzeUsage(node, ctx) {
    if (!ts.isSourceFile(node)) return;
    let hasSchema = false;
    const findSchema = (n: ts.Node) => {
      if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === "typeOf" && n.typeArguments?.length === 1) {
        hasSchema = true;
      }
      ts.forEachChild(n, findSchema);
    };
    findSchema(node);
    if (!hasSchema) return;
    const walk = (n: ts.Node) => {
      if (ts.isAsExpression(n)) {
        ctx.report(n, "LFP1014: Avoid `as` assertions in schema files. Use `const x: T = ...` or `satisfies T`.\nQuick fix: `const x: T = expr`.");
      }
      ts.forEachChild(n, walk);
    };
    walk(node);
  }
};
