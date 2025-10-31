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

function tryEncodeBrand(
  node: ts.IntersectionTypeNode,
  encode: (n: ts.TypeNode) => Bytecode,
): Bytecode | null {
  let baseType: ts.TypeNode | null = null;
  let brandTag: string | null = null;
  const annotations: Annotation[] = [];

  for (const member of node.types) {
    const ann = detectAnnotation(member);
    if (ann) {
      annotations.push(ann);
      continue;
    }

    if (ts.isTypeLiteralNode(member)) {
      const brandMember = member.members.find((m): m is ts.PropertySignature =>
        ts.isPropertySignature(m) && (m.name as any)?.text === "__brand"
      );
      if (
        brandMember?.type && ts.isLiteralTypeNode(brandMember.type) &&
        ts.isStringLiteral(brandMember.type.literal)
      ) {
        brandTag = brandMember.type.literal.text;
        continue;
      }
    }

    if (!baseType) {
      baseType = member;
    }
  }

  if (!baseType) return null;

  let result = encode(baseType);

  if (brandTag) {
    result = enc.brand(result, brandTag);
  }

  result = applyAnnotations(result, annotations);

  return result;
}

function tryEncodeDiscriminatedUnion(
  node: ts.UnionTypeNode,
  encode: (n: ts.TypeNode) => Bytecode,
): Bytecode | null {
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

    if (seenTags.has(variantTag)) return null;
    seenTags.add(variantTag);

    variants.push({ tag: variantTag, schema: encode(member) });
  }

  if (!tagKey) return null;

  return enc.dunion(tagKey, variants);
}

export class EncodingError extends Error {
  constructor(public readonly node: ts.Node, message: string) {
    super(message);
    this.name = "EncodingError";
  }
}

export function encodeType(node: ts.TypeNode, checker: ts.TypeChecker): Bytecode {
  const visitingAliases = new Set<ts.TypeAliasDeclaration>();

  return encode(node);

  function encode(current: ts.TypeNode): Bytecode {
    return patternMatch<ts.SyntaxKind, Bytecode>(current.kind)
      .with(ts.SyntaxKind.NumberKeyword, () => enc.num())
      .with(ts.SyntaxKind.StringKeyword, () => enc.str())
      .with(ts.SyntaxKind.BooleanKeyword, () => enc.bool())
      .with(ts.SyntaxKind.NullKeyword, () => enc.nul())
      .with(ts.SyntaxKind.UndefinedKeyword, () => enc.und())
      .with(ts.SyntaxKind.LiteralType, () => encodeLiteral(current as ts.LiteralTypeNode))
      .with(ts.SyntaxKind.ArrayType, () => encodeArray(current as ts.ArrayTypeNode))
      .with(ts.SyntaxKind.TupleType, () => encodeTuple(current as ts.TupleTypeNode))
      .with(ts.SyntaxKind.TypeLiteral, () => encodeTypeLiteral(current as ts.TypeLiteralNode))
      .with(ts.SyntaxKind.UnionType, () => encodeUnion(current as ts.UnionTypeNode))
      .with(ts.SyntaxKind.ParenthesizedType, () => encode((current as ts.ParenthesizedTypeNode).type))
      .with(ts.SyntaxKind.IntersectionType, () => encodeIntersection(current as ts.IntersectionTypeNode))
      .with(ts.SyntaxKind.TypeReference, () => encodeTypeReference(current as ts.TypeReferenceNode))
      .otherwise(() => {
        throw new EncodingError(
          current,
          `Unsupported schema construct: ${ts.SyntaxKind[current.kind]}`,
        );
      });
  }

  function encodeLiteral(node: ts.LiteralTypeNode): Bytecode {
    const lit = node.literal;
    if (ts.isNumericLiteral(lit)) return enc.lit(Number(lit.text));
    if (ts.isStringLiteral(lit)) return enc.lit(lit.text);
    if (lit.kind === ts.SyntaxKind.TrueKeyword) return enc.lit(true);
    if (lit.kind === ts.SyntaxKind.FalseKeyword) return enc.lit(false);
    return enc.lit(String(lit.getText()));
  }

  function encodeArray(node: ts.ArrayTypeNode): Bytecode {
    return enc.arr(encode(node.elementType));
  }

  function encodeTuple(node: ts.TupleTypeNode): Bytecode {
    const elements = node.elements.map((elt) => {
      const inner = ts.isNamedTupleMember(elt) ? elt.type : elt;
      return encode(inner);
    });
    return enc.tup(...elements);
  }

  function encodeTypeLiteral(node: ts.TypeLiteralNode): Bytecode {
    const props = node.members
      .filter((m): m is ts.PropertySignature =>
        ts.isPropertySignature(m) && !!m.type && !!m.name
      )
      .map((m) => ({
        name: getPropName(m.name!),
        type: encode(m.type!),
        optional: !!m.questionToken,
      }));
    return enc.obj(props);
  }

  function encodeUnion(node: ts.UnionTypeNode): Bytecode {
    const dunion = tryEncodeDiscriminatedUnion(node, encode);
    if (dunion) return dunion;
    return enc.union(...node.types.map(encode));
  }

  function encodeIntersection(node: ts.IntersectionTypeNode): Bytecode {
    const branded = tryEncodeBrand(node, encode);
    if (branded) return branded;
    throw new EncodingError(
      node,
      "Only branding/refinement intersections are supported in schemas.",
    );
  }

  function encodeTypeReference(node: ts.TypeReferenceNode): Bytecode {
    if (!ts.isIdentifier(node.typeName)) {
      throw new EncodingError(
        node,
        "Qualified type names are not supported in schema encoding. Use local type aliases.",
      );
    }

    if (node.typeArguments && node.typeArguments.length > 0) {
      throw new EncodingError(
        node,
        `Generic type '${node.typeName.text}' is not supported in schema encoding.`,
      );
    }

    const symbol = checker.getSymbolAtLocation(node.typeName);
    if (!symbol) {
      throw new EncodingError(
        node,
        `Unresolved type reference '${node.typeName.text}'.`,
      );
    }

    const targetSymbol = (symbol.flags & ts.SymbolFlags.Alias)
      ? checker.getAliasedSymbol(symbol)
      : symbol;

    const aliasDecl = targetSymbol.declarations?.find(ts.isTypeAliasDeclaration);
    if (aliasDecl) {
      if (visitingAliases.has(aliasDecl)) {
        throw new EncodingError(
          node,
          `Recursive type alias '${node.typeName.text}' is not supported.`,
        );
      }
      visitingAliases.add(aliasDecl);
      const result = encode(aliasDecl.type);
      visitingAliases.delete(aliasDecl);
      return result;
    }

    const interfaceDecl = targetSymbol.declarations?.find(ts.isInterfaceDeclaration);
    if (interfaceDecl) {
      const props = interfaceDecl.members
        .filter((m): m is ts.PropertySignature =>
          ts.isPropertySignature(m) && !!m.type && !!m.name
        )
        .map((m) => ({
          name: getPropName(m.name),
          type: encode(m.type!),
          optional: !!m.questionToken,
        }));
      return enc.obj(props);
    }

    throw new EncodingError(
      node,
      `Unsupported type reference '${node.getText()}'. Only type aliases are supported in schemas.`,
    );
  }
}
