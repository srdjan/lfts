// packages/lfp-type-compiler/src/policy/context.ts
import ts from "npm:typescript";
import { formatCodeFrame } from "../diag.ts";

export type Severity = 'error';

export interface RuleMeta<Opts = unknown> {
  id: string;
  name: string;
  defaultSeverity: Severity;
  defaultOptions: Opts;
  description: string;
}

export interface RuleContext<Opts = unknown> {
  program: ts.Program;
  checker: ts.TypeChecker;
  options: any;
  report(node: ts.Node, message: string): void;
  classify: {
    markPort(sym: ts.Symbol): void;
    isPort(sym: ts.Symbol): boolean;
  };
}

export interface Rule<Opts = unknown> {
  meta: RuleMeta<Opts>;
  analyzeDeclaration?(node: ts.Declaration, ctx: RuleContext<Opts>): void;
  analyzeUsage?(node: ts.Node, ctx: RuleContext<Opts>): void;
}

// Policy state encapsulated within context (not module-level globals)
type PolicyState = {
  diagnostics: ts.Diagnostic[];
  portSet: Set<ts.Symbol>;
};

export function createContext(program: ts.Program, checker: ts.TypeChecker) {
  const cfg = readConfig();

  // Create isolated state for this compilation run
  const state: PolicyState = {
    diagnostics: [],
    portSet: new Set<ts.Symbol>(),
  };

  const ctx: RuleContext = {
    program,
    checker,
    options: cfg,
    report(node, message) {
      const sf = node.getSourceFile();
      state.diagnostics.push({
        category: ts.DiagnosticCategory.Error,
        code: 1,
        file: sf,
        start: node.getStart(),
        length: node.getWidth(),
        messageText: message + "\n" + formatCodeFrame(sf, node.getStart(), node.getWidth())
      });
    },
    classify: {
      markPort(sym) { state.portSet.add(sym); },
      isPort(sym) { return state.portSet.has(sym); },
    }
  };

  return Object.assign(ctx, {
    flush: () => {
      const diags = [...state.diagnostics];
      state.diagnostics.length = 0;
      return diags;
    },
  });
}

export const rules: Rule[] = [];
import { portInterfaceRule } from "./rules/port-interface.ts";
import { portsNotInDataRule } from "./rules/ports-not-in-data.ts";
import { dataNoFunctionsRule } from "./rules/data-no-functions.ts";
import { adtProperlyDiscriminatedRule } from "./rules/adt-properly-discriminated.ts";
import { exhaustiveMatchRule } from "./rules/exhaustive-match.ts";
rules.push(portInterfaceRule, portsNotInDataRule, dataNoFunctionsRule, adtProperlyDiscriminatedRule, exhaustiveMatchRule);


// schema helpers
export function walkTypeNode(node: ts.TypeNode, visit: (n: ts.Node) => void) {
  function rec(n: ts.Node) {
    visit(n as ts.TypeNode);
    ts.forEachChild(n, rec);
  }
  rec(node);
}
export function isInTypePosition(node: ts.Node): boolean {
  // Heuristic: climb until a statement; if encountered a TypeNode ancestor, treat as type position
  let cur: ts.Node | undefined = node;
  while (cur) {
    if (ts.isTypeNode(cur)) return true;
    if (ts.isStatement(cur)) return false;
    cur = cur.parent;
  }
  return false;
}

// helpers
function readConfig(): any {
  try {
    const txt = Deno.readTextFileSync("lfp.config.json");
    return JSON.parse(txt);
  } catch {
    return { rules: { } };
  }
}

export function hasJSDocTag(node: ts.Node, tagName: string): boolean {
  const jsDocs = (ts.getJSDocTags(node) ?? []);
  return jsDocs.some(t => t.tagName.getText() === tagName);
}

// very small helpers to spot typeOf<T> calls
export function isTypeOfCall(node: ts.Node): node is ts.CallExpression {
  if (!ts.isCallExpression(node)) return false;
  const expr = node.expression;
  return ts.isIdentifier(expr) && expr.text === "typeOf" && node.typeArguments?.length === 1;
}

// ADT helper: resolve a type node to its underlying type literal
export function resolveTypeLiteralNode(node: ts.TypeNode, checker: ts.TypeChecker): ts.TypeLiteralNode | null {
  if (ts.isTypeLiteralNode(node)) return node;
  if (ts.isTypeReferenceNode(node) && ts.isIdentifier(node.typeName)) {
    const sym = checker.getSymbolAtLocation(node.typeName);
    if (sym && sym.declarations && sym.declarations.length > 0) {
      const decl = sym.declarations[0];
      if (ts.isTypeAliasDeclaration(decl) && ts.isTypeLiteralNode(decl.type)) {
        return decl.type;
      }
    }
  }
  return null;
}
