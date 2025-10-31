// LFP1013: If an imported symbol is used only in type positions, require `import type`.
import ts from "npm:typescript";
import { Rule, isInTypePosition } from "../context.ts";

type ImportBinding = {
  name: ts.Identifier;
  kind: "default" | "named" | "namespace";
};

function collectBindings(clause: ts.ImportClause): ImportBinding[] {
  const bindings: ImportBinding[] = [];
  if (clause.isTypeOnly) return bindings;
  if (clause.name) {
    bindings.push({ name: clause.name, kind: "default" });
  }
  const named = clause.namedBindings;
  if (named) {
    if (ts.isNamedImports(named)) {
      for (const el of named.elements) {
        if (el.isTypeOnly) continue;
        bindings.push({ name: el.name, kind: "named" });
      }
    } else if (ts.isNamespaceImport(named)) {
      bindings.push({ name: named.name, kind: "namespace" });
    }
  }
  return bindings;
}

function isImportBindingParent(node: ts.Node): boolean {
  return ts.isImportClause(node) ||
    ts.isImportSpecifier(node) ||
    ts.isNamespaceImport(node) ||
    ts.isImportEqualsDeclaration(node) ||
    ts.isExportSpecifier(node);
}

function buildMessage(binding: ImportBinding): string {
  const id = binding.name.text;
  switch (binding.kind) {
    case "default":
      return `LFP1013: '${id}' is used only in type positions. Use 'import type ${id} from ...'.\nQuick fix: prefix the import with 'import type'.`;
    case "namespace":
      return `LFP1013: '${id}' namespace import is used only in type positions. Use 'import type * as ${id} from ...'.\nQuick fix: prefix the import with 'import type'.`;
    default:
      return `LFP1013: '${id}' is used only in type positions. Use 'import type { ${id} } from ...'.\nQuick fix: prefix the import with 'import type'.`;
  }
}

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
      const bindings = collectBindings(clause);
      for (const binding of bindings) {
        const { name } = binding;
        const sym = ctx.checker.getSymbolAtLocation(name);
        if (!sym) continue;
        // find uses in this file
        let valueUse = false;
        let typeOnly = false;
        const visit = (n: ts.Node) => {
          if (ts.isIdentifier(n)) {
            const s = ctx.checker.getSymbolAtLocation(n);
            if (s === sym) {
              if (isImportBindingParent(n.parent)) {
                ts.forEachChild(n, visit);
                return;
              }
              if (isInTypePosition(n)) typeOnly = true; else valueUse = true;
            }
          }
          ts.forEachChild(n, visit);
        };
        ts.forEachChild(node, visit);
        if (!valueUse && typeOnly) {
          // require import type
          ctx.report(name, buildMessage(binding));
        }
      }
    }
  }
};
