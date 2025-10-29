// packages/lfts-type-compiler/src/policy/rules/exhaustive-match.ts
import ts from "npm:typescript";
import { resolveTypeLiteralNode, Rule } from "../context.ts";
import { formatCodeFrame } from "../../diag.ts";

const TAG = "type";

function unionIsADT(
  node: ts.TypeNode,
  checker: ts.TypeChecker,
): { tags: string[] } | null {
  if (!ts.isUnionTypeNode(node)) return null;
  const u = node as ts.UnionTypeNode;
  const tags: string[] = [];
  for (const alt of u.types) {
    const lit = resolveTypeLiteralNode(alt, checker);
    if (!lit) return null;
    let found: string | null = null;
    for (const m of lit.members) {
      if (
        ts.isPropertySignature(m) && m.name && m.type &&
        ts.isLiteralTypeNode(m.type) && ts.isStringLiteral(m.type.literal)
      ) {
        const keyText =
          (ts.isIdentifier(m.name) || ts.isStringLiteral(m.name) ||
              ts.isNumericLiteral(m.name))
            ? (m.name as any).text
            : undefined;
        if (keyText === TAG) {
          found = m.type.literal.text;
          break;
        }
      }
    }
    if (!found) return null;
    tags.push(found);
  }
  const set = new Set(tags);
  if (set.size !== tags.length) return null;
  return { tags: [...set] };
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
    const valueTypeNode = ctx.checker.typeToTypeNode(
      valueType,
      undefined,
      ts.NodeBuilderFlags.NoTruncation,
    );
    if (!valueTypeNode) return;
    const adt = unionIsADT(valueTypeNode, ctx.checker);
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
