// packages/lfts-type-compiler/src/policy/rules/ports-not-in-data.ts
import ts from "npm:typescript";
import { isTypeOfCall, Rule } from "../context.ts";

export const portsNotInDataRule: Rule = {
  meta: {
    id: "LFP1002",
    name: "ports-not-in-data",
    defaultSeverity: "error",
    defaultOptions: {},
    description: "Ports must not be embedded in data schemas.",
  },
  analyzeUsage(node, ctx) {
    if (!isTypeOfCall(node)) return;
    const T = ctx.checker.getTypeFromTypeNode(node.typeArguments![0]);
    // Walk symbols reachable from T
    const stack: ts.Type[] = [T];
    while (stack.length) {
      const t = stack.pop()!;
      const sym = t.getSymbol();
      if (sym && ctx.classify.isPort(sym)) {
        ctx.report(
          node,
          `LFP1002: Capability '${sym.getName()}' must not appear in data schemas (typeOf<T>()). Inject via parameters instead.`,
        );
        return;
      }
      // enqueue properties and union/tuple/array element types
      for (const p of t.getProperties()) {
        const pT = ctx.checker.getTypeOfSymbolAtLocation(p, node);
        stack.push(pT);
      }
      for (const u of (t as any).types ?? []) stack.push(u);
      const str = ctx.checker.typeToString(t);
      if (str.endsWith("[]")) {
        // coarse detection; in Iteration-1 we keep types simple
      }
    }
  },
};
