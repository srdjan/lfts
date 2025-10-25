// LFP1009: Forbid `T | undefined` on object properties in schemas. Use `prop?: T` instead.
import ts from "npm:typescript";
import { Rule, isTypeOfCall } from "../context.ts";

export const noUndefinedUnionInPropRule: Rule = {
  meta: {
    id: "LFP1009",
    name: "no-undefined-union-in-prop",
    defaultSeverity: "error",
    defaultOptions: {},
    description: "Use optional `?` properties instead of `T | undefined` in schemas.",
  },
  analyzeUsage(node, ctx) {
    if (!isTypeOfCall(node)) return;
    const T = node.typeArguments![0];
    function checkTypeLiteral(lit: ts.TypeLiteralNode) {
      for (const m of lit.members) {
        if (!ts.isPropertySignature(m) || !m.type) continue;
        const t = m.type;
        if (ts.isUnionTypeNode(t) && t.types.some(x => x.kind === ts.SyntaxKind.UndefinedKeyword)) {
          ctx.report(m, `LFP1009: Use optional \`?\` for '${(m.name as any).text}' instead of union with undefined.\nQuick fix: change to '${(m.name as any).text}? : <T>'`);
        }
      }
    }
    function walk(n: ts.Node) {
      if (ts.isTypeLiteralNode(n)) checkTypeLiteral(n);
      ts.forEachChild(n, walk);
    }
    walk(T);
  }
};
