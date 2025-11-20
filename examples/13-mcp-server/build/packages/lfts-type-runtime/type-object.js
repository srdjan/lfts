// packages/lfts-type-runtime/type-object.ts
// Type Object System: Reflection-first API wrapping bytecode
import { Op } from "../lfts-type-spec/src/mod.js";
import { introspect, schemasEqual, hashSchema } from "./introspection.js";
import { validateWithResult } from "./mod.js";
// ============================================================================
// Abstract Base Type Class
// ============================================================================
/**
 * Abstract base class for all type objects.
 * Provides common functionality: validation, introspection, equality, hashing.
 *
 * Design principle: Fast path (validate) uses bytecode interpreter.
 * Slow path (properties, composition) uses lazy evaluation.
 */
export class Type {
    /** Internal bytecode representation (accessible to subclasses and within package) */
    bc;
    constructor(bytecode) {
        this.bc = bytecode;
    }
    // ══════════════════════════════════════════════════════════════════════════
    // FAST PATH: Validation (delegates to bytecode interpreter)
    // ══════════════════════════════════════════════════════════════════════════
    /**
     * Validate value against schema (throws on failure).
     *
     * Fast path: Uses optimized bytecode interpreter with DUNION caching,
     * lazy path construction, and result-based validation.
     *
     * @param value - Value to validate
     * @returns Validated value (same as input if valid)
     * @throws ValidationError if validation fails
     */
    validate(value) {
        const err = validateWithResult(this.bc, value, [], 0);
        if (err) {
            throw new Error(`Validation failed at ${err.path}: ${err.message}`);
        }
        return value;
    }
    /**
     * Safe validation that returns Result instead of throwing.
     *
     * @param value - Value to validate
     * @returns Result<T, ValidationError>
     */
    validateSafe(value) {
        const err = validateWithResult(this.bc, value, [], 0);
        if (err) {
            return {
                ok: false,
                error: { path: err.path, message: err.message }
            };
        }
        return { ok: true, value: value };
    }
    /**
     * Validate and collect multiple errors (up to maxErrors).
     *
     * @param value - Value to validate
     * @param maxErrors - Maximum errors to collect (default: 100)
     * @returns Array of validation errors (empty if valid)
     */
    validateAll(value, maxErrors = 100) {
        // For now, return single error (multi-error collection is future work)
        const err = validateWithResult(this.bc, value, [], 0);
        if (err) {
            return [{ path: err.path, message: err.message }];
        }
        return [];
    }
    /**
     * Serialize value (currently just validates and returns value).
     * Future: actual serialization logic (date strings, custom encoders, etc.)
     */
    serialize(value) {
        this.validate(value);
        return value;
    }
    // ══════════════════════════════════════════════════════════════════════════
    // REFLECTION API: Introspection (lazy evaluation)
    // ══════════════════════════════════════════════════════════════════════════
    /**
     * Introspect schema structure.
     * Returns SchemaInfo discriminated union describing type.
     *
     * Subclasses can override for specialized behavior.
     */
    inspect() {
        return introspect(this.bc);
    }
    // ══════════════════════════════════════════════════════════════════════════
    // UTILITIES: Equality, Hashing, Debugging
    // ══════════════════════════════════════════════════════════════════════════
    /**
     * Check if two schemas are structurally equal.
     */
    equals(other) {
        return schemasEqual(this.bc, other.bc);
    }
    /**
     * Compute stable hash of schema.
     */
    hash() {
        return hashSchema(this.bc);
    }
    /**
     * Get raw bytecode (for backward compatibility and advanced use cases).
     */
    get bytecode() {
        return this.bc;
    }
    /**
     * Debug representation showing type kind.
     */
    toString() {
        return `Type<${this.kind}>`;
    }
    // ══════════════════════════════════════════════════════════════════════════
    // WRAPPER METHODS: Readonly, Brand, Metadata
    // ══════════════════════════════════════════════════════════════════════════
    /**
     * Wrap schema with readonly modifier.
     * Note: TypeScript enforces readonly at compile-time, this is for metadata.
     */
    makeReadonly() {
        return new ReadonlyType(this);
    }
    /**
     * Wrap schema with brand tag for nominal typing.
     */
    makeBranded(brand) {
        return new BrandType(brand, this);
    }
    /**
     * Attach metadata to schema (name, source, description, examples).
     */
    withMetadata(metadata) {
        return new MetadataType(metadata, this);
    }
}
// ============================================================================
// Primitive Types
// ============================================================================
export class StringType extends Type {
    kind = "string";
    constructor() {
        super([Op.STRING]);
    }
    // String-specific refinements
    minLength(n) {
        return new RefineMinLengthType(n, this);
    }
    maxLength(n) {
        return new RefineMaxLengthType(n, this);
    }
    email() {
        return new RefineEmailType(this);
    }
    url() {
        return new RefineUrlType(this);
    }
    pattern(regex) {
        return new RefinePatternType(regex, this);
    }
    nonEmpty() {
        return new RefineNonEmptyType(this);
    }
}
export class NumberType extends Type {
    kind = "number";
    constructor() {
        super([Op.NUMBER]);
    }
    // Number-specific refinements
    min(n) {
        return new RefineMinType(n, this);
    }
    max(n) {
        return new RefineMaxType(n, this);
    }
    integer() {
        return new RefineIntegerType(this);
    }
    positive() {
        return new RefinePositiveType(this);
    }
    negative() {
        return new RefineNegativeType(this);
    }
    range(min, max) {
        return new RefineMinType(min, new RefineMaxType(max, this));
    }
}
export class BooleanType extends Type {
    kind = "boolean";
    constructor() {
        super([Op.BOOLEAN]);
    }
}
export class NullType extends Type {
    kind = "null";
    constructor() {
        super([Op.NULL]);
    }
}
export class UndefinedType extends Type {
    kind = "undefined";
    constructor() {
        super([Op.UNDEFINED]);
    }
}
export class LiteralType extends Type {
    kind = "literal";
    _value;
    constructor(value) {
        super([Op.LITERAL, value]);
    }
    get value() {
        if (this._value === undefined) {
            this._value = this.bc[1];
        }
        return this._value;
    }
}
// ============================================================================
// Composite Types
// ============================================================================
export class ArrayType extends Type {
    kind = "array";
    _element;
    constructor(element) {
        super([Op.ARRAY, element.bc]);
    }
    get element() {
        if (!this._element) {
            this._element = createTypeObject(this.bc[1]);
        }
        return this._element;
    }
    // Array-specific refinements
    minItems(n) {
        return new RefineMinItemsType(n, this);
    }
    maxItems(n) {
        return new RefineMaxItemsType(n, this);
    }
    nonEmpty() {
        return new RefineNonEmptyType(this);
    }
}
export class TupleType extends Type {
    kind = "tuple";
    _elements;
    constructor(elements) {
        super([Op.TUPLE, elements.length, ...elements.map(e => e.bc)]);
    }
    get elements() {
        if (!this._elements) {
            const length = this.bc[1];
            this._elements = this.bc.slice(2, 2 + length).map(bc => createTypeObject(bc));
        }
        return this._elements;
    }
}
export class ObjectType extends Type {
    kind = "object";
    _properties;
    _strict;
    constructor(bytecode) {
        super(bytecode);
    }
    get properties() {
        if (!this._properties) {
            const info = introspect(this.bc);
            if (info.kind === "object") {
                this._properties = info.properties;
            }
            else {
                this._properties = [];
            }
        }
        return this._properties;
    }
    get strict() {
        if (this._strict === undefined) {
            const info = introspect(this.bc);
            if (info.kind === "object") {
                this._strict = info.strict;
            }
            else {
                this._strict = false;
            }
        }
        return this._strict;
    }
    // ══════════════════════════════════════════════════════════════════════════
    // OBJECT COMPOSITION METHODS
    // ══════════════════════════════════════════════════════════════════════════
    /**
     * Create new ObjectType with all properties optional.
     */
    makePartial() {
        const newProps = this.properties.map(p => ({
            name: p.name,
            type: p.type,
            optional: true
        }));
        return ObjectType.fromProperties(newProps, this.strict);
    }
    /**
     * Create new ObjectType with all properties required.
     */
    makeRequired() {
        const newProps = this.properties.map(p => ({
            name: p.name,
            type: p.type,
            optional: false
        }));
        return ObjectType.fromProperties(newProps, this.strict);
    }
    /**
     * Create new ObjectType with only selected properties.
     */
    pick(keys) {
        const keySet = new Set(keys);
        const picked = this.properties.filter(p => keySet.has(p.name));
        return ObjectType.fromProperties(picked, this.strict);
    }
    /**
     * Create new ObjectType excluding specified properties.
     */
    omit(keys) {
        const keySet = new Set(keys);
        const omitted = this.properties.filter(p => !keySet.has(p.name));
        return ObjectType.fromProperties(omitted, this.strict);
    }
    /**
     * Create new ObjectType with additional properties.
     */
    extend(additional) {
        const newProps = [
            ...this.properties,
            ...Object.entries(additional).map(([name, type]) => ({
                name,
                type: type, // TypeObject is opaque
                optional: false
            }))
        ];
        return ObjectType.fromProperties(newProps, this.strict);
    }
    /**
     * Create new ObjectType with strict mode toggled.
     */
    withStrictMode(strict) {
        return ObjectType.fromProperties(this.properties, strict);
    }
    // ══════════════════════════════════════════════════════════════════════════
    // FACTORY
    // ══════════════════════════════════════════════════════════════════════════
    /**
     * Create ObjectType from property list.
     */
    static fromProperties(props, strict) {
        const bc = [
            Op.OBJECT,
            props.length,
            strict ? 1 : 0,
            ...props.flatMap(p => {
                const typeBC = p.type.bc || p.type;
                return [Op.PROPERTY, p.name, p.optional ? 1 : 0, typeBC];
            })
        ];
        return new ObjectType(bc);
    }
}
export class UnionType extends Type {
    kind = "union";
    _alternatives;
    constructor(alternatives) {
        super([Op.UNION, alternatives.length, ...alternatives.map(a => a.bc)]);
    }
    get alternatives() {
        if (!this._alternatives) {
            const count = this.bc[1];
            this._alternatives = this.bc.slice(2, 2 + count).map(bc => createTypeObject(bc));
        }
        return this._alternatives;
    }
}
export class DUnionType extends Type {
    kind = "dunion";
    _discriminant;
    _variants;
    constructor(discriminant, variants) {
        super([
            Op.DUNION,
            discriminant,
            variants.length,
            ...variants.flatMap(v => [v.tag, v.schema.bc])
        ]);
    }
    get discriminant() {
        if (!this._discriminant) {
            this._discriminant = this.bc[1];
        }
        return this._discriminant;
    }
    get variants() {
        if (!this._variants) {
            const info = introspect(this.bc);
            if (info.kind === "dunion") {
                this._variants = info.variants;
            }
            else {
                this._variants = [];
            }
        }
        return this._variants;
    }
}
// ============================================================================
// Wrapper Types
// ============================================================================
export class ReadonlyType extends Type {
    kind = "readonly";
    _inner;
    constructor(inner) {
        super([Op.READONLY, inner.bc]);
    }
    get inner() {
        if (!this._inner) {
            this._inner = createTypeObject(this.bc[1]);
        }
        return this._inner;
    }
}
export class BrandType extends Type {
    kind = "brand";
    _tag;
    _inner;
    constructor(tag, inner) {
        super([Op.BRAND, tag, inner.bc]);
    }
    get tag() {
        if (!this._tag) {
            this._tag = this.bc[1];
        }
        return this._tag;
    }
    get inner() {
        if (!this._inner) {
            this._inner = createTypeObject(this.bc[2]);
        }
        return this._inner;
    }
}
export class MetadataType extends Type {
    kind = "metadata";
    _metadata;
    _inner;
    constructor(metadata, inner) {
        super([Op.METADATA, metadata, inner.bc]);
    }
    get metadata() {
        if (!this._metadata) {
            this._metadata = this.bc[1];
        }
        return this._metadata;
    }
    get inner() {
        if (!this._inner) {
            this._inner = createTypeObject(this.bc[2]);
        }
        return this._inner;
    }
}
// ============================================================================
// Refinement Types
// ============================================================================
export class RefineMinType extends Type {
    kind = "refinement";
    _minValue;
    _inner;
    constructor(minValue, inner) {
        super([Op.REFINE_MIN, minValue, inner.bc]);
    }
    get minValue() {
        if (this._minValue === undefined) {
            this._minValue = this.bc[1];
        }
        return this._minValue;
    }
    get inner() {
        if (!this._inner) {
            this._inner = createTypeObject(this.bc[2]);
        }
        return this._inner;
    }
}
export class RefineMaxType extends Type {
    kind = "refinement";
    _maxValue;
    _inner;
    constructor(maxValue, inner) {
        super([Op.REFINE_MAX, maxValue, inner.bc]);
    }
    get maxValue() {
        if (this._maxValue === undefined) {
            this._maxValue = this.bc[1];
        }
        return this._maxValue;
    }
    get inner() {
        if (!this._inner) {
            this._inner = createTypeObject(this.bc[2]);
        }
        return this._inner;
    }
}
export class RefineIntegerType extends Type {
    kind = "refinement";
    _inner;
    constructor(inner) {
        super([Op.REFINE_INTEGER, inner.bc]);
    }
    get inner() {
        if (!this._inner) {
            this._inner = createTypeObject(this.bc[1]);
        }
        return this._inner;
    }
}
export class RefineMinLengthType extends Type {
    kind = "refinement";
    _minLength;
    _inner;
    constructor(minLength, inner) {
        super([Op.REFINE_MIN_LENGTH, minLength, inner.bc]);
    }
    get minLength() {
        if (this._minLength === undefined) {
            this._minLength = this.bc[1];
        }
        return this._minLength;
    }
    get inner() {
        if (!this._inner) {
            this._inner = createTypeObject(this.bc[2]);
        }
        return this._inner;
    }
}
export class RefineMaxLengthType extends Type {
    kind = "refinement";
    _maxLength;
    _inner;
    constructor(maxLength, inner) {
        super([Op.REFINE_MAX_LENGTH, maxLength, inner.bc]);
    }
    get maxLength() {
        if (this._maxLength === undefined) {
            this._maxLength = this.bc[1];
        }
        return this._maxLength;
    }
    get inner() {
        if (!this._inner) {
            this._inner = createTypeObject(this.bc[2]);
        }
        return this._inner;
    }
}
export class RefineMinItemsType extends Type {
    kind = "refinement";
    _minItems;
    _inner;
    constructor(minItems, inner) {
        super([Op.REFINE_MIN_ITEMS, minItems, inner.bc]);
    }
    get minItems() {
        if (this._minItems === undefined) {
            this._minItems = this.bc[1];
        }
        return this._minItems;
    }
    get inner() {
        if (!this._inner) {
            this._inner = createTypeObject(this.bc[2]);
        }
        return this._inner;
    }
}
export class RefineMaxItemsType extends Type {
    kind = "refinement";
    _maxItems;
    _inner;
    constructor(maxItems, inner) {
        super([Op.REFINE_MAX_ITEMS, maxItems, inner.bc]);
    }
    get maxItems() {
        if (this._maxItems === undefined) {
            this._maxItems = this.bc[1];
        }
        return this._maxItems;
    }
    get inner() {
        if (!this._inner) {
            this._inner = createTypeObject(this.bc[2]);
        }
        return this._inner;
    }
}
export class RefineEmailType extends Type {
    kind = "refinement";
    _inner;
    constructor(inner) {
        super([Op.REFINE_EMAIL, inner.bc]);
    }
    get inner() {
        if (!this._inner) {
            this._inner = createTypeObject(this.bc[1]);
        }
        return this._inner;
    }
}
export class RefineUrlType extends Type {
    kind = "refinement";
    _inner;
    constructor(inner) {
        super([Op.REFINE_URL, inner.bc]);
    }
    get inner() {
        if (!this._inner) {
            this._inner = createTypeObject(this.bc[1]);
        }
        return this._inner;
    }
}
export class RefinePatternType extends Type {
    kind = "refinement";
    _pattern;
    _inner;
    constructor(pattern, inner) {
        super([Op.REFINE_PATTERN, pattern, inner.bc]);
    }
    get pattern() {
        if (!this._pattern) {
            this._pattern = this.bc[1];
        }
        return this._pattern;
    }
    get inner() {
        if (!this._inner) {
            this._inner = createTypeObject(this.bc[2]);
        }
        return this._inner;
    }
}
export class RefinePositiveType extends Type {
    kind = "refinement";
    _inner;
    constructor(inner) {
        super([Op.REFINE_POSITIVE, inner.bc]);
    }
    get inner() {
        if (!this._inner) {
            this._inner = createTypeObject(this.bc[1]);
        }
        return this._inner;
    }
}
export class RefineNegativeType extends Type {
    kind = "refinement";
    _inner;
    constructor(inner) {
        super([Op.REFINE_NEGATIVE, inner.bc]);
    }
    get inner() {
        if (!this._inner) {
            this._inner = createTypeObject(this.bc[1]);
        }
        return this._inner;
    }
}
export class RefineNonEmptyType extends Type {
    kind = "refinement";
    _inner;
    constructor(inner) {
        super([Op.REFINE_NON_EMPTY, inner.bc]);
    }
    get inner() {
        if (!this._inner) {
            this._inner = createTypeObject(this.bc[1]);
        }
        return this._inner;
    }
}
// ============================================================================
// Factory Function
// ============================================================================
/**
 * Create a Type object from bytecode.
 * This is the primary factory function used by the compiler.
 *
 * @param bc - Bytecode array
 * @param metadata - Optional metadata (name, source, description, examples)
 * @returns Type instance wrapping the bytecode
 */
