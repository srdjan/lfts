// examples/08-pattern-matching/src/types.ts

export type Expr =
  | { readonly type: "const"; readonly value: number }
  | { readonly type: "add"; readonly left: Expr; readonly right: Expr }
  | { readonly type: "mul"; readonly left: Expr; readonly right: Expr };
