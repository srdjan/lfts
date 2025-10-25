// packages/lfp-type-compiler/src/policy/rules/data-no-functions.ts
import ts from "npm:typescript";
import { Rule, isTypeOfCall } from "../context.ts";

export const dataNoFunctionsRule: Rule = {
  meta: {
    id: "LFP1003",
    name: "data-no-functions",
    defaultSeverity: "error",
    defaultOptions: {},
    description: "Data schemas must not contain function-typed fields.",
  },
  analyzeUsage(node, ctx) {
    if (!isTypeOfCall(node)) return;
    const T = ctx.checker.getTypeFromTypeNode(node.typeArguments![0]);
    const stack: ts.Type[] = [T];
    while (stack.length) {
      const t = stack.pop()!;
      for (const p of t.getProperties()) {
        const pT = ctx.checker.getTypeOfSymbolAtLocation(p, node);
        if (pT.getCallSignatures().length > 0) {
          ctx.report(node, `LFP1003: Data schema contains function property '${p.getName()}'. Move behavior into a capability interface.`);
          return;
        }
        stack.push(pT);
      }
      for (const u of (t as any).types ?? []) stack.push(u);
    }
  }
};
