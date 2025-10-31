// packages/lfts-type-spec/src/mod.ts
// Minimal pruned bytecode spec with **nested** structure for unambiguous parsing.
export var Op;
(function (Op) {
    // primitives & literals
    Op[Op["STRING"] = 0] = "STRING";
    Op[Op["NUMBER"] = 1] = "NUMBER";
    Op[Op["BOOLEAN"] = 2] = "BOOLEAN";
    Op[Op["NULL"] = 3] = "NULL";
    Op[Op["UNDEFINED"] = 4] = "UNDEFINED";
    Op[Op["LITERAL"] = 5] = "LITERAL";
    // composites
    Op[Op["ARRAY"] = 6] = "ARRAY";
    Op[Op["TUPLE"] = 7] = "TUPLE";
    Op[Op["OBJECT"] = 8] = "OBJECT";
    Op[Op["PROPERTY"] = 9] = "PROPERTY";
    Op[Op["OPTIONAL"] = 10] = "OPTIONAL";
    Op[Op["UNION"] = 11] = "UNION";
    Op[Op["READONLY"] = 12] = "READONLY";
    // discriminated union
    Op[Op["DUNION"] = 13] = "DUNION";
    // branding
    Op[Op["BRAND"] = 14] = "BRAND";
    // refinements
    Op[Op["REFINE_MIN"] = 15] = "REFINE_MIN";
    Op[Op["REFINE_MAX"] = 16] = "REFINE_MAX";
    Op[Op["REFINE_INTEGER"] = 17] = "REFINE_INTEGER";
    Op[Op["REFINE_MIN_LENGTH"] = 18] = "REFINE_MIN_LENGTH";
    Op[Op["REFINE_MAX_LENGTH"] = 19] = "REFINE_MAX_LENGTH";
    Op[Op["REFINE_MIN_ITEMS"] = 20] = "REFINE_MIN_ITEMS";
    Op[Op["REFINE_MAX_ITEMS"] = 21] = "REFINE_MAX_ITEMS";
    Op[Op["REFINE_EMAIL"] = 22] = "REFINE_EMAIL";
    Op[Op["REFINE_URL"] = 23] = "REFINE_URL";
    Op[Op["REFINE_PATTERN"] = 24] = "REFINE_PATTERN";
    // result/option combinators (Phase 1)
    Op[Op["RESULT_OK"] = 25] = "RESULT_OK";
    Op[Op["RESULT_ERR"] = 26] = "RESULT_ERR";
    Op[Op["OPTION_SOME"] = 27] = "OPTION_SOME";
    Op[Op["OPTION_NONE"] = 28] = "OPTION_NONE";
    // introspection metadata (Phase 1.2)
    Op[Op["METADATA"] = 29] = "METADATA";
    // effect types and ports (Phase 2)
    Op[Op["EFFECT"] = 30] = "EFFECT";
    Op[Op["PORT"] = 31] = "PORT";
    Op[Op["PORT_METHOD"] = 32] = "PORT_METHOD";
})(Op || (Op = {}));
export const enc = {
    str: () => [Op.STRING],
    num: () => [Op.NUMBER],
    bool: () => [Op.BOOLEAN],
    nul: () => [Op.NULL],
    und: () => [Op.UNDEFINED],
    lit: (v) => [Op.LITERAL, v],
    // Nested payload
    arr: (t) => [Op.ARRAY, t],
    tup: (...elts) => [Op.TUPLE, elts.length, ...elts.map((e) => e)],
    obj: (props, strict) => [
        Op.OBJECT,
        props.length,
        strict ? 1 : 0,
        ...props.flatMap((p) => [Op.PROPERTY, p.name, p.optional ? 1 : 0, p.type]),
    ],
    union: (...alts) => [Op.UNION, alts.length, ...alts],
    dunion: (tagKey, variants) => [
        Op.DUNION,
        tagKey,
        variants.length,
        ...variants.flatMap((v) => [v.tag, v.schema]),
    ],
    ro: (t) => [Op.READONLY, t],
    brand: (t, tag) => [Op.BRAND, tag, t],
    // refinements
    refine: {
        min: (t, min) => [Op.REFINE_MIN, min, t],
        max: (t, max) => [Op.REFINE_MAX, max, t],
        integer: (t) => [Op.REFINE_INTEGER, t],
        minLength: (t, len) => [Op.REFINE_MIN_LENGTH, len, t],
        maxLength: (t, len) => [Op.REFINE_MAX_LENGTH, len, t],
        minItems: (t, count) => [Op.REFINE_MIN_ITEMS, count, t],
        maxItems: (t, count) => [Op.REFINE_MAX_ITEMS, count, t],
        email: (t) => [Op.REFINE_EMAIL, t],
        url: (t) => [Op.REFINE_URL, t],
        pattern: (t, pattern) => [Op.REFINE_PATTERN, pattern, t],
    },
    // result/option combinators (Phase 1)
    result: {
        ok: (valueType) => [Op.RESULT_OK, valueType],
        err: (errorType) => [Op.RESULT_ERR, errorType],
    },
    option: {
        some: (valueType) => [Op.OPTION_SOME, valueType],
        none: () => [Op.OPTION_NONE],
    },
    // introspection metadata (Phase 1.2)
    metadata: (schema, meta) => [Op.METADATA, meta, schema],
    // effect types and ports (Phase 2)
    effect: (effectType, returnType) => [Op.EFFECT, effectType, returnType],
    port: (portName, methods) => [
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
