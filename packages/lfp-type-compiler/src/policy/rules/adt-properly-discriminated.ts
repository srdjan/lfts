
// packages/lfp-type-compiler/src/policy/rules/adt-properly-discriminated.ts
import ts from "npm:typescript";
import { Rule, resolveTypeLiteralNode } from "../context.ts";

// Hard requirement: discriminant key must be exactly 'type', string-literal, unique per variant.
const TAG = "type";

function isObjectLikeUnion(node: ts.UnionTypeNode, checker: ts.TypeChecker): boolean {
  // Object-like if every alternative resolves to a type literal
  return node.types.every(t => !!resolveTypeLiteralNode(t, checker));
}

export const adtProperlyDiscriminatedRule: Rule = {
  meta: {
    id: "LFP1006",
    name: "adt-properly-discriminated",
    defaultSeverity: "error",
    defaultOptions: {},
    description: "ADT unions of object types must be discriminated by a 'type' string-literal with unique values.",
  },
  analyzeUsage(node, ctx) {
    if (!ts.isCallExpression(node)) return;
    if (!ts.isIdentifier(node.expression) || node.expression.text !== "typeOf") return;
    if (!node.typeArguments || node.typeArguments.length !== 1) return;
    const T = node.typeArguments[0];
    if (!ts.isUnionTypeNode(T)) return;

    const u = T as ts.UnionTypeNode;
    if (!isObjectLikeUnion(u, ctx.checker)) return; // not an ADT of object literals → ignore

    // Must have consistent 'type' property with string-literal values and uniqueness
    const tagValues: string[] = [];
    for (const alt of u.types) {
      const lit = resolveTypeLiteralNode(alt, ctx.checker)!;
      let found: string | null = null;
      for (const m of lit.members) {
        if (ts.isPropertySignature(m) && m.name && m.type && ts.isLiteralTypeNode(m.type) && ts.isStringLiteral(m.type.literal)) {
          const keyText = (ts.isIdentifier(m.name) || ts.isStringLiteral(m.name) || ts.isNumericLiteral(m.name)) ? (m.name as any).text : undefined;
          if (keyText === TAG) { found = m.type.literal.text; break; }
        }
      }
      if (!found) {
        ctx.report(u, `LFP1006: ADT must be discriminated by a '${TAG}' string-literal property on every variant.`);
        return;
      }
      tagValues.push(found);
    }
    // uniqueness check
    const set = new Set(tagValues);
    if (set.size !== tagValues.length) {
      ctx.report(u, `LFP1006: ADT variant tags must be unique on '${TAG}': ${JSON.stringify(tagValues)}`);
      return;
    }
  }
};
