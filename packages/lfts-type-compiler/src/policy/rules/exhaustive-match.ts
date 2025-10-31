// packages/lfts-type-compiler/src/policy/rules/exhaustive-match.ts
import ts from "npm:typescript";
import { Rule } from "../context.ts";
import { formatCodeFrame } from "../../diag.ts";

const TAG = "type";

function getVariantTag(
  variant: ts.Type,
  checker: ts.TypeChecker,
  usageNode: ts.Node,
): string | null {
  const apparent = checker.getApparentType(variant);
  if (!(apparent.getFlags() & ts.TypeFlags.Object)) return null;
  const prop = apparent.getProperty(TAG);
  if (!prop) return null;
  if (prop.flags & ts.SymbolFlags.Optional) return null;
  const decl = prop.valueDeclaration ?? usageNode;
  const propType = checker.getTypeOfSymbolAtLocation(prop, decl);
  if (propType.flags & ts.TypeFlags.StringLiteral) {
    return (propType as ts.StringLiteralType).value;
  }
  return null;
}

function typeIsADT(
  type: ts.Type,
  checker: ts.TypeChecker,
): { tags: string[] } | null {
  if (!(type.flags & ts.TypeFlags.Union)) return null;
  const union = type as ts.UnionType;
  if (union.types.length === 0) return null;
  const tags: string[] = [];
  const seen = new Set<string>();
  for (const variant of union.types) {
    const tag = getVariantTag(variant, checker, variant.symbol?.valueDeclaration ?? checker.getProgram().getSourceFiles()[0]);
    if (tag === null) return null;
    if (seen.has(tag)) return null;
    seen.add(tag);
    tags.push(tag);
  }
  return { tags };
}

export const exhaustiveMatchRule: Rule = {
  meta: {
    id: "LFP1007",
    name: "exhaustive-match",
    defaultSeverity: "error",
    defaultOptions: {},
    description:
      "match(value, cases) must handle all ADT variants (discriminated by 'type') with no extras.",
  },
  analyzeUsage(node, ctx) {
    if (!ts.isCallExpression(node)) return;
    if (!ts.isIdentifier(node.expression) || node.expression.text !== "match") {
      return;
    }
    if (node.arguments.length !== 2) return;
    const [valueExpr, casesExpr] = node.arguments;
    if (!ts.isObjectLiteralExpression(casesExpr)) return; // only enforce on object-literal cases for now

    // Type of first arg, look for ADT
    const valueType = ctx.checker.getTypeAtLocation(valueExpr);
    const adt = typeIsADT(valueType, ctx.checker);
    if (!adt) return; // not an ADT; ignore

    const expected = new Set(adt.tags);
    const provided: string[] = [];
    const extra: string[] = [];

    for (const prop of casesExpr.properties) {
      if (!ts.isPropertyAssignment(prop)) continue;
      const name = prop.name;
      const key =
        ts.isIdentifier(name) || ts.isStringLiteral(name) ||
          ts.isNumericLiteral(name)
          ? (name as any).text
          : undefined;
      if (!key) continue;
      if (expected.has(key)) {
        provided.push(key);
      } else {
        extra.push(key);
      }
    }

    const missing = [...expected].filter((k) => !provided.includes(k));

    if (missing.length || extra.length) {
      const messages: string[] = [];
      if (missing.length) {
        messages.push(
          `missing cases: ${missing.map((x) => `'${x}'`).join(", ")}`,
        );
      }
      if (extra.length) {
        messages.push(`extra cases: ${extra.map((x) => `'${x}'`).join(", ")}`);
      }
      ctx.report(
        casesExpr,
        `LFP1007: non-exhaustive match over ADT (${messages.join("; ")})`,
      );
    }
  },
};
