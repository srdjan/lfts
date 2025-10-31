// packages/lfts-type-compiler/src/policy/context.ts
import ts from "npm:typescript";
import { formatCodeFrame } from "../diag.ts";

export type Severity = "error" | "warning";

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
  report(node: ts.Node, message: string, severity?: Severity): void;
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
    report(node, message, severity = "error") {
      const sf = node.getSourceFile();
      const category = severity === "warning"
        ? ts.DiagnosticCategory.Warning
        : ts.DiagnosticCategory.Error;

      state.diagnostics.push({
        category,
        code: 1,
        file: sf,
        start: node.getStart(),
        length: node.getWidth(),
        messageText: message + "\n" +
          formatCodeFrame(sf, node.getStart(), node.getWidth()),
      });
    },
    classify: {
      markPort(sym) {
        state.portSet.add(sym);
      },
      isPort(sym) {
        return state.portSet.has(sym);
      },
    },
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
import { dataMustBeTypeAliasRule } from "./rules/data-must-be-type-alias.ts";
import { noBrandHelperRule } from "./rules/no-brand-helper.ts";
import { noNullInSchemasRule } from "./rules/no-null-in-schemas.ts";
import { schemaCanonicalFormsRule } from "./rules/schema-canonical-forms.ts";
import { noUndefinedUnionInPropRule } from "./rules/no-undefined-union-in-prop.ts";
import { typeOfOnlyInSchemaFilesRule } from "./rules/typeOf-only-in-schema-files.ts";
import { portMethodSignaturesOnlyRule } from "./rules/port-method-signatures-only.ts";
import { typeOnlyImportsRule } from "./rules/type-only-imports.ts";
import { noAsAssertionsInSchemaFilesRule } from "./rules/no-as-assertions-in-schema-files.ts";
import { noImperativeBranchingRule } from "./rules/no-imperative-branching.ts";
import { noBitwiseExceptPipelineRule } from "./rules/no-bitwise-except-pipeline.ts";
import { suggestAsyncResultRule } from "./rules/suggest-async-result.ts";

rules.push(
  portInterfaceRule,
  portsNotInDataRule,
  dataNoFunctionsRule,
  adtProperlyDiscriminatedRule,
  exhaustiveMatchRule,
  dataMustBeTypeAliasRule,
  noBrandHelperRule,
  noNullInSchemasRule,
  schemaCanonicalFormsRule,
  noUndefinedUnionInPropRule,
  typeOfOnlyInSchemaFilesRule,
  portMethodSignaturesOnlyRule,
  typeOnlyImportsRule,
  noAsAssertionsInSchemaFilesRule,
  noImperativeBranchingRule, // Phase 1.1: Result/Option combinators
  noBitwiseExceptPipelineRule,
  suggestAsyncResultRule, // Phase 2: AsyncResult helpers
);

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
  const candidates = ["lfp.config.json", "lfts.config.json"];
  for (const path of candidates) {
    try {
      const txt = Deno.readTextFileSync(path);
      return JSON.parse(txt);
    } catch (err) {
      // File missing or JSON parse failure – try next candidate.
      if (err instanceof SyntaxError) {
        console.warn(
          `Failed to parse ${path}: ${err.message}. Falling back to defaults.`,
        );
        break;
      }
    }
  }
  return { rules: {} };
}

export function hasJSDocTag(node: ts.Node, tagName: string): boolean {
  const jsDocs = ts.getJSDocTags(node) ?? [];
  return jsDocs.some((t) => t.tagName.getText() === tagName);
}

// very small helpers to spot typeOf<T> calls
export function isTypeOfCall(node: ts.Node): node is ts.CallExpression {
  if (!ts.isCallExpression(node)) return false;
  const expr = node.expression;
  return ts.isIdentifier(expr) && expr.text === "typeOf" &&
    node.typeArguments?.length === 1;
}

/**
 * Resolve a type reference to the underlying type node.
 * If node is a type reference to a type alias, returns the aliased type node.
 * Otherwise returns the node itself.
 */
export function resolveTypeAlias(
  node: ts.TypeNode,
  checker: ts.TypeChecker,
): ts.TypeNode {
  if (ts.isTypeReferenceNode(node) && ts.isIdentifier(node.typeName)) {
    const sym = checker.getSymbolAtLocation(node.typeName);
    if (sym && sym.declarations && sym.declarations.length > 0) {
      const decl = sym.declarations[0];
      if (ts.isTypeAliasDeclaration(decl)) {
        return decl.type;
      }
    }
  }
  return node;
}

// ADT helper: resolve a type node to its underlying type literal
export function resolveTypeLiteralNode(
  node: ts.TypeNode,
  checker: ts.TypeChecker,
): ts.TypeLiteralNode | null {
  if (ts.isTypeLiteralNode(node)) return node;
  const resolved = resolveTypeAlias(node, checker);
  if (ts.isTypeLiteralNode(resolved)) return resolved;
  return null;
}
