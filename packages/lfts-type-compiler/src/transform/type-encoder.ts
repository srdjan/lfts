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
 * Annotation detection and encoding for prebuilt annotation types.
 * Returns: { name: string, args?: any[] } for recognized annotations, null otherwise
 */
type Annotation =
  | { name: "nominal" }
  | { name: "email" }
  | { name: "url" }
  | { name: "pattern"; arg: string }
  | { name: "minLength"; arg: number }
  | { name: "maxLength"; arg: number }
  | { name: "min"; arg: number }
  | { name: "max"; arg: number }
  | { name: "range"; min: number; max: number };

function detectAnnotation(t: ts.TypeNode): Annotation | null {
  if (!ts.isTypeReferenceNode(t)) return null;
  if (!ts.isIdentifier(t.typeName)) return null;

  const name = t.typeName.text;

  // No-argument annotations
  if (name === "Nominal") return { name: "nominal" };
  if (name === "Email") return { name: "email" };
  if (name === "Url") return { name: "url" };

  // Single-argument annotations
  if (name === "Pattern" || name === "MinLength" || name === "MaxLength" ||
      name === "Min" || name === "Max") {
    const typeArg = t.typeArguments?.[0];
    if (!typeArg) return null;

    if (ts.isLiteralTypeNode(typeArg)) {
      if (ts.isStringLiteral(typeArg.literal)) {
        const value = typeArg.literal.text;
        if (name === "Pattern") return { name: "pattern", arg: value };
      }
      if (ts.isNumericLiteral(typeArg.literal)) {
        const value = Number(typeArg.literal.text);
        if (name === "MinLength") return { name: "minLength", arg: value };
        if (name === "MaxLength") return { name: "maxLength", arg: value };
        if (name === "Min") return { name: "min", arg: value };
        if (name === "Max") return { name: "max", arg: value };
      }
    }
  }

  // Two-argument annotations (Range)
  if (name === "Range") {
    const minArg = t.typeArguments?.[0];
    const maxArg = t.typeArguments?.[1];
    if (minArg && maxArg && ts.isLiteralTypeNode(minArg) && ts.isLiteralTypeNode(maxArg)) {
      if (ts.isNumericLiteral(minArg.literal) && ts.isNumericLiteral(maxArg.literal)) {
        return {
          name: "range",
          min: Number(minArg.literal.text),
          max: Number(maxArg.literal.text)
        };
      }
    }
  }

  return null;
}

/**
 * Apply annotations to a base type by wrapping it with refinement bytecode.
 */
function applyAnnotations(baseType: Bytecode, annotations: Annotation[]): Bytecode {
  let result = baseType;

  for (const ann of annotations) {
    switch (ann.name) {
      case "nominal":
        // Nominal is compile-time only, no wrapping
        break;
      case "email":
        result = enc.refine.email(result);
        break;
      case "url":
        result = enc.refine.url(result);
        break;
      case "pattern":
        result = enc.refine.pattern(result, ann.arg);
        break;
      case "minLength":
        result = enc.refine.minLength(result, ann.arg);
        break;
      case "maxLength":
        result = enc.refine.maxLength(result, ann.arg);
        break;
      case "min":
        result = enc.refine.min(result, ann.arg);
        break;
      case "max":
        result = enc.refine.max(result, ann.arg);
        break;
      case "range":
        result = enc.refine.min(enc.refine.max(result, ann.max), ann.min);
        break;
    }
  }

  return result;
}

/**
 * Detect and encode brand patterns and refinement annotations in intersection types
 * Supports:
 *  1) Intersection: <Base> & { readonly __brand: "Tag" }
 *  2) Intersection: <Base> & Nominal (compile-time only)
 *  3) Intersection: <Base> & Email (runtime check)
 *  4) Intersection: <Base> & Min<0> & Max<100> (multiple refinements)
 *
 * @param node - Intersection type node
 * @returns Encoded bytecode if pattern detected, null otherwise
 */
export function tryEncodeBrand(
  node: ts.IntersectionTypeNode,
): { bc: Bytecode } | null {
  let baseType: ts.TypeNode | null = null;
  let brandTag: string | null = null;
  const annotations: Annotation[] = [];

  // Scan all intersection members
  for (const member of node.types) {
    // Check for annotation
    const ann = detectAnnotation(member);
    if (ann) {
      annotations.push(ann);
      continue;
    }

    // Check for structural brand pattern
    if (ts.isTypeLiteralNode(member)) {
      const brandMember = member.members.find((m): m is ts.PropertySignature =>
        ts.isPropertySignature(m) && (m.name as any)?.text === "__brand"
      );
      if (brandMember?.type && ts.isLiteralTypeNode(brandMember.type) &&
          ts.isStringLiteral(brandMember.type.literal)) {
        brandTag = brandMember.type.literal.text;
        continue;
      }
    }

    // Otherwise, this is the base type
    if (!baseType) {
      baseType = member;
    }
  }

  // Must have a base type
  if (!baseType) return null;

  // Encode base type
  let result = encodeType(baseType);

  // Apply brand if present
  if (brandTag) {
    result = enc.brand(result, brandTag);
  }

  // Apply refinement annotations
  result = applyAnnotations(result, annotations);

  return { bc: result };
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
