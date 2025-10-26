// KNOWN LIMITATION: This test currently fails to trigger LFP1007
// The exhaustive-match rule doesn't work due to ctx.checker.typeToTypeNode() unreliability
// See KNOWN_ISSUES.md for details
import { match } from "../../../../packages/lfp-type-runtime/mod.ts";

type Add = { type: "add"; x: number; y: number };
type Mul = { type: "mul"; x: number; y: number };
type Expr = Add | Mul;

const evalExpr = (e: Expr): number =>
  match(e, {
    add: v => v.x + v.y, // missing 'mul' - should trigger LFP1007 but doesn't
  });
