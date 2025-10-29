import { typeOf } from "../../../../packages/lfts-type-runtime/mod.ts";

export type Add = { type: "add"; x: number; y: number };
export type Mul = { type: "mul"; x: number; y: number };
export type Expr = Add | Mul;

export const Expr$ = typeOf<Expr>();
