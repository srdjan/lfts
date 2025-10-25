
// packages/lfp-type-compiler/src/transform/typeOf-rewriter.ts
import ts from "npm:typescript";
import { Op, enc } from "../../lfp-type-spec/src/mod.ts";

function getPropName(name: ts.PropertyName): string {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text;
  // computed names are disallowed in Iteration-1 gate, fallback:
  return String((name as any).text ?? "???");
}

// Detect brand patterns:
//  1) Intersection: <Base> & { readonly __brand: "Tag" }
//  2) Intersection: <Base> & Brand<"Tag">

function tryEncodeBrand(node: ts.IntersectionTypeNode): { bc: any[] } | null {
  if (node.types.length != 2) return null;
  const [a, b] = node.types;
  const isStructuralBrand = (t: ts.TypeNode): string | null => {
    if (ts.isTypeLiteralNode(t)) {
      const member = t.members.find(m => ts.isPropertySignature(m) && (m.name as any)?.text === "__brand");
      if (member && member.type && ts.isLiteralTypeNode(member.type) && ts.isStringLiteral(member.type.literal)) {
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
function encodeType(node: ts.TypeNode): any[] {
  switch (node.kind) {
    case ts.SyntaxKind.NumberKeyword: return enc.num();
    case ts.SyntaxKind.StringKeyword: return enc.str();
    case ts.SyntaxKind.BooleanKeyword: return enc.bool();
    case ts.SyntaxKind.NullKeyword: return enc.nul();
    case ts.SyntaxKind.UndefinedKeyword: return enc.und();

    case ts.SyntaxKind.LiteralType: {
      const lit = (node as ts.LiteralTypeNode).literal;
      if (ts.isNumericLiteral(lit)) return enc.lit(Number(lit.text));
      if (ts.isStringLiteral(lit)) return enc.lit(lit.text);
      if (lit.kind === ts.SyntaxKind.TrueKeyword) return enc.lit(true);
      if (lit.kind === ts.SyntaxKind.FalseKeyword) return enc.lit(false);
      return enc.lit(String(lit.getText()));
    }

    case ts.SyntaxKind.ArrayType:
      return enc.arr(encodeType((node as ts.ArrayTypeNode).elementType));

    case ts.SyntaxKind.TupleType: {
      const elts = (node as ts.TupleTypeNode).elements.map(encodeType);
      return enc.tup(...elts);
    }

    case ts.SyntaxKind.TypeLiteral: {
      const tl = node as ts.TypeLiteralNode;
      const props = tl.members
        .filter((m): m is ts.PropertySignature => ts.isPropertySignature(m) && !!m.type && !!m.name)
        .map(m => ({
          name: getPropName(m.name!),
          type: encodeType(m.type!),
          optional: !!m.questionToken,
        }));
      return enc.obj(props);
    }

    case ts.SyntaxKind.UnionType:
      return enc.union(...(node as ts.UnionTypeNode).types.map(encodeType));

    case ts.SyntaxKind.ParenthesizedType:
      return encodeType((node as ts.ParenthesizedTypeNode).type);

    case ts.SyntaxKind.IntersectionType: {
      const branded = tryEncodeBrand(node as ts.IntersectionTypeNode);
      if (branded) return branded.bc;
      // In Iteration-1, other intersections are not supported by gate/policy.
      return [Op.LITERAL, "/*unsupported intersection*/"];
    }

    case ts.SyntaxKind.TypeReference: {
      // Strict Iteration-1: treat unknown references as literal markers to keep emit deterministic.
      const tr = node as ts.TypeReferenceNode;
      const name = ts.isIdentifier(tr.typeName) ? tr.typeName.text : tr.typeName.getText();
      return [Op.LITERAL, name];
    }

    default:
      return [Op.LITERAL, "/*unsupported*/"];
  }
}

export function typeOfRewriter(program: ts.Program, checker: ts.TypeChecker) {
  const factory = ts.factory;
  return (ctx: ts.TransformationContext) => {
    const visit: ts.Visitor = (node) => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "typeOf" && node.typeArguments?.length === 1) {
        const T = node.typeArguments[0];
        const bc = encodeType(T);
        const arr = factory.createArrayLiteralExpression(
          bc.map(v => typeof v === "string" ? factory.createStringLiteral(v) : factory.createNumericLiteral(String(v))),
          false
        );
        return arr;
      }
      return ts.visitEachChild(node, visit, ctx);
    };
    return (sf: ts.SourceFile) => ts.visitNode(sf, visit);
  };
}
