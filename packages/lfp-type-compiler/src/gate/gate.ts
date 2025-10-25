// packages/lfp-type-compiler/src/gate/gate.ts
import ts from "npm:typescript";
import { formatCodeFrame } from "../diag.ts";

const bannedSyntax = new Set([
  ts.SyntaxKind.ClassDeclaration,
  ts.SyntaxKind.Decorator,
  ts.SyntaxKind.ThisKeyword,
  ts.SyntaxKind.NewExpression,
  ts.SyntaxKind.HeritageClause, // extends/implements
  ts.SyntaxKind.MappedType,
  ts.SyntaxKind.ConditionalType,
  ts.SyntaxKind.TemplateLiteralType,
  ts.SyntaxKind.IndexSignature,
  ts.SyntaxKind.EnumDeclaration,
]);

export function runGate(program: ts.Program): ts.Diagnostic[] {
  const diags: ts.Diagnostic[] = [];
  for (const sf of program.getSourceFiles()) {
    if (sf.isDeclarationFile) continue;
    const visit = (node: ts.Node) => {
      if (bannedSyntax.has(node.kind) || (ts.isTypeOperatorNode(node) && node.operator === ts.SyntaxKind.KeyOfKeyword)) {
        diags.push(diag(sf, node, `LFP000x: Disallowed syntax in Iteration-1: ${ts.SyntaxKind[node.kind]}`));
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  return diags;
}

function diag(file: ts.SourceFile, node: ts.Node, message: string): ts.Diagnostic {
  return { category: ts.DiagnosticCategory.Error, code: 1, file, start: node.getStart(), length: node.getWidth(), messageText: message };
}
