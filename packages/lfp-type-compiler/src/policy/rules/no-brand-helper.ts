// LFP1010: Disallow Brand<"X"> in schemas; use structural brand T & { readonly __brand: "X" }.
import ts from "npm:typescript";
import { Rule, isTypeOfCall, resolveTypeAlias } from "../context.ts";

export const noBrandHelperRule: Rule = {
  meta: {
    id: "LFP1010",
    name: "no-brand-helper",
    defaultSeverity: "error",
    defaultOptions: {},
    description: "Brand<...> helper is not allowed in schemas; use structural brand intersection with __brand.",
  },
  analyzeUsage(node, ctx) {
    if (!isTypeOfCall(node)) return;
    const T = node.typeArguments![0];

    function walk(n: ts.Node) {
      // If this is a type reference, resolve it and walk the resolved type
      if (ts.isTypeNode(n)) {
        const resolved = resolveTypeAlias(n as ts.TypeNode, ctx.checker);
        if (resolved !== n) {
          walk(resolved);
          // Don't return - still need to check children of n itself
        }
      }

      // Check if this node is a Brand<> reference
      if (ts.isTypeReferenceNode(n) && ts.isIdentifier(n.typeName) && n.typeName.text === "Brand") {
        ctx.report(n, "LFP1010: Use structural brand: T & { readonly __brand: \"Tag\" } (Brand<...> is disallowed).\nQuick fix: replace Brand<\"X\"> with { readonly __brand: \"X\" } intersection.");
      }

      ts.forEachChild(n, walk);
    }
    walk(T);
  }
};