export function createTypeObject(bc, metadata) {
    const op = bc[0];
    let type;
    switch (op) {
        // Primitives
        case Op.STRING:
            type = new StringType();
            break;
        case Op.NUMBER:
            type = new NumberType();
            break;
        case Op.BOOLEAN:
            type = new BooleanType();
            break;
        case Op.NULL:
            type = new NullType();
            break;
        case Op.UNDEFINED:
            type = new UndefinedType();
            break;
        case Op.LITERAL:
            type = new LiteralType(bc[1]);
            break;
        // Composites
        case Op.ARRAY:
            type = new ArrayType(createTypeObject(bc[1]));
            break;
        case Op.TUPLE: {
            const length = bc[1];
            const elements = bc.slice(2, 2 + length).map(el => createTypeObject(el));
            type = new TupleType(elements);
            break;
        }
        case Op.OBJECT:
            type = new ObjectType(bc);
            break;
        case Op.UNION: {
            const count = bc[1];
            const alternatives = bc.slice(2, 2 + count).map(alt => createTypeObject(alt));
            type = new UnionType(alternatives);
            break;
        }
        case Op.DUNION: {
            const discriminant = bc[1];
            const variantCount = bc[2];
            const variants = [];
            for (let i = 0; i < variantCount; i++) {
                const tag = bc[3 + i * 2];
                const schema = createTypeObject(bc[3 + i * 2 + 1]);
                variants.push({ tag, schema });
            }
            type = new DUnionType(discriminant, variants);
            break;
        }
        // Wrappers
        case Op.READONLY:
            type = new ReadonlyType(createTypeObject(bc[1]));
            break;
        case Op.BRAND:
            type = new BrandType(bc[1], createTypeObject(bc[2]));
            break;
        case Op.METADATA:
            type = new MetadataType(bc[1], createTypeObject(bc[2]));
            break;
        // Refinements
        case Op.REFINE_MIN:
            type = new RefineMinType(bc[1], createTypeObject(bc[2]));
            break;
        case Op.REFINE_MAX:
            type = new RefineMaxType(bc[1], createTypeObject(bc[2]));
            break;
        case Op.REFINE_INTEGER:
            type = new RefineIntegerType(createTypeObject(bc[1]));
            break;
        case Op.REFINE_MIN_LENGTH:
            type = new RefineMinLengthType(bc[1], createTypeObject(bc[2]));
            break;
        case Op.REFINE_MAX_LENGTH:
            type = new RefineMaxLengthType(bc[1], createTypeObject(bc[2]));
            break;
        case Op.REFINE_MIN_ITEMS:
            type = new RefineMinItemsType(bc[1], createTypeObject(bc[2]));
            break;
        case Op.REFINE_MAX_ITEMS:
            type = new RefineMaxItemsType(bc[1], createTypeObject(bc[2]));
            break;
        case Op.REFINE_EMAIL:
            type = new RefineEmailType(createTypeObject(bc[1]));
            break;
        case Op.REFINE_URL:
            type = new RefineUrlType(createTypeObject(bc[1]));
            break;
        case Op.REFINE_PATTERN:
            type = new RefinePatternType(bc[1], createTypeObject(bc[2]));
            break;
        case Op.REFINE_POSITIVE:
            type = new RefinePositiveType(createTypeObject(bc[1]));
            break;
        case Op.REFINE_NEGATIVE:
            type = new RefineNegativeType(createTypeObject(bc[1]));
            break;
        case Op.REFINE_NON_EMPTY:
            type = new RefineNonEmptyType(createTypeObject(bc[1]));
            break;
        default:
            throw new Error(`Unsupported opcode: ${op} (createTypeObject not yet implemented for this type)`);
    }
    // Wrap with metadata if provided
    if (metadata && Object.keys(metadata).length > 0) {
        return type.withMetadata(metadata);
    }
    return type;
}
