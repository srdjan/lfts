// packages/lfts-type-compiler/src/transform/schema-root-rewriter.ts
import ts from "npm:typescript";
import { encodeType } from "./type-encoder.ts";

export function schemaRootRewriter(
  program: ts.Program,
  checker: ts.TypeChecker,
) {
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
          if (
            !stmt.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
          ) continue;
          const name = stmt.name.text;
          if (!name.endsWith("Schema")) continue;
          const baseName = name.substring(0, name.length - "Schema".length);
          const T = stmt.type;

          // For `export type UserSchema = User`, T is a type reference to User
          // We need to resolve it, but encodeType will handle that with the checker
          const bc = encodeType(T, checker);

          // Recursively convert bytecode to AST array literal
          function bytecodeToAst(value: any): ts.Expression {
            if (Array.isArray(value)) {
              return factory.createArrayLiteralExpression(
                value.map(bytecodeToAst),
                false
              );
            } else if (typeof value === "string") {
              return factory.createStringLiteral(value);
            } else if (typeof value === "number") {
              return factory.createNumericLiteral(String(value));
            } else if (typeof value === "boolean") {
              return value ? factory.createTrue() : factory.createFalse();
            } else {
              // Fallback for other types
              return factory.createStringLiteral(String(value));
            }
          }

          const arr = bytecodeToAst(bc) as ts.ArrayLiteralExpression;
          const constDecl = factory.createVariableStatement(
            [factory.createModifier(ts.SyntaxKind.ExportKeyword)],
            factory.createVariableDeclarationList([
              factory.createVariableDeclaration(
                factory.createIdentifier(baseName + "$"),
                undefined,
                undefined,
                arr,
              ),
            ], ts.NodeFlags.Const),
          );
          additions.push(constDecl);
        }
        if (additions.length > 0) {
          return factory.updateSourceFile(node, [
            ...node.statements,
            ...additions,
          ]);
        }
      }

      return ts.visitEachChild(node, visit, ctx);
    };
    return (sf: ts.SourceFile) => ts.visitNode(sf, visit);
  };
}
