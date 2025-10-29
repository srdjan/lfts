// packages/lfts-type-compiler/src/transform/type-encoder.ts
// Shared type encoding logic for transformers
import ts from "npm:typescript";
import { match as patternMatch } from "ts-pattern";
import { type Bytecode, enc, Op } from "../../../lfts-type-spec/src/mod.ts";

/**
 * Extract property name text from PropertyName node
 * @param name - PropertyName node (identifier, string literal, numeric literal, or computed)
 * @returns Property name as string, or "???" for unsupported computed names
 */
export function getPropName(name: ts.PropertyName): string {
  if (
    ts.isIdentifier(name) || ts.isStringLiteral(name) ||
    ts.isNumericLiteral(name)
  ) {
    return name.text;
  }
  // Computed names are disallowed in Iteration-1 gate, fallback:
  return String((name as any).text ?? "???");
}

/**
 * Detect and encode brand patterns in intersection types
 * Supports:
 *  1) Intersection: <Base> & { readonly __brand: "Tag" }
 *  2) Intersection: <Base> & Brand<"Tag"> (future)
 *
 * @param node - Intersection type node
 * @returns Brand bytecode if pattern detected, null otherwise
 */
export function tryEncodeBrand(
  node: ts.IntersectionTypeNode,
): { bc: Bytecode } | null {
  if (node.types.length !== 2) return null;

  const [a, b] = node.types;

  const isStructuralBrand = (t: ts.TypeNode): string | null => {
    if (ts.isTypeLiteralNode(t)) {
      const member = t.members.find((m): m is ts.PropertySignature =>
        ts.isPropertySignature(m) && (m.name as any)?.text === "__brand"
      );
      if (
        member?.type && ts.isLiteralTypeNode(member.type) &&
        ts.isStringLiteral(member.type.literal)
      ) {
        return member.type.literal.text;
      }
    }
    return null;
  };

  const left = isStructuralBrand(a);
  const right = isStructuralBrand(b);

  if (left && !right) return { bc: enc.brand(encodeType(b), left) };
  if (right && !left) return { bc: enc.brand(encodeType(a), right) };

  return null;
}

function tryEncodeDiscriminatedUnion(node: ts.UnionTypeNode): Bytecode | null {
  if (node.types.length < 2) return null;

  const variants: { tag: string; schema: Bytecode }[] = [];
  const seenTags = new Set<string>();
  let tagKey: string | null = null;

  for (const member of node.types) {
    if (!ts.isTypeLiteralNode(member)) {
      return null;
    }

    let variantTag: string | null = null;

    for (const m of member.members) {
      if (!ts.isPropertySignature(m) || !m.type || !m.name) continue;
      if (m.questionToken) continue;
      if (
        !ts.isLiteralTypeNode(m.type) || !ts.isStringLiteral(m.type.literal)
      ) continue;

      const propName = getPropName(m.name);
      if (!propName || propName === "???") continue;

      if (tagKey === null) {
        tagKey = propName;
      }

      if (propName !== tagKey) continue;

      variantTag = m.type.literal.text;
      break;
    }

    if (variantTag === null) return null;

    const tagValue = variantTag;
    if (seenTags.has(tagValue)) {
      return null;
    }
    seenTags.add(tagValue);
    variants.push({ tag: tagValue, schema: encodeType(member) });
  }

  if (!tagKey) return null;

  return enc.dunion(tagKey, variants);
}

/**
 * Encode a TypeScript type node into LFTS bytecode
 * Uses ts-pattern for cleaner pattern matching
 * @param node - TypeScript type node to encode
 * @returns Bytecode array representation
 */
export function encodeType(node: ts.TypeNode): Bytecode {
  return patternMatch<ts.SyntaxKind, Bytecode>(node.kind)
    .with(ts.SyntaxKind.NumberKeyword, () => enc.num())
    .with(ts.SyntaxKind.StringKeyword, () => enc.str())
    .with(ts.SyntaxKind.BooleanKeyword, () => enc.bool())
    .with(ts.SyntaxKind.NullKeyword, () => enc.nul())
    .with(ts.SyntaxKind.UndefinedKeyword, () => enc.und())
    .with(
      ts.SyntaxKind.LiteralType,
      () => encodeLiteralType(node as ts.LiteralTypeNode),
    )
    .with(
      ts.SyntaxKind.ArrayType,
      () => enc.arr(encodeType((node as ts.ArrayTypeNode).elementType)),
    )
    .with(
      ts.SyntaxKind.TupleType,
      () => encodeTupleType(node as ts.TupleTypeNode),
    )
    .with(
      ts.SyntaxKind.TypeLiteral,
      () => encodeTypeLiteral(node as ts.TypeLiteralNode),
    )
    .with(
      ts.SyntaxKind.UnionType,
      () => encodeUnionType(node as ts.UnionTypeNode),
    )
    .with(
      ts.SyntaxKind.ParenthesizedType,
      () => encodeType((node as ts.ParenthesizedTypeNode).type),
    )
    .with(
      ts.SyntaxKind.IntersectionType,
      () => encodeIntersectionType(node as ts.IntersectionTypeNode),
    )
    .with(
      ts.SyntaxKind.TypeReference,
      () => encodeTypeReference(node as ts.TypeReferenceNode),
    )
    .otherwise(() => [Op.LITERAL, "/*unsupported*/"]);
}

// Helper functions for complex encoding cases (extracted for clarity)

function encodeLiteralType(node: ts.LiteralTypeNode): Bytecode {
  const lit = node.literal;
  if (ts.isNumericLiteral(lit)) return enc.lit(Number(lit.text));
  if (ts.isStringLiteral(lit)) return enc.lit(lit.text);
  if (lit.kind === ts.SyntaxKind.TrueKeyword) return enc.lit(true);
  if (lit.kind === ts.SyntaxKind.FalseKeyword) return enc.lit(false);
  return enc.lit(String(lit.getText()));
}

function encodeTupleType(node: ts.TupleTypeNode): Bytecode {
  const elts = node.elements.map(encodeType);
  return enc.tup(...elts);
}

function encodeTypeLiteral(node: ts.TypeLiteralNode): Bytecode {
  const props = node.members
    .filter((m): m is ts.PropertySignature =>
      ts.isPropertySignature(m) && !!m.type && !!m.name
    )
    .map((m) => ({
      name: getPropName(m.name!),
      type: encodeType(m.type!),
      optional: !!m.questionToken,
    }));
  return enc.obj(props);
}

function encodeUnionType(node: ts.UnionTypeNode): Bytecode {
  // Try discriminated union optimization first
  const dunion = tryEncodeDiscriminatedUnion(node);
  if (dunion) return dunion;
  // Fall back to regular union
  return enc.union(...node.types.map(encodeType));
}

function encodeIntersectionType(node: ts.IntersectionTypeNode): Bytecode {
  // Try brand pattern detection
  const branded = tryEncodeBrand(node);
  if (branded) return branded.bc;
  // In Iteration-1, other intersections are not supported by gate/policy
  return [Op.LITERAL, "/*unsupported intersection*/"];
}

function encodeTypeReference(node: ts.TypeReferenceNode): Bytecode {
  // Strict Iteration-1: treat unknown references as literal markers to keep emit deterministic
  const name = ts.isIdentifier(node.typeName)
    ? node.typeName.text
    : node.typeName.getText();
  return [Op.LITERAL, name];
}
