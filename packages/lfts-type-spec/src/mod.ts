// packages/lfts-type-spec/src/mod.ts
// Minimal pruned bytecode spec with **nested** structure for unambiguous parsing.
export enum Op {
  // primitives & literals
  STRING,
  NUMBER,
  BOOLEAN,
  NULL,
  UNDEFINED,
  LITERAL,
  // composites
  ARRAY,
  TUPLE,
  OBJECT,
  PROPERTY,
  OPTIONAL,
  UNION,
  READONLY,
  // discriminated union
  DUNION,
  // branding
  BRAND,
  // refinements
  REFINE_MIN,
  REFINE_MAX,
  REFINE_INTEGER,
  REFINE_MIN_LENGTH,
  REFINE_MAX_LENGTH,
  REFINE_MIN_ITEMS,
  REFINE_MAX_ITEMS,
  REFINE_EMAIL,
  REFINE_URL,
  REFINE_PATTERN,
  // additional refinements (v0.8.0)
  REFINE_POSITIVE,
  REFINE_NEGATIVE,
  REFINE_NON_EMPTY,
  // result/option combinators (Phase 1)
  RESULT_OK,
  RESULT_ERR,
  OPTION_SOME,
  OPTION_NONE,
  // introspection metadata (Phase 1.2)
  METADATA,
  // effect types and ports (Phase 2)
  EFFECT,
  PORT,
  PORT_METHOD,
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
  tup: (
    ...elts: Bytecode[]
  ): Bytecode => [Op.TUPLE, elts.length, ...elts.map((e) => e)],
  obj: (
    props: { name: string; type: Bytecode; optional?: boolean }[],
    strict?: boolean,
  ): Bytecode => [
    Op.OBJECT,
    props.length,
    strict ? 1 : 0,
    ...props.flatMap((p) => [Op.PROPERTY, p.name, p.optional ? 1 : 0, p.type]),
  ],
  union: (...alts: Bytecode[]): Bytecode => [Op.UNION, alts.length, ...alts],
  dunion: (
    tagKey: string,
    variants: { tag: string; schema: Bytecode }[],
  ): Bytecode => [
    Op.DUNION,
    tagKey,
    variants.length,
    ...variants.flatMap((v) => [v.tag, v.schema]),
  ],
  ro: (t: Bytecode): Bytecode => [Op.READONLY, t],
  brand: (t: Bytecode, tag: string): Bytecode => [Op.BRAND, tag, t],

  // refinements
  refine: {
    min: (t: Bytecode, min: number): Bytecode => [Op.REFINE_MIN, min, t],
    max: (t: Bytecode, max: number): Bytecode => [Op.REFINE_MAX, max, t],
    integer: (t: Bytecode): Bytecode => [Op.REFINE_INTEGER, t],
    minLength: (
      t: Bytecode,
      len: number,
    ): Bytecode => [Op.REFINE_MIN_LENGTH, len, t],
    maxLength: (
      t: Bytecode,
      len: number,
    ): Bytecode => [Op.REFINE_MAX_LENGTH, len, t],
    minItems: (
      t: Bytecode,
      count: number,
    ): Bytecode => [Op.REFINE_MIN_ITEMS, count, t],
    maxItems: (
      t: Bytecode,
      count: number,
    ): Bytecode => [Op.REFINE_MAX_ITEMS, count, t],
    email: (t: Bytecode): Bytecode => [Op.REFINE_EMAIL, t],
    url: (t: Bytecode): Bytecode => [Op.REFINE_URL, t],
    pattern: (t: Bytecode, pattern: string): Bytecode => [Op.REFINE_PATTERN, pattern, t],
    // additional refinements (v0.8.0)
    positive: (t: Bytecode): Bytecode => [Op.REFINE_POSITIVE, t],
    negative: (t: Bytecode): Bytecode => [Op.REFINE_NEGATIVE, t],
    nonEmpty: (t: Bytecode): Bytecode => [Op.REFINE_NON_EMPTY, t],
  },

  // result/option combinators (Phase 1)
  result: {
    ok: (valueType: Bytecode): Bytecode => [Op.RESULT_OK, valueType],
    err: (errorType: Bytecode): Bytecode => [Op.RESULT_ERR, errorType],
  },
  option: {
    some: (valueType: Bytecode): Bytecode => [Op.OPTION_SOME, valueType],
    none: (): Bytecode => [Op.OPTION_NONE],
  },

  // introspection metadata (Phase 1.2)
  metadata: (
    schema: Bytecode,
    meta: { name?: string; source?: string },
  ): Bytecode => [Op.METADATA, meta, schema],

  // effect types and ports (Phase 2)
  effect: (
    effectType: string,
    returnType: Bytecode,
  ): Bytecode => [Op.EFFECT, effectType, returnType],

  port: (
    portName: string,
    methods: { name: string; params: Bytecode[]; returnType: Bytecode }[],
  ): Bytecode => [
    Op.PORT,
    portName,
    methods.length,
    ...methods.flatMap((m) => [
      Op.PORT_METHOD,
      m.name,
      m.params.length,
      ...m.params,
      m.returnType,
    ]),
  ],
};
