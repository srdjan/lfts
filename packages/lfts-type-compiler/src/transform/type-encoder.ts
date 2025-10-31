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

function tryEncodeDiscriminatedUnion(node: ts.UnionTypeNode, checker?: ts.TypeChecker): Bytecode | null {
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
    variants.push({ tag: tagValue, schema: encodeType(member, checker) });
  }

  if (!tagKey) return null;

  return enc.dunion(tagKey, variants);
}

/**
 * Encode a TypeScript type node into LFTS bytecode
 * Uses ts-pattern for cleaner pattern matching
 * @param node - TypeScript type node to encode
 * @param checker - Optional TypeChecker for resolving type references
 * @returns Bytecode array representation
 */
export function encodeType(node: ts.TypeNode, checker?: ts.TypeChecker): Bytecode {
  console.log(`DEBUG encodeType: kind=${ts.SyntaxKind[node.kind]}`);
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
      () => enc.arr(encodeType((node as ts.ArrayTypeNode).elementType, checker)),
    )
    .with(
      ts.SyntaxKind.TupleType,
      () => encodeTupleType(node as ts.TupleTypeNode, checker),
    )
    .with(
      ts.SyntaxKind.TypeLiteral,
      () => encodeTypeLiteral(node as ts.TypeLiteralNode, checker),
    )
    .with(
      ts.SyntaxKind.UnionType,
      () => encodeUnionType(node as ts.UnionTypeNode, checker),
    )
    .with(
      ts.SyntaxKind.ParenthesizedType,
      () => encodeType((node as ts.ParenthesizedTypeNode).type, checker),
    )
    .with(
      ts.SyntaxKind.IntersectionType,
      () => encodeIntersectionType(node as ts.IntersectionTypeNode, checker),
    )
    .with(
      ts.SyntaxKind.TypeReference,
      () => encodeTypeReference(node as ts.TypeReferenceNode, checker),
    )
    .with(
      ts.SyntaxKind.MappedType,
      () => encodeMappedType(node as ts.MappedTypeNode, checker),
    )
    .otherwise(() => {
      console.log(`DEBUG: Unsupported type kind: ${ts.SyntaxKind[node.kind]}`);
      return [Op.LITERAL, `/*unsupported: ${ts.SyntaxKind[node.kind]}*/`];
    });
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

function encodeTupleType(node: ts.TupleTypeNode, checker?: ts.TypeChecker): Bytecode {
  const elts = node.elements.map(e => encodeType(e, checker));
  return enc.tup(...elts);
}

function encodeTypeLiteral(node: ts.TypeLiteralNode, checker?: ts.TypeChecker): Bytecode {
  const props = node.members
    .filter((m): m is ts.PropertySignature =>
      ts.isPropertySignature(m) && !!m.type && !!m.name
    )
    .map((m) => ({
      name: getPropName(m.name!),
      type: encodeType(m.type!, checker),
      optional: !!m.questionToken,
    }));
  return enc.obj(props);
}

function encodeUnionType(node: ts.UnionTypeNode, checker?: ts.TypeChecker): Bytecode {
  // Try discriminated union optimization first
  const dunion = tryEncodeDiscriminatedUnion(node, checker);
  if (dunion) return dunion;
  // Fall back to regular union
  return enc.union(...node.types.map(t => encodeType(t, checker)));
}

function encodeIntersectionType(node: ts.IntersectionTypeNode, checker?: ts.TypeChecker): Bytecode {
  // Try brand pattern detection
  const branded = tryEncodeBrand(node);
  if (branded) return branded.bc;
  // In Iteration-1, other intersections are not supported by gate/policy
  return [Op.LITERAL, "/*unsupported intersection*/"];
}

function encodeMappedType(node: ts.MappedTypeNode, checker?: ts.TypeChecker): Bytecode {
  // For Readonly<{...}>, the constraint is 'keyof T' where T is the type we want
  // We can look at node.type to see what the mapped value type is
  // But easier: just use the TypeChecker to get the resolved type and its properties

  console.log(`DEBUG: encodeMappedType`);

  if (checker) {
    // Get the constraint (should be 'keyof T' for Readonly<T>)
    if (node.typeParameter && node.typeParameter.constraint) {
      const constraint = node.typeParameter.constraint;
      console.log(`DEBUG: constraint kind=${ts.SyntaxKind[constraint.kind]}`);

      // For 'keyof T', constraint is a TypeOperatorNode
      if (ts.isTypeOperatorNode(constraint) && constraint.operator === ts.SyntaxKind.KeyOfKeyword) {
        // constraint.type is T
        console.log(`DEBUG: Found keyof, inner type kind=${ts.SyntaxKind[constraint.type.kind]}`);
        // Encode the inner type (without the readonly wrapper)
        return encodeType(constraint.type, checker);
      }
    }
  }

  return [Op.LITERAL, "/*mapped type*/"];
}

