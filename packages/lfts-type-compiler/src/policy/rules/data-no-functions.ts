// packages/lfts-type-compiler/src/policy/rules/data-no-functions.ts
import ts from "npm:typescript";
import { isTypeOfCall, Rule } from "../context.ts";

export const dataNoFunctionsRule: Rule = {
  meta: {
    id: "LFP1003",
    name: "data-no-functions",
    defaultSeverity: "error",
    defaultOptions: {},
    description: "Data schemas must not contain function-typed fields.",
  },
  analyzeUsage(node, ctx) {
    if (!isTypeOfCall(node)) return;
    const T = ctx.checker.getTypeFromTypeNode(node.typeArguments![0]);
    const stack: ts.Type[] = [T];

    while (stack.length) {
      const t = stack.pop()!;

      // Only check explicitly declared properties, not inherited ones from built-in types
      for (const p of t.getProperties()) {
        const propName = p.getName();

        // Skip if this property is from a built-in type (Object, String, Number, etc.)
        const declarations = p.getDeclarations();
        if (!declarations || declarations.length === 0) {
          // No declarations means it's a built-in property, skip it
          continue;
        }

        // Check if any declaration is from a lib.d.ts file (built-in types)
        const isBuiltin = declarations.some((decl) => {
          const sourceFile = decl.getSourceFile();
          return sourceFile.fileName.includes("lib.") &&
            sourceFile.fileName.endsWith(".d.ts");
        });

        if (isBuiltin) {
          continue;
        }

        const pT = ctx.checker.getTypeOfSymbolAtLocation(p, node);
        if (pT.getCallSignatures().length > 0) {
          ctx.report(
            node,
            `LFP1003: Data schema contains function property '${propName}'. Move behavior into a capability interface.`,
          );
          return;
        }
        stack.push(pT);
      }
      for (const u of (t as any).types ?? []) stack.push(u);
    }
  },
};
