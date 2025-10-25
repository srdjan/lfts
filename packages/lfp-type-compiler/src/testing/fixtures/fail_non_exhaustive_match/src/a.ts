import { match } from "../../../../packages/lfp-type-runtime/mod.ts";

type Add = { type: "add"; x: number; y: number };
type Mul = { type: "mul"; x: number; y: number };
type Expr = Add | Mul;

const evalExpr = (e: Expr): number =>
  match(e, {
    add: v => v.x + v.y, // missing 'mul'
  });
