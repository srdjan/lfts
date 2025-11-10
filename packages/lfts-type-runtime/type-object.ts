// packages/lfts-type-runtime/type-object.ts
// Type Object System: Reflection-first API wrapping bytecode

import { Op, type Bytecode } from "../lfts-type-spec/src/mod.ts";
import type {
  PropertyInfo,
  VariantInfo,
  RefinementInfo,
  SchemaInfo,
  PortMethodInfo
} from "./introspection.ts";
import {
  introspect,
  schemasEqual,
  hashSchema,
  unwrapBrand,
  unwrapReadonly,
  unwrapAll
} from "./introspection.ts";
import type { ValidationError, Result, VError, SchemaMetadata } from "./mod.ts";
import { validateWithResult } from "./mod.ts";

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
export abstract class Type<T = unknown> {
  /** Internal bytecode representation (accessible to subclasses and within package) */
  readonly bc: Bytecode;

  /** Schema kind discriminator */
  abstract readonly kind: string;

  constructor(bytecode: Bytecode) {
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
  validate(value: unknown): T {
    const err = validateWithResult(this.bc, value, [], 0);
    if (err) {
      throw new Error(`Validation failed at ${err.path}: ${err.message}`);
    }
    return value as T;
  }

  /**
   * Safe validation that returns Result instead of throwing.
   *
   * @param value - Value to validate
   * @returns Result<T, ValidationError>
   */
  validateSafe(value: unknown): Result<T, ValidationError> {
    const err = validateWithResult(this.bc, value, [], 0);
    if (err) {
      return {
        ok: false,
        error: { path: err.path, message: err.message }
      };
    }
    return { ok: true, value: value as T };
  }

  /**
   * Validate and collect multiple errors (up to maxErrors).
   *
   * @param value - Value to validate
   * @param maxErrors - Maximum errors to collect (default: 100)
   * @returns Array of validation errors (empty if valid)
   */
  validateAll(value: unknown, maxErrors = 100): ValidationError[] {
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
  serialize(value: unknown): unknown {
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
  inspect(): SchemaInfo {
    return introspect(this.bc);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // UTILITIES: Equality, Hashing, Debugging
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Check if two schemas are structurally equal.
   */
  equals(other: Type): boolean {
    return schemasEqual(this.bc, other.bc);
  }

  /**
   * Compute stable hash of schema.
   */
  hash(): string {
    return hashSchema(this.bc);
  }

  /**
   * Get raw bytecode (for backward compatibility and advanced use cases).
   */
  get bytecode(): Bytecode {
    return this.bc;
  }

  /**
   * Debug representation showing type kind.
   */
  toString(): string {
    return `Type<${this.kind}>`;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // WRAPPER METHODS: Readonly, Brand, Metadata
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Wrap schema with readonly modifier.
   * Note: TypeScript enforces readonly at compile-time, this is for metadata.
   */
  makeReadonly(): Type {
    return new ReadonlyType(this);
  }

  /**
   * Wrap schema with brand tag for nominal typing.
   */
  makeBranded(brand: string): Type {
    return new BrandType(brand, this);
  }

  /**
   * Attach metadata to schema (name, source, description, examples).
   */
  withMetadata(metadata: SchemaMetadata): Type {
    return new MetadataType(metadata, this);
  }
}

// ============================================================================
// Primitive Types
// ============================================================================

export class StringType extends Type<string> {
  readonly kind = "string" as const;

  constructor() {
    super([Op.STRING]);
  }

  // String-specific refinements
  minLength(n: number): StringType {
    return new RefineMinLengthType(n, this) as any as StringType;
  }

  maxLength(n: number): StringType {
    return new RefineMaxLengthType(n, this) as any as StringType;
  }

  email(): StringType {
    return new RefineEmailType(this) as any as StringType;
  }

  url(): StringType {
    return new RefineUrlType(this) as any as StringType;
  }

  pattern(regex: string): StringType {
    return new RefinePatternType(regex, this) as any as StringType;
  }

  nonEmpty(): StringType {
    return new RefineNonEmptyType(this) as any as StringType;
  }
}

export class NumberType extends Type<number> {
  readonly kind = "number" as const;

  constructor() {
    super([Op.NUMBER]);
  }

  // Number-specific refinements
  min(n: number): NumberType {
    return new RefineMinType(n, this) as any as NumberType;
  }

  max(n: number): NumberType {
    return new RefineMaxType(n, this) as any as NumberType;
  }

  integer(): NumberType {
    return new RefineIntegerType(this) as any as NumberType;
  }

  positive(): NumberType {
    return new RefinePositiveType(this) as any as NumberType;
  }

  negative(): NumberType {
    return new RefineNegativeType(this) as any as NumberType;
  }

  range(min: number, max: number): NumberType {
    return new RefineMinType(min, new RefineMaxType(max, this)) as any as NumberType;
  }
}

export class BooleanType extends Type<boolean> {
  readonly kind = "boolean" as const;

  constructor() {
    super([Op.BOOLEAN]);
  }
}

export class NullType extends Type<null> {
  readonly kind = "null" as const;

  constructor() {
    super([Op.NULL]);
  }
}

export class UndefinedType extends Type<undefined> {
  readonly kind = "undefined" as const;

  constructor() {
    super([Op.UNDEFINED]);
  }
}

export class LiteralType<T extends string | number | boolean = string | number | boolean> extends Type<T> {
  readonly kind = "literal" as const;

  private _value?: T;

  constructor(value: T) {
    super([Op.LITERAL, value]);
  }

  get value(): T {
    if (this._value === undefined) {
      this._value = this.bc[1] as T;
    }
    return this._value;
  }
}

// ============================================================================
// Composite Types
// ============================================================================

export class ArrayType<T = unknown> extends Type<T[]> {
  readonly kind = "array" as const;

  private _element?: Type;

  constructor(element: Type) {
    super([Op.ARRAY, element.bc]);
  }

  get element(): Type {
    if (!this._element) {
      this._element = createTypeObject(this.bc[1]);
    }
    return this._element;
  }

  // Array-specific refinements
  minItems(n: number): Type {
    return new RefineMinItemsType(n, this);
  }

  maxItems(n: number): Type {
    return new RefineMaxItemsType(n, this);
  }

  nonEmpty(): Type {
    return new RefineNonEmptyType(this);
  }
}

export class TupleType extends Type<unknown[]> {
  readonly kind = "tuple" as const;

  private _elements?: readonly Type[];

  constructor(elements: readonly Type[]) {
    super([Op.TUPLE, elements.length, ...elements.map(e => e.bc)]);
  }

  get elements(): readonly Type[] {
    if (!this._elements) {
      const length = this.bc[1] as number;
      this._elements = this.bc.slice(2, 2 + length).map(bc => createTypeObject(bc));
    }
    return this._elements;
  }
}

export class ObjectType<T extends Record<string, any> = Record<string, any>> extends Type<T> {
  readonly kind = "object" as const;

  private _properties?: readonly PropertyInfo[];
  private _strict?: boolean;

  constructor(bytecode: Bytecode) {
    super(bytecode);
  }

  get properties(): readonly PropertyInfo[] {
    if (!this._properties) {
      const info = introspect(this.bc);
      if (info.kind === "object") {
        this._properties = info.properties;
      } else {
        this._properties = [];
      }
    }
    return this._properties;
  }

  get strict(): boolean {
    if (this._strict === undefined) {
      const info = introspect(this.bc);
      if (info.kind === "object") {
        this._strict = info.strict;
      } else {
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
  makePartial(): ObjectType {
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
  makeRequired(): ObjectType {
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
  pick(keys: readonly string[]): ObjectType {
    const keySet = new Set(keys);
    const picked = this.properties.filter(p => keySet.has(p.name));
    return ObjectType.fromProperties(picked, this.strict);
  }

  /**
   * Create new ObjectType excluding specified properties.
   */
  omit(keys: readonly string[]): ObjectType {
    const keySet = new Set(keys);
    const omitted = this.properties.filter(p => !keySet.has(p.name));
    return ObjectType.fromProperties(omitted, this.strict);
  }

  /**
   * Create new ObjectType with additional properties.
   */
  extend(additional: Record<string, Type>): ObjectType {
    const newProps: PropertyInfo[] = [
      ...this.properties,
      ...Object.entries(additional).map(([name, type]) => ({
        name,
        type: type as any, // TypeObject is opaque
        optional: false
      }))
    ];
    return ObjectType.fromProperties(newProps, this.strict);
  }

  /**
   * Create new ObjectType with strict mode toggled.
   */
  withStrictMode(strict: boolean): ObjectType {
    return ObjectType.fromProperties(this.properties, strict);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // FACTORY
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Create ObjectType from property list.
   */
  static fromProperties(
    props: readonly PropertyInfo[] | readonly { name: string; type: Type | any; optional: boolean }[],
    strict: boolean
  ): ObjectType {
    const bc: Bytecode = [
      Op.OBJECT,
      props.length,
      strict ? 1 : 0,
      ...props.flatMap(p => {
        const typeBC = (p.type as any).bc || p.type;
        return [Op.PROPERTY, p.name, p.optional ? 1 : 0, typeBC];
      })
    ];
    return new ObjectType(bc);
  }
}

export class UnionType<T = unknown> extends Type<T> {
  readonly kind = "union" as const;

  private _alternatives?: readonly Type[];

  constructor(alternatives: readonly Type[]) {
    super([Op.UNION, alternatives.length, ...alternatives.map(a => a.bc)]);
  }

  get alternatives(): readonly Type[] {
    if (!this._alternatives) {
      const count = this.bc[1] as number;
      this._alternatives = this.bc.slice(2, 2 + count).map(bc => createTypeObject(bc));
    }
    return this._alternatives;
  }
}

export class DUnionType<T extends { type: string } = { type: string }> extends Type<T> {
  readonly kind = "dunion" as const;

  private _discriminant?: string;
  private _variants?: readonly VariantInfo[];

  constructor(discriminant: string, variants: readonly { tag: string; schema: Type }[]) {
    super([
      Op.DUNION,
      discriminant,
      variants.length,
      ...variants.flatMap(v => [v.tag, v.schema.bc])
    ]);
  }

  get discriminant(): string {
    if (!this._discriminant) {
      this._discriminant = this.bc[1] as string;
    }
    return this._discriminant;
  }

  get variants(): readonly VariantInfo[] {
    if (!this._variants) {
      const info = introspect(this.bc);
      if (info.kind === "dunion") {
        this._variants = info.variants;
      } else {
        this._variants = [];
      }
    }
    return this._variants;
  }
}

// ============================================================================
// Wrapper Types
// ============================================================================

export class ReadonlyType<T = unknown> extends Type<T> {
  readonly kind = "readonly" as const;

  private _inner?: Type;

  constructor(inner: Type) {
    super([Op.READONLY, inner.bc]);
  }

  get inner(): Type {
    if (!this._inner) {
      this._inner = createTypeObject(this.bc[1]);
    }
    return this._inner;
  }
}

export class BrandType<T = unknown> extends Type<T> {
  readonly kind = "brand" as const;

  private _tag?: string;
  private _inner?: Type;

  constructor(tag: string, inner: Type) {
    super([Op.BRAND, tag, inner.bc]);
  }

  get tag(): string {
    if (!this._tag) {
      this._tag = this.bc[1] as string;
    }
    return this._tag;
  }

  get inner(): Type {
    if (!this._inner) {
      this._inner = createTypeObject(this.bc[2]);
    }
    return this._inner;
  }
}

export class MetadataType<T = unknown> extends Type<T> {
  readonly kind = "metadata" as const;

  private _metadata?: SchemaMetadata;
  private _inner?: Type;

  constructor(metadata: SchemaMetadata, inner: Type) {
    super([Op.METADATA, metadata, inner.bc]);
  }

  get metadata(): SchemaMetadata {
    if (!this._metadata) {
      this._metadata = this.bc[1] as SchemaMetadata;
    }
    return this._metadata;
  }

  get inner(): Type {
    if (!this._inner) {
      this._inner = createTypeObject(this.bc[2]);
    }
    return this._inner;
  }
}

// ============================================================================
// Refinement Types
// ============================================================================

export class RefineMinType extends Type<number> {
  readonly kind = "refinement" as const;

  private _minValue?: number;
  private _inner?: Type;

  constructor(minValue: number, inner: Type) {
    super([Op.REFINE_MIN, minValue, inner.bc]);
  }

  get minValue(): number {
    if (this._minValue === undefined) {
      this._minValue = this.bc[1] as number;
    }
    return this._minValue;
  }

  get inner(): Type {
    if (!this._inner) {
      this._inner = createTypeObject(this.bc[2]);
    }
    return this._inner;
  }
}

export class RefineMaxType extends Type<number> {
  readonly kind = "refinement" as const;

  private _maxValue?: number;
  private _inner?: Type;

  constructor(maxValue: number, inner: Type) {
    super([Op.REFINE_MAX, maxValue, inner.bc]);
  }

  get maxValue(): number {
    if (this._maxValue === undefined) {
      this._maxValue = this.bc[1] as number;
    }
    return this._maxValue;
  }

  get inner(): Type {
    if (!this._inner) {
      this._inner = createTypeObject(this.bc[2]);
    }
    return this._inner;
  }
}

export class RefineIntegerType extends Type<number> {
  readonly kind = "refinement" as const;

  private _inner?: Type;

  constructor(inner: Type) {
    super([Op.REFINE_INTEGER, inner.bc]);
  }

  get inner(): Type {
    if (!this._inner) {
      this._inner = createTypeObject(this.bc[1]);
    }
    return this._inner;
  }
}

export class RefineMinLengthType extends Type<string> {
  readonly kind = "refinement" as const;

  private _minLength?: number;
  private _inner?: Type;

  constructor(minLength: number, inner: Type) {
    super([Op.REFINE_MIN_LENGTH, minLength, inner.bc]);
  }

  get minLength(): number {
    if (this._minLength === undefined) {
      this._minLength = this.bc[1] as number;
    }
    return this._minLength;
  }

  get inner(): Type {
    if (!this._inner) {
      this._inner = createTypeObject(this.bc[2]);
    }
    return this._inner;
  }
}

export class RefineMaxLengthType extends Type<string> {
  readonly kind = "refinement" as const;

  private _maxLength?: number;
  private _inner?: Type;

  constructor(maxLength: number, inner: Type) {
    super([Op.REFINE_MAX_LENGTH, maxLength, inner.bc]);
  }

  get maxLength(): number {
    if (this._maxLength === undefined) {
      this._maxLength = this.bc[1] as number;
    }
    return this._maxLength;
  }

  get inner(): Type {
    if (!this._inner) {
      this._inner = createTypeObject(this.bc[2]);
    }
    return this._inner;
  }
}

export class RefineMinItemsType extends Type<unknown[]> {
  readonly kind = "refinement" as const;

  private _minItems?: number;
  private _inner?: Type;

  constructor(minItems: number, inner: Type) {
    super([Op.REFINE_MIN_ITEMS, minItems, inner.bc]);
  }

  get minItems(): number {
    if (this._minItems === undefined) {
      this._minItems = this.bc[1] as number;
    }
    return this._minItems;
  }

  get inner(): Type {
    if (!this._inner) {
      this._inner = createTypeObject(this.bc[2]);
    }
    return this._inner;
  }
}

export class RefineMaxItemsType extends Type<unknown[]> {
  readonly kind = "refinement" as const;

  private _maxItems?: number;
  private _inner?: Type;

  constructor(maxItems: number, inner: Type) {
    super([Op.REFINE_MAX_ITEMS, maxItems, inner.bc]);
  }

  get maxItems(): number {
    if (this._maxItems === undefined) {
      this._maxItems = this.bc[1] as number;
    }
    return this._maxItems;
  }

  get inner(): Type {
    if (!this._inner) {
      this._inner = createTypeObject(this.bc[2]);
    }
    return this._inner;
  }
}

export class RefineEmailType extends Type<string> {
  readonly kind = "refinement" as const;

  private _inner?: Type;

  constructor(inner: Type) {
    super([Op.REFINE_EMAIL, inner.bc]);
  }

  get inner(): Type {
    if (!this._inner) {
      this._inner = createTypeObject(this.bc[1]);
    }
    return this._inner;
  }
}

export class RefineUrlType extends Type<string> {
  readonly kind = "refinement" as const;

  private _inner?: Type;

  constructor(inner: Type) {
    super([Op.REFINE_URL, inner.bc]);
  }

  get inner(): Type {
    if (!this._inner) {
      this._inner = createTypeObject(this.bc[1]);
    }
    return this._inner;
  }
}

export class RefinePatternType extends Type<string> {
  readonly kind = "refinement" as const;

  private _pattern?: string;
  private _inner?: Type;

  constructor(pattern: string, inner: Type) {
    super([Op.REFINE_PATTERN, pattern, inner.bc]);
  }

  get pattern(): string {
    if (!this._pattern) {
      this._pattern = this.bc[1] as string;
    }
    return this._pattern;
  }

  get inner(): Type {
    if (!this._inner) {
      this._inner = createTypeObject(this.bc[2]);
    }
    return this._inner;
  }
}

export class RefinePositiveType extends Type<number> {
  readonly kind = "refinement" as const;

  private _inner?: Type;

  constructor(inner: Type) {
    super([Op.REFINE_POSITIVE, inner.bc]);
  }

  get inner(): Type {
    if (!this._inner) {
      this._inner = createTypeObject(this.bc[1]);
    }
    return this._inner;
  }
}

export class RefineNegativeType extends Type<number> {
  readonly kind = "refinement" as const;

  private _inner?: Type;

  constructor(inner: Type) {
    super([Op.REFINE_NEGATIVE, inner.bc]);
  }

  get inner(): Type {
    if (!this._inner) {
      this._inner = createTypeObject(this.bc[1]);
    }
    return this._inner;
  }
}

export class RefineNonEmptyType extends Type {
  readonly kind = "refinement" as const;

  private _inner?: Type;

  constructor(inner: Type) {
    super([Op.REFINE_NON_EMPTY, inner.bc]);
  }

  get inner(): Type {
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
export function createTypeObject(
  bc: Bytecode,
  metadata?: SchemaMetadata
): Type {
  const op = bc[0] as Op;

  let type: Type;

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
      type = new LiteralType(bc[1] as string | number | boolean);
      break;

    // Composites
    case Op.ARRAY:
      type = new ArrayType(createTypeObject(bc[1]));
      break;
    case Op.TUPLE: {
      const length = bc[1] as number;
      const elements = bc.slice(2, 2 + length).map(el => createTypeObject(el));
      type = new TupleType(elements);
      break;
    }
    case Op.OBJECT:
      type = new ObjectType(bc);
      break;
    case Op.UNION: {
      const count = bc[1] as number;
      const alternatives = bc.slice(2, 2 + count).map(alt => createTypeObject(alt));
      type = new UnionType(alternatives);
      break;
    }
    case Op.DUNION: {
      const discriminant = bc[1] as string;
      const variantCount = bc[2] as number;
      const variants: { tag: string; schema: Type }[] = [];
      for (let i = 0; i < variantCount; i++) {
        const tag = bc[3 + i * 2] as string;
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
      type = new BrandType(bc[1] as string, createTypeObject(bc[2]));
      break;
    case Op.METADATA:
      type = new MetadataType(bc[1] as SchemaMetadata, createTypeObject(bc[2]));
      break;

    // Refinements
    case Op.REFINE_MIN:
      type = new RefineMinType(bc[1] as number, createTypeObject(bc[2]));
      break;
    case Op.REFINE_MAX:
      type = new RefineMaxType(bc[1] as number, createTypeObject(bc[2]));
      break;
    case Op.REFINE_INTEGER:
      type = new RefineIntegerType(createTypeObject(bc[1]));
      break;
    case Op.REFINE_MIN_LENGTH:
      type = new RefineMinLengthType(bc[1] as number, createTypeObject(bc[2]));
      break;
    case Op.REFINE_MAX_LENGTH:
      type = new RefineMaxLengthType(bc[1] as number, createTypeObject(bc[2]));
      break;
    case Op.REFINE_MIN_ITEMS:
      type = new RefineMinItemsType(bc[1] as number, createTypeObject(bc[2]));
      break;
    case Op.REFINE_MAX_ITEMS:
      type = new RefineMaxItemsType(bc[1] as number, createTypeObject(bc[2]));
      break;
    case Op.REFINE_EMAIL:
      type = new RefineEmailType(createTypeObject(bc[1]));
      break;
    case Op.REFINE_URL:
      type = new RefineUrlType(createTypeObject(bc[1]));
      break;
    case Op.REFINE_PATTERN:
      type = new RefinePatternType(bc[1] as string, createTypeObject(bc[2]));
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
