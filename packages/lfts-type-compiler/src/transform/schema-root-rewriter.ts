// packages/lfts-type-compiler/src/transform/schema-root-rewriter.ts
import ts from "npm:typescript";
import { encodeType } from "./type-encoder.ts";

/**
 * Transform schema-root pattern in *.schema.ts files.
 *
 * Before: export type UserSchema = User;
 * After:  export type UserSchema = User;
 *         export const User$ = createTypeObject([bytecode], { name: "User", source: "file.ts" });
 */
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

      // For each exported type alias `export type NameSchema = T;`,
      // append `export const Name$ = createTypeObject(bytecode, metadata)`
      if (ts.isSourceFile(node)) {
        const additions: ts.Statement[] = [];
        let needsImport = false;

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
            } else if (typeof value === "object" && value !== null) {
              // Handle metadata objects
              const props = Object.entries(value).map(([key, val]) =>
                factory.createPropertyAssignment(
                  key,
                  bytecodeToAst(val)
                )
              );
              return factory.createObjectLiteralExpression(props, false);
            } else {
              // Fallback for other types
              return factory.createStringLiteral(String(value));
            }
          }

          const bytecodeArray = bytecodeToAst(bc) as ts.ArrayLiteralExpression;

          // Build metadata object
          const metadataObject = factory.createObjectLiteralExpression([
            factory.createPropertyAssignment(
              "name",
              factory.createStringLiteral(baseName)
            ),
            factory.createPropertyAssignment(
              "source",
              factory.createStringLiteral(sf.fileName)
            ),
          ], false);

          // Create: createTypeObject(bytecode, metadata)
          const createTypeObjectCall = factory.createCallExpression(
            factory.createIdentifier("createTypeObject"),
            undefined,
            [bytecodeArray, metadataObject]
          );

          // Create: export const Name$ = createTypeObject(...)
          const constDecl = factory.createVariableStatement(
            [factory.createModifier(ts.SyntaxKind.ExportKeyword)],
            factory.createVariableDeclarationList([
              factory.createVariableDeclaration(
                factory.createIdentifier(baseName + "$"),
                undefined,
                undefined,
                createTypeObjectCall,
              ),
            ], ts.NodeFlags.Const),
          );
          additions.push(constDecl);
          needsImport = true;
        }

        if (additions.length > 0) {
          // Add import statement for createTypeObject
          const importDecl = factory.createImportDeclaration(
            undefined,
            factory.createImportClause(
              false,
              undefined,
              factory.createNamedImports([
                factory.createImportSpecifier(
                  false,
                  undefined,
                  factory.createIdentifier("createTypeObject")
                )
              ])
            ),
            factory.createStringLiteral("../../packages/lfts-type-runtime/mod.ts"),
            undefined
          );

          return factory.updateSourceFile(node, [
            importDecl,
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
