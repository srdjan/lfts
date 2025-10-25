// LFP1012: In `@port` interfaces, members must be method signatures (no property function types).
import ts from "npm:typescript";
import { Rule, hasJSDocTag } from "../context.ts";

export const portMethodSignaturesOnlyRule: Rule = {
  meta: {
    id: "LFP1012",
    name: "port-method-signatures-only",
    defaultSeverity: "error",
    defaultOptions: {},
    description: "Ports must declare functions as method signatures, not property function types.",
  },
  analyzeDeclaration(node, ctx) {
    if (!ts.isInterfaceDeclaration(node)) return;
    const isPort = hasJSDocTag(node, "port") || node.name.getText().endsWith("Port") || node.name.getText().endsWith("Capability");
    if (!isPort) return;
    const ty = ctx.checker.getTypeAtLocation(node.name);
    for (const m of node.members) {
      if (ts.isPropertySignature(m)) {
        const mt = m.type ? ctx.checker.getTypeAtLocation(m.type) : undefined;
        const hasCall = mt ? mt.getCallSignatures().length > 0 : false;
        if (hasCall) {
          ctx.report(m, "LFP1012: Use method signatures in @port interfaces (e.g., `foo(): R`) instead of property function types (`foo: () => R`).\nQuick fix: change `name: (args) => R` to `name(args): R`.");
        } else {
          ctx.report(m, "LFP1001: Interface used as Port must not contain data fields."); // keep LFP1001 spirit
        }
      }
    }
  }
};
