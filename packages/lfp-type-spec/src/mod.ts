
// packages/lfp-type-spec/src/mod.ts
// Minimal pruned bytecode spec with **nested** structure for unambiguous parsing.
export enum Op {
  // primitives & literals
  STRING, NUMBER, BOOLEAN, NULL, UNDEFINED, LITERAL,
  // composites
  ARRAY, TUPLE, OBJECT, PROPERTY, OPTIONAL,
  UNION, READONLY,
  // discriminated union
  DUNION,
  // branding
  BRAND,
  // refinements
  REFINE_MIN, REFINE_MAX, REFINE_INTEGER,
  REFINE_MIN_LENGTH, REFINE_MAX_LENGTH,
  REFINE_MIN_ITEMS, REFINE_MAX_ITEMS,
}

export type Bytecode = any[]; // nested tuples/arrays

export const enc = {
  str: (): Bytecode => [Op.STRING],
  num: (): Bytecode => [Op.NUMBER],
  bool: (): Bytecode => [Op.BOOLEAN],
  nul: (): Bytecode => [Op.NULL],
  und: (): Bytecode => [Op.UNDEFINED],
  lit: (v: string | number | boolean): Bytecode => [Op.LITERAL, v],

  // Nested payload
  arr: (t: Bytecode): Bytecode => [Op.ARRAY, t],
  tup: (...elts: Bytecode[]): Bytecode => [Op.TUPLE, elts.length, ...elts.map(e => e)],
  obj: (props: { name: string; type: Bytecode; optional?: boolean }[], strict?: boolean): Bytecode => [
    Op.OBJECT, props.length, strict ? 1 : 0, ...props.flatMap(p => [Op.PROPERTY, p.name, p.optional ? 1 : 0, p.type]),
  ],
  union: (...alts: Bytecode[]): Bytecode => [Op.UNION, alts.length, ...alts],
  dunion: (tagKey: string, variants: { tag: string; schema: Bytecode }[]): Bytecode => [
    Op.DUNION,
    tagKey,
    variants.length,
    ...variants.flatMap(v => [v.tag, v.schema]),
  ],
  ro: (t: Bytecode): Bytecode => [Op.READONLY, t],
  brand: (t: Bytecode, tag: string): Bytecode => [Op.BRAND, tag, t],

  // refinements
  refine: {
    min: (t: Bytecode, min: number): Bytecode => [Op.REFINE_MIN, min, t],
    max: (t: Bytecode, max: number): Bytecode => [Op.REFINE_MAX, max, t],
    integer: (t: Bytecode): Bytecode => [Op.REFINE_INTEGER, t],
    minLength: (t: Bytecode, len: number): Bytecode => [Op.REFINE_MIN_LENGTH, len, t],
    maxLength: (t: Bytecode, len: number): Bytecode => [Op.REFINE_MAX_LENGTH, len, t],
    minItems: (t: Bytecode, count: number): Bytecode => [Op.REFINE_MIN_ITEMS, count, t],
    maxItems: (t: Bytecode, count: number): Bytecode => [Op.REFINE_MAX_ITEMS, count, t],
  },
};
