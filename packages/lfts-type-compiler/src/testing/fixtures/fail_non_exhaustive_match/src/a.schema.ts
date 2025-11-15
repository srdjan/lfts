// Test for LFP1007: Missing case detection in match()
// This test verifies that the exhaustive-match rule correctly identifies missing cases
import { match } from "../../../../packages/lfts-type-runtime/mod.ts";

type Add = { type: "add"; x: number; y: number };
type Mul = { type: "mul"; x: number; y: number };
type Expr = Add | Mul;

const evalExpr = (e: Expr): number =>
  match(e, {
    add: (v) => v.x + v.y, // missing 'mul' - triggers LFP1007 ✅
  });
