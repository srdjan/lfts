// packages/lfp-type-compiler/src/transform/typeOf-rewriter.ts
import ts from "npm:typescript";
import { encodeType } from "./type-encoder.ts";

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
