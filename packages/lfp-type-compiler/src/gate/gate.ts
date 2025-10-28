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

export function runGate(program: ts.Program): readonly ts.Diagnostic[] {
  return program
    .getSourceFiles()
    .filter(sf => !sf.isDeclarationFile)
    .flatMap(sf => checkSourceFile(sf));
}

// Pure function: checks a single source file and returns diagnostics
function checkSourceFile(sf: ts.SourceFile): readonly ts.Diagnostic[] {
  return checkNode(sf, sf);
}

// Pure recursive function: checks a node and its children, accumulating diagnostics
function checkNode(sf: ts.SourceFile, node: ts.Node): readonly ts.Diagnostic[] {
  // Check current node
  const currentDiag = isBannedSyntax(node)
    ? [createDiag(sf, node, `LFP000x: Disallowed syntax in Iteration-1: ${ts.SyntaxKind[node.kind]}`)]
    : [];

  // Check children
  const childDiags: ts.Diagnostic[] = [];
  ts.forEachChild(node, child => {
    childDiags.push(...checkNode(sf, child));
  });

  return [...currentDiag, ...childDiags];
}

// Pure predicate: determines if syntax is banned
function isBannedSyntax(node: ts.Node): boolean {
  return bannedSyntax.has(node.kind) ||
    (ts.isTypeOperatorNode(node) && node.operator === ts.SyntaxKind.KeyOfKeyword);
}

// Pure factory function: creates a diagnostic
function createDiag(file: ts.SourceFile, node: ts.Node, message: string): ts.Diagnostic {
  return {
    category: ts.DiagnosticCategory.Error,
    code: 1,
    file,
    start: node.getStart(),
    length: node.getWidth(),
    messageText: message
  };
}
