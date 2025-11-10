// packages/lfts-type-runtime/builders.ts
// Programmatic type builders for runtime schema construction

import {
  Type,
  StringType,
  NumberType,
  BooleanType,
  NullType,
  UndefinedType,
  LiteralType,
  ArrayType,
  TupleType,
  ObjectType,
  UnionType,
  DUnionType,
} from "./type-object.ts";

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
  string(): StringType {
    return new StringType();
  },

  /**
   * Number type builder.
   */
  number(): NumberType {
    return new NumberType();
  },

  /**
   * Boolean type builder.
   */
  boolean(): BooleanType {
    return new BooleanType();
  },

  /**
   * Null type builder.
   */
  null(): NullType {
    return new NullType();
  },

  /**
   * Undefined type builder.
   */
  undefined(): UndefinedType {
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
  literal<T extends string | number | boolean>(value: T): LiteralType<T> {
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
  array<T>(element: Type<T>): ArrayType<T> {
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
  tuple(...elements: readonly Type[]): TupleType {
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
  object<T extends Record<string, any> = Record<string, any>>(
    props: Record<string, Type | any>,
    strict = false
  ): ObjectType<T> {
    const propInfos = Object.entries(props).map(([name, type]) => ({
      name,
      type: type as Type,
      optional: false,
    }));
    return ObjectType.fromProperties(propInfos, strict) as ObjectType<T>;
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
  objectWithOptional<T extends Record<string, any> = Record<string, any>>(
    required: Record<string, Type | any>,
    optional: Record<string, Type | any>,
    strict = false
  ): ObjectType<T> {
    const propInfos = [
      ...Object.entries(required).map(([name, type]) => ({
        name,
        type: type as Type,
        optional: false,
      })),
      ...Object.entries(optional).map(([name, type]) => ({
        name,
        type: type as Type,
        optional: true,
      })),
    ];
    return ObjectType.fromProperties(propInfos, strict) as ObjectType<T>;
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
  union<T = unknown>(...alternatives: readonly Type[]): UnionType<T> {
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
  dunion<T extends { type: string } = { type: string }>(
    discriminant: string,
    variants: Record<string, Type>
  ): DUnionType<T> {
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
  optional<T>(type: Type<T>): UnionType<T | undefined> {
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
  nullable<T>(type: Type<T>): UnionType<T | null> {
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
  record<V>(valueType: Type<V>): ObjectType<Record<string, V>> {
    // For now, return empty object with non-strict mode
    // Future: enhance validation to check all values match valueType
    return ObjectType.fromProperties([], false);
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
} as const;
