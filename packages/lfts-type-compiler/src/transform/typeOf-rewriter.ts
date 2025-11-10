// packages/lfts-type-compiler/src/transform/typeOf-rewriter.ts
import ts from "npm:typescript";
import { encodeType } from "./type-encoder.ts";

/**
 * Transform typeOf<T>() calls into createTypeObject(bytecode, metadata) calls.
 *
 * Before: typeOf<User>()
 * After:  createTypeObject([Op.OBJECT, ...], { name: "User", source: "file.ts" })
 */
export function typeOfRewriter(program: ts.Program, checker: ts.TypeChecker) {
  const factory = ts.factory;
  return (ctx: ts.TransformationContext) => {
    const visit: ts.Visitor = (node) => {
      if (
        ts.isCallExpression(node) && ts.isIdentifier(node.expression) &&
        node.expression.text === "typeOf" && node.typeArguments?.length === 1
      ) {
        const T = node.typeArguments[0];
        const bc = encodeType(T, checker);

        // Build bytecode array literal
        const bytecodeArray = factory.createArrayLiteralExpression(
          bc.map((v) =>
            typeof v === "string"
              ? factory.createStringLiteral(v)
              : typeof v === "number"
              ? factory.createNumericLiteral(String(v))
              : Array.isArray(v)
              ? bytecodeToAst(v)
              : factory.createStringLiteral(String(v))
          ),
          false,
        );

        // Extract type name for metadata (if available)
        let typeName: string | undefined;
        if (ts.isTypeReferenceNode(T) && ts.isIdentifier(T.typeName)) {
          typeName = T.typeName.text;
        }

        // Get source file name
        const sourceFile = node.getSourceFile();
        const fileName = sourceFile.fileName;

        // Build metadata object
        const metadataProps: ts.ObjectLiteralElementLike[] = [];
        if (typeName) {
          metadataProps.push(
            factory.createPropertyAssignment(
              "name",
              factory.createStringLiteral(typeName)
            )
          );
        }
        metadataProps.push(
          factory.createPropertyAssignment(
            "source",
            factory.createStringLiteral(fileName)
          )
        );

        const metadataObject = factory.createObjectLiteralExpression(
          metadataProps,
          false
        );

        // Create: createTypeObject(bytecode, metadata)
        const createTypeObjectCall = factory.createCallExpression(
          factory.createIdentifier("createTypeObject"),
          undefined,
          [bytecodeArray, metadataObject]
        );

        return createTypeObjectCall;
      }
      return ts.visitEachChild(node, visit, ctx);
    };

    // Helper to recursively convert bytecode to AST
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
        return factory.createStringLiteral(String(value));
      }
    }

    return (sf: ts.SourceFile) => ts.visitNode(sf, visit);
  };
}
