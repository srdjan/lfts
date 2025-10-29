// LFP1013: If an imported symbol is used only in type positions, require `import type`.
import ts from "npm:typescript";
import { Rule, isInTypePosition } from "../context.ts";

export const typeOnlyImportsRule: Rule = {
  meta: {
    id: "LFP1013",
    name: "type-only-imports",
    defaultSeverity: "error",
    defaultOptions: {},
    description: "Require `import type` for type-only imports.",
  },
  analyzeUsage(node, ctx) {
    if (!ts.isSourceFile(node)) return;
    for (const stmt of node.statements) {
      if (!ts.isImportDeclaration(stmt)) continue;
      const clause = stmt.importClause;
      if (!clause || clause.isTypeOnly) continue;
      const bindings = clause.namedBindings && ts.isNamedImports(clause.namedBindings) ? clause.namedBindings.elements : [];
      for (const el of bindings) {
        const name = el.name;
        const sym = ctx.checker.getSymbolAtLocation(name);
        if (!sym) continue;
        // find uses in this file
        let valueUse = false;
        let typeOnly = false;
        const visit = (n: ts.Node) => {
          if (ts.isIdentifier(n)) {
            const s = ctx.checker.getSymbolAtLocation(n);
            if (s === sym) {
              if (isInTypePosition(n)) typeOnly = true; else valueUse = true;
            }
          }
          ts.forEachChild(n, visit);
        };
        ts.forEachChild(node, visit);
        if (!valueUse && typeOnly) {
          // require import type
          ctx.report(el, `LFP1013: '${name.text}' is used only in type positions. Use 'import type { ${name.text} } from ...'.\nQuick fix: prefix the import with 'import type'.`);
        }
      }
    }
  }
};
