
// packages/lfp-type-compiler/src/transform/schema-root-rewriter.ts
import ts from "npm:typescript";
import { Op, enc } from "../../lfp-type-spec/src/mod.ts";

// Reuse helpers from typeOf-rewriter for encoding
function getPropName(name: ts.PropertyName): string {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text;
  return String((name as any).text ?? "???");
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
    case ts.SyntaxKind.TypeReference: {
      const tr = node as ts.TypeReferenceNode;
      const name = ts.isIdentifier(tr.typeName) ? tr.typeName.text : tr.typeName.getText();
      return [Op.LITERAL, name];
    }
    default:
      return [Op.LITERAL, "/*unsupported*/"];
  }
}

export function schemaRootRewriter(program: ts.Program, checker: ts.TypeChecker) {
  const factory = ts.factory;
  return (ctx: ts.TransformationContext) => {
    const visit: ts.Visitor = (node) => {
      // only operate on *.schema.ts files
      const sf = node.getSourceFile();
      if (!sf.fileName.endsWith(".schema.ts")) {
        return ts.visitEachChild(node, visit, ctx);
      }

      // For each exported type alias `export type NameSchema = T;`, append `export const Name$ = <bc>`
      if (ts.isSourceFile(node)) {
        const additions: ts.Statement[] = [];
        for (const stmt of node.statements) {
          if (!ts.isTypeAliasDeclaration(stmt)) continue;
          if (!stmt.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) continue;
          const name = stmt.name.text;
          if (!name.endsWith("Schema")) continue;
          const baseName = name.substring(0, name.length - "Schema".length);
          const T = stmt.type;
          const bc = encodeType(T);

          // Encode bc as array literal expression
          const arr = factory.createArrayLiteralExpression(
            bc.map(v => typeof v === "string" ? factory.createStringLiteral(v) : factory.createNumericLiteral(String(v))),
            false
          );
          const constDecl = factory.createVariableStatement(
            [factory.createModifier(ts.SyntaxKind.ExportKeyword)],
            factory.createVariableDeclarationList([
              factory.createVariableDeclaration(
                factory.createIdentifier(baseName + "$"),
                undefined,
                undefined,
                arr
              )
            ], ts.NodeFlags.Const)
          );
          additions.push(constDecl);
        }
        if (additions.length > 0) {
          return factory.updateSourceFile(node, [...node.statements, ...additions]);
        }
      }

      return ts.visitEachChild(node, visit, ctx);
    };
    return (sf: ts.SourceFile) => ts.visitNode(sf, visit);
  };
}
