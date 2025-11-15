// Test for LFP1007: Extra case detection in match()
// This test verifies that the exhaustive-match rule correctly identifies extra cases
import { match } from "../../../../packages/lfts-type-runtime/mod.ts";

type Add = { type: "add"; x: number; y: number };
type Mul = { type: "mul"; x: number; y: number };
type Expr = Add | Mul;

const evalExpr = (e: Expr): number =>
  match(e, {
    add: (v) => v.x + v.y,
    mul: (v) => v.x * v.y,
    div: (v) => v.x / v.y, // extra case - triggers LFP1007 ✅
  });
