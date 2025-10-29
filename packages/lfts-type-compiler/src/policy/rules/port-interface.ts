// packages/lfts-type-compiler/src/policy/rules/port-interface.ts
import ts from "npm:typescript";
import { hasJSDocTag, Rule } from "../context.ts";

export const portInterfaceRule: Rule = {
  meta: {
    id: "LFP1001",
    name: "port-interface",
    defaultSeverity: "error",
    defaultOptions: {},
    description:
      "Interfaces used as capabilities must contain only function members.",
  },
  analyzeDeclaration(node, ctx) {
    if (!ts.isInterfaceDeclaration(node)) return;
    const name = node.name.getText();
    const cfg = ctx.options?.rules?.["port-interface"] ?? {};
    const suffixes: string[] = cfg.suffixes ?? ["Port", "Capability"];
    const hasSuffix = suffixes.some((s: string) => name.endsWith(s));
    const hasTag = hasJSDocTag(node, "port");

    if (!(hasSuffix || hasTag)) return;

    const sym = ctx.checker.getSymbolAtLocation(node.name);
    if (sym) ctx.classify.markPort(sym);

    const ty = ctx.checker.getTypeAtLocation(node.name);
    for (const prop of ty.getProperties()) {
      const pT = ctx.checker.getTypeOfSymbolAtLocation(prop, node.name);
      if (pT.getCallSignatures().length === 0) {
        ctx.report(
          node,
          `LFP1001: Interface '${name}' must only contain function members. Non-function property: '${prop.getName()}'.`,
        );
      }
    }
  },
};