function encodeTypeReference(node: ts.TypeReferenceNode, checker?: ts.TypeChecker): Bytecode {
  const name = ts.isIdentifier(node.typeName)
    ? node.typeName.text
    : node.typeName.getText();

  console.log(`DEBUG encodeTypeReference: name=${name}, hasChecker=${!!checker}, typeArgs=${node.typeArguments?.length}`);

  // Special handling for built-in utility types
  if (name === "Readonly" && node.typeArguments && node.typeArguments.length === 1) {
    console.log(`DEBUG: Unwrapping Readonly`);
    // In Light-FP, all types are readonly by default, so we just encode the inner type
    return encodeType(node.typeArguments[0], checker);
  }

  if (name === "ReadonlyArray" && node.typeArguments && node.typeArguments.length === 1) {
    console.log(`DEBUG: Unwrapping ReadonlyArray`);
    return enc.arr(encodeType(node.typeArguments[0], checker));
  }

  // If we have a checker, try to resolve the type reference
  if (checker) {
    const type = checker.getTypeAtLocation(node);
    console.log(`DEBUG: type=${type?.symbol?.name}, hasAlias=${!!type?.aliasSymbol}`);

    // Check if this is a type alias first (before looking at resolved type)
    if (type && type.aliasSymbol) {
      const aliasDecls = type.aliasSymbol.declarations;
      console.log(`DEBUG: alias declarations count=${aliasDecls?.length}`);

      if (aliasDecls && aliasDecls.length > 0 && ts.isTypeAliasDeclaration(aliasDecls[0])) {
        const aliasType = aliasDecls[0].type;
        console.log(`DEBUG: Resolving type alias ${name} from aliasSymbol, RHS kind=${ts.SyntaxKind[aliasType.kind]}`);

        // Special case: if the RHS is a MappedType (like Readonly<T>),
        // use the resolved type's properties instead
        if (ts.isMappedTypeNode(aliasType)) {
          console.log(`DEBUG: Alias RHS is MappedType, extracting properties from resolved type`);
          const props = type.getProperties();
          console.log(`DEBUG: Resolved type has ${props.length} properties`);

          if (props.length > 0) {
            const encoded = props.map(prop => {
              const propType = checker.getTypeOfSymbolAtLocation(prop, node);

              // Check if this property type is itself a type alias
              if (propType.aliasSymbol) {
                const aliasDecls = propType.aliasSymbol.declarations;
                if (aliasDecls && aliasDecls.length > 0 && ts.isTypeAliasDeclaration(aliasDecls[0])) {
                  // Encode the alias declaration's RHS
                  return {
                    name: prop.name,
                    type: encodeType(aliasDecls[0].type, checker),
                    optional: !!(prop.flags & ts.SymbolFlags.Optional),
                  };
                }
              }

              // Otherwise, try to convert to a type node
              const propTypeNode = checker.typeToTypeNode(propType, undefined, ts.NodeBuilderFlags.InTypeAlias);
              return {
                name: prop.name,
                type: propTypeNode ? encodeType(propTypeNode, checker) : enc.lit("unknown"),
                optional: !!(prop.flags & ts.SymbolFlags.Optional),
              };
            });
            return enc.obj(encoded);
          }
        }

        return encodeType(aliasType, checker);
      }
    }

    // Otherwise check the symbol
    if (type && type.symbol) {
      const decls = type.symbol.declarations;
      console.log(`DEBUG: symbol declarations count=${decls?.length}, kind=${decls?.[0] && ts.SyntaxKind[decls[0].kind]}`);

      if (decls && decls.length > 0) {
        const decl = decls[0];

        // If it's a type alias, encode its type
        if (ts.isTypeAliasDeclaration(decl) && decl.type) {
          console.log(`DEBUG: Resolving type alias ${name} from symbol`);
          return encodeType(decl.type, checker);
        }
        // If it's an interface, encode its members
        if (ts.isInterfaceDeclaration(decl)) {
          console.log(`DEBUG: Resolving interface ${name}`);
          // Convert interface members to type literal for encoding
          const members = decl.members.filter((m): m is ts.PropertySignature =>
            ts.isPropertySignature(m) && !!m.type && !!m.name
          );
          const props = members.map((m) => ({
            name: getPropName(m.name!),
            type: encodeType(m.type!, checker),
            optional: !!m.questionToken,
          }));
          return enc.obj(props);
        }
      }
    }
  }

  // Fallback: treat unknown references as literal markers to keep emit deterministic
  console.log(`DEBUG: Falling back to literal for ${name}`);
  return [Op.LITERAL, name];
}
