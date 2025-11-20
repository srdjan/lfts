// packages/lfts-type-runtime/builders.ts
// Programmatic type builders for runtime schema construction
import { StringType, NumberType, BooleanType, NullType, UndefinedType, LiteralType, ArrayType, TupleType, ObjectType, UnionType, DUnionType, createTypeObject, } from "./type-object.js";
import { Op } from "../lfts-type-spec/src/mod.js";
// ============================================================================
// Primitive Type Builders
// ============================================================================
/**
 * Fluent API for building type schemas programmatically.
 *
 * @example
 * ```ts
 * import { t } from "lfts-type-runtime";
 *
 * const User$ = t.object({
 *   id: t.string().pattern(/^usr_[a-z0-9]+$/),
 *   email: t.string().email().maxLength(255),
 *   age: t.number().min(0).max(120).integer(),
 *   role: t.union(t.literal("admin"), t.literal("user"), t.literal("guest")),
 * });
 *
 * const result = User$.validate(data);
 * ```
 */
export const t = {
    /**
     * String type builder.
     */
    string() {
        return new StringType();
    },
    /**
     * Number type builder.
     */
    number() {
        return new NumberType();
    },
    /**
     * Boolean type builder.
     */
    boolean() {
        return new BooleanType();
    },
    /**
     * Null type builder.
     */
    null() {
        return new NullType();
    },
    /**
     * Undefined type builder.
     */
    undefined() {
        return new UndefinedType();
    },
    /**
     * Literal type builder for string, number, or boolean literals.
     *
     * @example
     * ```ts
     * const Status$ = t.literal("active");
     * const Count$ = t.literal(42);
     * const Flag$ = t.literal(true);
     * ```
     */
    literal(value) {
        return new LiteralType(value);
    },
    /**
     * Array type builder.
     *
     * @example
     * ```ts
     * const Numbers$ = t.array(t.number());
     * const Users$ = t.array(User$);
     * ```
     */
    array(element) {
        return new ArrayType(element);
    },
    /**
     * Tuple type builder.
     *
     * @example
     * ```ts
     * const Pair$ = t.tuple(t.string(), t.number());
     * const Triple$ = t.tuple(t.boolean(), t.string(), t.number());
     * ```
     */
    tuple(...elements) {
        return new TupleType(elements);
    },
    /**
     * Object type builder.
     *
     * @param props - Property definitions (name → type)
     * @param strict - If true, reject excess properties (default: false)
     *
     * @example
     * ```ts
     * const User$ = t.object({
     *   id: t.string(),
     *   name: t.string(),
     *   email: t.string().email(),
     * });
     *
     * // Strict mode (rejects unknown properties)
     * const StrictUser$ = t.object({
     *   id: t.string(),
     * }, true);
     * ```
     */
    object(props, strict = false) {
        const propInfos = Object.entries(props).map(([name, type]) => ({
            name,
            type: type,
            optional: false,
        }));
        return ObjectType.fromProperties(propInfos, strict);
    },
    /**
     * Object type builder with optional properties.
     *
     * @param required - Required properties
     * @param optional - Optional properties
     * @param strict - If true, reject excess properties
     *
     * @example
     * ```ts
     * const User$ = t.objectWithOptional(
     *   { id: t.string(), name: t.string() },
     *   { email: t.string(), phone: t.string() }
     * );
     * ```
     */
    objectWithOptional(required, optional, strict = false) {
        const propInfos = [
            ...Object.entries(required).map(([name, type]) => ({
                name,
                type: type,
                optional: false,
            })),
            ...Object.entries(optional).map(([name, type]) => ({
                name,
                type: type,
                optional: true,
            })),
        ];
        return ObjectType.fromProperties(propInfos, strict);
    },
    /**
     * Union type builder.
     *
     * @example
     * ```ts
     * const Status$ = t.union(
     *   t.literal("active"),
     *   t.literal("inactive"),
     *   t.literal("pending")
     * );
     * ```
     */
    union(...alternatives) {
        return new UnionType(alternatives);
    },
    /**
     * Discriminated union type builder (ADT).
     *
     * @param discriminant - Discriminant field name (usually "type")
     * @param variants - Variant definitions (tag → schema)
     *
     * @example
     * ```ts
     * const Result$ = t.dunion("type", {
     *   ok: t.object({ type: t.literal("ok"), value: t.number() }),
     *   err: t.object({ type: t.literal("err"), message: t.string() }),
     * });
     * ```
     */
    dunion(discriminant, variants) {
        const variantArray = Object.entries(variants).map(([tag, schema]) => ({
            tag,
            schema,
        }));
        return new DUnionType(discriminant, variantArray);
    },
    /**
     * Optional type builder (shorthand for union with undefined).
     *
     * @example
     * ```ts
     * const MaybeString$ = t.optional(t.string());
     * // Equivalent to: t.union(t.string(), t.undefined())
     * ```
     */
    optional(type) {
        return new UnionType([type, new UndefinedType()]);
    },
    /**
     * Nullable type builder (shorthand for union with null).
     *
     * @example
     * ```ts
     * const NullableString$ = t.nullable(t.string());
     * // Equivalent to: t.union(t.string(), t.null())
     * ```
     */
    nullable(type) {
        return new UnionType([type, new NullType()]);
    },
    /**
     * Record type builder (object with uniform value type).
     *
     * Note: This is a simplified version. TypeScript's Record<K, V> is more
     * powerful, but we approximate it with an object schema.
     *
     * @example
     * ```ts
     * const StringMap$ = t.record(t.string());
     * // Validates: { [key: string]: string }
     * ```
     */
    record(valueType) {
        // For now, return empty object with non-strict mode
        // Future: enhance validation to check all values match valueType
        return ObjectType.fromProperties([], false);
    },
    // ============================================================================
    // Convenience Methods (Phase 2.2: v0.12.0)
    // ============================================================================
    /**
     * Email string type (convenience method).
     *
     * Shorthand for `t.string().email()`.
     *
     * @example
     * ```ts
     * const User$ = t.object({
     *   email: t.email(),
     *   name: t.string(),
     * });
     * ```
     */
    email() {
        return new StringType().email();
    },
    /**
     * URL string type (convenience method).
     *
     * Shorthand for `t.string().url()`.
     *
     * @example
     * ```ts
     * const Link$ = t.object({
     *   href: t.url(),
     *   title: t.string(),
     * });
     * ```
     */
    url() {
        return new StringType().url();
    },
    /**
     * UUID string type (convenience method).
     *
     * Validates UUID format (8-4-4-4-12 hex digits).
     *
     * @example
     * ```ts
     * const Entity$ = t.object({
     *   id: t.uuid(),
     *   name: t.string(),
     * });
     * ```
     */
    uuid() {
        return new StringType().pattern("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$");
    },
    /**
     * Positive number type (convenience method).
     *
     * Shorthand for `t.number().positive()`.
     *
     * @example
     * ```ts
     * const Product$ = t.object({
     *   price: t.positiveNumber(),
     *   quantity: t.positiveInteger(),
     * });
     * ```
     */
    positiveNumber() {
        return new NumberType().positive();
    },
    /**
     * Positive integer type (convenience method).
     *
     * Creates a positive integer constraint.
     * Note: Due to refinement chaining limitations, this creates the bytecode directly.
     *
     * @example
     * ```ts
     * const Pagination$ = t.object({
     *   page: t.positiveInteger(),
     *   limit: t.positiveInteger(),
     * });
     * ```
     */
    positiveInteger() {
        // Create nested refinements: integer(positive(number))
        const base = new NumberType().bc;
        const withPositive = [Op.REFINE_POSITIVE, base];
        const withInteger = [Op.REFINE_INTEGER, withPositive];
        return createTypeObject(withInteger);
    },
    /**
     * Integer type (convenience method).
     *
     * Shorthand for `t.number().integer()`.
     *
     * @example
     * ```ts
     * const Counter$ = t.object({
     *   count: t.integer(),
     * });
     * ```
     */
    integer() {
        return new NumberType().integer();
    },
    /**
     * Non-empty array type (convenience method).
     *
     * Shorthand for `t.array(elementType).nonEmpty()`.
     *
     * @example
     * ```ts
     * const TodoList$ = t.object({
     *   tasks: t.nonEmptyArray(t.string()),
     * });
     * ```
     */
    nonEmptyArray(element) {
        return new ArrayType(element).nonEmpty();
    },
    /**
     * String enum type (convenience method).
     *
     * Creates a union of string literals from an array.
     *
     * @example
     * ```ts
     * const Status$ = t.stringEnum(["active", "inactive", "pending"]);
     * // Equivalent to: t.union(t.literal("active"), t.literal("inactive"), t.literal("pending"))
     * ```
     */
    stringEnum(values) {
        const alternatives = values.map((v) => new LiteralType(v));
        return new UnionType(alternatives);
    },
    /**
     * Number enum type (convenience method).
     *
     * Creates a union of number literals from an array.
     *
     * @example
     * ```ts
     * const Priority$ = t.numberEnum([1, 2, 3, 4, 5]);
     * // Equivalent to: t.union(t.literal(1), t.literal(2), ...)
     * ```
     */
    numberEnum(values) {
        const alternatives = values.map((v) => new LiteralType(v));
        return new UnionType(alternatives);
    },
    /**
     * Boolean enum type (convenience method).
     *
     * Creates a union of boolean literals (usually just [true, false], but flexible).
     *
     * @example
     * ```ts
     * const TrueOnly$ = t.booleanEnum([true]);
     * const Bool$ = t.booleanEnum([true, false]); // Same as t.boolean()
     * ```
     */
    booleanEnum(values) {
        const alternatives = values.map((v) => new LiteralType(v));
        return new UnionType(alternatives);
    },
    /**
     * Const string type (convenience method).
     *
     * Alias for `t.literal()` with better semantics for const strings.
     *
     * @example
     * ```ts
     * const Kind$ = t.constString("user");
     * // Same as: t.literal("user")
     * ```
     */
    constString(value) {
        return new LiteralType(value);
    },
    /**
     * Const number type (convenience method).
     *
     * Alias for `t.literal()` with better semantics for const numbers.
     *
     * @example
     * ```ts
     * const Version$ = t.constNumber(1);
     * // Same as: t.literal(1)
     * ```
     */
    constNumber(value) {
        return new LiteralType(value);
    },
};
// ============================================================================
// Convenience Exports
// ============================================================================
/**
 * Pre-built primitive types for convenience.
 *
 * @example
 * ```ts
 * import { primitives } from "lfts-type-runtime";
 *
 * const User$ = t.object({
 *   id: primitives.string,
 *   age: primitives.number,
 *   active: primitives.boolean,
 * });
 * ```
 */
export const primitives = {
    string: new StringType(),
    number: new NumberType(),
    boolean: new BooleanType(),
    null: new NullType(),
    undefined: new UndefinedType(),
};
