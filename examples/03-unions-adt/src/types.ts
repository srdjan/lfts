// examples/03-unions-adt/src/types.ts
// Demonstrates discriminated unions (ADTs) validated via bytecode.

export type Shape =
  | { readonly type: "circle"; readonly radius: number }
  | { readonly type: "square"; readonly size: number }
  | { readonly type: "rectangle"; readonly width: number; readonly height: number };

export type Scene = {
  readonly name: string;
  readonly shapes: readonly Shape[];
};
