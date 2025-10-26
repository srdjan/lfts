// LFP1008: Data objects in schemas must be `type` aliases, not `interface` (interfaces are for Ports).
import ts from "npm:typescript";
import { Rule, isTypeOfCall } from "../context.ts";

export const dataMustBeTypeAliasRule: Rule = {
  meta: {
    id: "LFP1008",
    name: "data-must-be-type-alias",
    defaultSeverity: "error",
    defaultOptions: {},
    description: "Schemas must not reference interface types; use `type` aliases for data. Interfaces are reserved for @port.",
  },
  analyzeUsage(node, ctx) {
    if (!isTypeOfCall(node)) return;
    const T = node.typeArguments![0];

    function check(n: ts.TypeNode) {
      if (ts.isTypeReferenceNode(n) && ts.isIdentifier(n.typeName)) {
        const sym = ctx.checker.getSymbolAtLocation(n.typeName);
        if (!sym) return;

        const decls = sym.getDeclarations() ?? [];
        for (const d of decls) {
          if (ts.isInterfaceDeclaration(d)) {
            if (!ctx.classify.isPort(sym)) {
              ctx.report(n, `LFP1008: Interface '${sym.getName()}' used in data schema. Use a \`type\` alias instead.`);
            }
          }
        }
      }
    }

    const visit = (n: ts.Node) => {
      if (ts.isTypeNode(n)) check(n);
    };

    ts.forEachChild(T, function recur(n) {
      visit(n);
      ts.forEachChild(n, recur);
    });
  }
};
