// packages/lfts-type-compiler/src/policy/rules/adt-properly-discriminated.ts
import ts from "npm:typescript";
import { resolveTypeLiteralNode, Rule } from "../context.ts";

// Hard requirement: discriminant key must be exactly 'type', string-literal, unique per variant.
const TAG = "type";

function isObjectLikeUnion(
  node: ts.UnionTypeNode,
  checker: ts.TypeChecker,
): boolean {
  // Object-like if every alternative resolves to a type literal
  return node.types.every((t) => !!resolveTypeLiteralNode(t, checker));
}

function resolveToUnionTypeNode(
  node: ts.TypeNode,
  checker: ts.TypeChecker,
): ts.UnionTypeNode | null {
  if (ts.isUnionTypeNode(node)) return node;
  if (ts.isTypeReferenceNode(node) && ts.isIdentifier(node.typeName)) {
    const sym = checker.getSymbolAtLocation(node.typeName);
    if (sym && sym.declarations && sym.declarations.length > 0) {
      const decl = sym.declarations[0];
      if (ts.isTypeAliasDeclaration(decl) && ts.isUnionTypeNode(decl.type)) {
        return decl.type;
      }
    }
  }
  return null;
}

export const adtProperlyDiscriminatedRule: Rule = {
  meta: {
    id: "LFP1006",
    name: "adt-properly-discriminated",
    defaultSeverity: "error",
    defaultOptions: {},
    description:
      "ADT unions of object types must be discriminated by a 'type' string-literal with unique values.",
  },
  analyzeUsage(node, ctx) {
    if (!ts.isCallExpression(node)) return;
    if (
      !ts.isIdentifier(node.expression) || node.expression.text !== "typeOf"
    ) return;
    if (!node.typeArguments || node.typeArguments.length !== 1) return;
    const T = node.typeArguments[0];
    const u = resolveToUnionTypeNode(T, ctx.checker);
    if (!u) return;
    if (!isObjectLikeUnion(u, ctx.checker)) return; // not an ADT of object literals → ignore

    // Find which variants have which discriminant keys
    // If variants use inconsistent discriminant keys (some 'type', some 'kind', some none),
    // treat as regular union rather than ADT
    const variantKeys: (string | null)[] = [];
    for (const alt of u.types) {
      const lit = resolveTypeLiteralNode(alt, ctx.checker)!;
      let discriminantKey: string | null = null;

      // Look for string-literal properties that could be discriminants
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
          // Consider common discriminant keys: type, kind, tag
          if (keyText === "type" || keyText === "kind" || keyText === "tag") {
            discriminantKey = keyText;
            break;
          }
        }
      }
      variantKeys.push(discriminantKey);
    }

    // Count variants with 'type' key specifically
    const typeKeyCount = variantKeys.filter((k) => k === "type").length;

    // If no variant has 'type' key, this is not an ADT → skip validation
    if (typeKeyCount === 0) return;

    // If some variants have 'type' but others have different discriminant keys, treat as regular union
    const hasOtherKeys = variantKeys.some((k) => k !== null && k !== "type");
    if (hasOtherKeys) return;

    // If at least one variant has 'type' key and no variants have other discriminant keys,
    // then ALL variants must have 'type' key
    if (typeKeyCount !== u.types.length) {
      ctx.report(
        u,
        `LFP1006: ADT must be discriminated by a '${TAG}' string-literal property on every variant.`,
      );
      return;
    }

    // Must have consistent 'type' property with string-literal values and uniqueness
    const tagValues: string[] = [];
    for (const alt of u.types) {
      const lit = resolveTypeLiteralNode(alt, ctx.checker)!;
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
      if (!found) {
        ctx.report(
          u,
          `LFP1006: ADT must be discriminated by a '${TAG}' string-literal property with unique string literal values.`,
        );
        return;
      }
      tagValues.push(found);
    }
    // uniqueness check
    const set = new Set(tagValues);
    if (set.size !== tagValues.length) {
      ctx.report(
        u,
        `LFP1006: ADT variant tags must be unique on '${TAG}': ${
          JSON.stringify(tagValues)
        }`,
      );
      return;
    }
  },
};
