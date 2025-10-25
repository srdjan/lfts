// LFP1015: Enforce canonical forms in schemas (arrays, readonly arrays, Readonly<...>, boolean unions).
import ts from "npm:typescript";
import { Rule, isTypeOfCall } from "../context.ts";

export const schemaCanonicalFormsRule: Rule = {
  meta: {
    id: "LFP1015",
    name: "schema-canonical-forms",
    defaultSeverity: "error",
    defaultOptions: {},
    description: "Use canonical syntax in schemas: T[] not Array<T>, readonly T[] not ReadonlyArray<T>, no Readonly<...>, && use boolean instead of 'true'|'false'.",
  },
  analyzeUsage(node, ctx) {
    if (!isTypeOfCall(node)) return;
    const T = node.typeArguments![0];
    function walk(n: ts.Node) {
      if (ts.isTypeReferenceNode(n) && ts.isIdentifier(n.typeName)) {
        const name = n.typeName.text;
        if (name === "Array" || name === "ReadonlyArray") {
          ctx.report(n, `LFP1015: Use ${name === "Array" ? "T[]" : "readonly T[]"} instead of ${name}<T>.\nQuick fix: rewrite to ${name === "Array" ? "T[]" : "readonly T[]"}.`);
        }
        if (name === "Readonly") {
          ctx.report(n, "LFP1015: Use `readonly` property/tuple/array modifiers instead of `Readonly<...>`.\nQuick fix: apply `readonly` to the property/tuple/array type.");
        }
        if (name === "Record") {
          ctx.report(n, "LFP1015: Index signatures/Record are not part of the minimal subset (Iteration-1).\nQuick fix: refactor to an explicit object type or a union keyed on `type`.");
        }
      }
      if (ts.isUnionTypeNode(n)) {
        // boolean literal unions like 'true'|'false'
        const lits = n.types.filter(t => ts.isLiteralTypeNode(t) && (t.literal.kind === ts.SyntaxKind.TrueKeyword || t.literal.kind === ts.SyntaxKind.FalseKeyword))
        if (lits.length === n.types.length && n.types.length === 2) {
          ctx.report(n, "LFP1015: Use `boolean` instead of `'true' | 'false'`.\nQuick fix: replace with `boolean`.");
        }
      }
      ts.forEachChild(n, walk);
    }
    walk(T);
  }
};
