// packages/lfp-type-compiler/src/policy/engine.ts
import ts from "npm:typescript";
import { createContext, Rule, rules } from "./context.ts";

export function runPolicy(program: ts.Program, checker: ts.TypeChecker, srcDir: string): ts.Diagnostic[] {
  const ctx = createContext(program, checker);
  const diags: ts.Diagnostic[] = [];
  // Normalize srcDir: ensure trailing slash and remove duplicate slashes
  const normalizedSrcDir = (srcDir.endsWith('/') ? srcDir : srcDir + '/').replace(/\/+/g, '/');

  for (const sf of program.getSourceFiles()) {
    if (sf.isDeclarationFile || !sf.fileName.startsWith(normalizedSrcDir)) continue;
    const visit = (node: ts.Node) => {
      // declaration phase
      if (ts.isInterfaceDeclaration(node)) {
        for (const r of rules) r.analyzeDeclaration?.(node, ctx);
      }
      // usage phase
      for (const r of rules) r.analyzeUsage?.(node, ctx);
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  diags.push(...ctx.flush());
  return diags;
}
