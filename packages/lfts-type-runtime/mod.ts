// packages/lfts-type-runtime/mod.ts
import { Op } from "../lfts-type-spec/src/mod.ts";
import { match as patternMatch } from "ts-pattern";

export const TYPEOF_PLACEHOLDER = Symbol.for("lfts.typeOf.placeholder");

// Dev shim: valid TS without compiler
export function typeOf<T>(): any {
  return { __lfp: TYPEOF_PLACEHOLDER };
}

export type TypeObject = unknown;

// ============================================================================
// Introspection API (Phase 1: v0.6.0)
// ============================================================================

// Re-export introspection API for convenient access
export type {
  PropertyInfo,
  RefinementInfo,
  SchemaInfo,
  VariantInfo,
  PortMethodInfo,
  SchemaVisitor,
} from "./introspection.ts";

export {
  getKind,
  getProperties,
  getRefinements,
  getVariants,
  hashSchema,
  introspect,
  schemasEqual,
  traverse,
  unwrapAll,
  unwrapBrand,
  unwrapReadonly,
} from "./introspection.ts";

// ============================================================================
// Prebuilt Type Annotations
// ============================================================================

/**
 * Nominal type annotation for compile-time branding.
 *
 * Usage:
 *   type UserId = string & Nominal;
 *   type ProductId = number & Nominal;
 *
 * This provides type-level distinction without runtime overhead.
 * The compiler recognizes this annotation but emits no runtime checks.
 */
export type Nominal = { readonly __meta?: ["nominal"] };

/**
 * Email validation annotation (runtime check).
 *
 * Usage:
 *   type UserEmail = string & Email;
 *
 * Validates email format at runtime using a simple pattern.
 */
export type Email = { readonly __meta?: ["email"] };

/**
 * URL validation annotation (runtime check).
 *
 * Usage:
 *   type ProfileUrl = string & Url;
 *
 * Validates URL format at runtime.
 */
export type Url = { readonly __meta?: ["url"] };

/**
 * Custom regex pattern validation annotation (runtime check).
 *
 * Usage:
 *   type PhoneNumber = string & Pattern<"^\\+?[1-9]\\d{1,14}$">;
 *
 * Validates string against custom regex pattern at runtime.
 */
export type Pattern<P extends string> = { readonly __meta?: ["pattern", P] };

/**
 * Minimum string length validation annotation (runtime check).
 *
 * Usage:
 *   type Username = string & MinLength<3>;
 *
 * Validates string has at least N characters.
 */
export type MinLength<N extends number> = {
  readonly __meta?: ["minLength", N];
};

/**
 * Maximum string length validation annotation (runtime check).
 *
 * Usage:
 *   type Username = string & MaxLength<20>;
 *
 * Validates string has at most N characters.
 */
export type MaxLength<N extends number> = {
  readonly __meta?: ["maxLength", N];
};

/**
 * Minimum numeric value validation annotation (runtime check).
 *
 * Usage:
 *   type Age = number & Min<0>;
 *
 * Validates number is >= N.
 */
export type Min<N extends number> = { readonly __meta?: ["min", N] };

/**
 * Maximum numeric value validation annotation (runtime check).
 *
 * Usage:
 *   type Age = number & Max<120>;
 *
 * Validates number is <= N.
 */
export type Max<N extends number> = { readonly __meta?: ["max", N] };

/**
 * Numeric range validation annotation (runtime check).
 *
 * Usage:
 *   type Percentage = number & Range<0, 100>;
 *
 * Validates number is >= Min and <= Max.
 */
export type Range<MinVal extends number, MaxVal extends number> = {
  readonly __meta?: ["range", MinVal, MaxVal];
};

/**
 * Positive number validation annotation (runtime check, v0.8.0).
 *
 * Usage:
 *   type Age = number & Positive;
 *   type Balance = number & Positive;
 *
 * Validates number is > 0 at runtime.
 */
export type Positive = { readonly __meta?: ["positive"] };

/**
 * Negative number validation annotation (runtime check, v0.8.0).
 *
 * Usage:
 *   type Debt = number & Negative;
 *   type Loss = number & Negative;
 *
 * Validates number is < 0 at runtime.
 */
export type Negative = { readonly __meta?: ["negative"] };

/**
 * Integer validation annotation (runtime check, v0.8.0).
 *
 * Usage:
 *   type Count = number & Integer;
 *   type Index = number & Integer;
 *
 * Validates number has no decimal part at runtime.
 */
export type Integer = { readonly __meta?: ["integer"] };

/**
 * Non-empty array validation annotation (runtime check, v0.8.0).
 *
 * Usage:
 *   type Tags = string[] & NonEmpty;
 *   type Items = Product[] & NonEmpty;
 *
 * Validates array has at least one element at runtime.
 */
export type NonEmpty = { readonly __meta?: ["nonEmpty"] };

/**
 * Combined positive integer annotation (convenience type, v0.8.0).
 *
 * Usage:
 *   type PositiveInteger = number & Positive & Integer;
 *
 * Validates number is > 0 and has no decimal part.
 */
export type PositiveInteger = Positive & Integer;

/**
 * Combined negative integer annotation (convenience type, v0.8.0).
 *
 * Usage:
 *   type NegativeInteger = number & Negative & Integer;
 *
 * Validates number is < 0 and has no decimal part.
 */
export type NegativeInteger = Negative & Integer;

// ============================================================================
// Result and Option Types
// ============================================================================

// Result type for functional error handling
export type Result<T, E> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

// Option type for optional values (Phase 1)
export type Option<T> =
  | { readonly some: true; readonly value: T }
  | { readonly some: false };

// Validation error with path context
export type ValidationError = {
  readonly path: string;
  readonly message: string;
};

// Result type with multiple errors (for error aggregation)
export type ValidationResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly errors: readonly ValidationError[] };

function isBC(x: unknown): x is any[] {
  return Array.isArray(x);
}

// Internal validation error type (branded for type safety)
type VErrorBrand = { readonly __brand: "VError" };
type VError = {
  readonly path: string;
  readonly message: string;
  readonly fullMessage: string;
} & VErrorBrand;

// Factory function for creating validation errors
function createVError(path: string, message: string): VError {
  return {
    __brand: "VError" as const,
    path,
    message,
    fullMessage: path ? `${path}: ${message}` : message,
  } as VError;
}

// Type guard for VError
function isVError(x: unknown): x is VError {
  return typeof x === "object" && x !== null && (x as any).__brand === "VError";
}

// Path segment type for lazy path construction
type PathSegment = string | number;

// Build path string from segments (only called on error)
function buildPath(segments: PathSegment[]): string {
  if (segments.length === 0) return "";
  let path = "";
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (typeof seg === "number") {
      path += `[${seg}]`;
    } else {
      path += i === 0 ? seg : `.${seg}`;
    }
  }
  return path;
}

const MAX_DEPTH = 100;

// DUNION tag map cache: WeakMap keyed by bytecode array reference
// Converts O(n) linear search to O(1) lookup after first validation
const dunionCache = new WeakMap<any[], Map<string, any[]>>();

function getDunionTagMap(bc: any[]): Map<string, any[]> {
  let map = dunionCache.get(bc);
  if (!map) {
    // Build map on first access: tag → schema
    map = new Map();
    const n = bc[2] as number;
    for (let i = 0; i < n; i++) {
      const tag = bc[3 + 2 * i] as string;
      const schema = bc[3 + 2 * i + 1] as any[];
      map.set(tag, schema);
    }
    dunionCache.set(bc, map);
  }
  return map;
}

// Schema memoization cache: Cache unwrapped inner schemas for READONLY/BRAND wrappers
// Provides 10-20% performance gain by avoiding redundant wrapper traversals
const wrapperCache = new WeakMap<any[], any[]>();

function getInnerSchema(bc: any[]): any[] {
  let inner = wrapperCache.get(bc);
  if (!inner) {
    // Extract inner schema based on opcode
    const op = bc[0];
    if (op === Op.READONLY) {
      inner = bc[1] as any[];
    } else if (op === Op.BRAND) {
      inner = bc[2] as any[]; // BRAND: [Op.BRAND, tag, innerType]
    } else {
      inner = bc; // Not a wrapper, return as-is
    }
    wrapperCache.set(bc, inner);
  }
  return inner;
}

// Helper functions for complex validation cases (extracted from switch statement)

function validateArray(
  bc: any[],
  value: unknown,
  pathSegments: PathSegment[],
  depth: number,
): VError | null {
  if (!Array.isArray(value)) {
    return createVError(buildPath(pathSegments), `expected array`);
  }

  const elemT = bc[1];
  for (let i = 0; i < value.length; i++) {
    pathSegments.push(i);
    const err = validateWithResult(elemT, value[i], pathSegments, depth + 1);
    pathSegments.pop();
    if (err) return err;
  }

  return null;
}

function validateTuple(
  bc: any[],
  value: unknown,
  pathSegments: PathSegment[],
  depth: number,
): VError | null {
  const n = bc[1] as number;

  if (!Array.isArray(value)) {
    return createVError(buildPath(pathSegments), `expected tuple[${n}]`);
  }

  if (value.length !== n) {
    return createVError(
      buildPath(pathSegments),
      `expected tuple length ${n}, got ${value.length}`,
    );
  }

  for (let i = 0; i < n; i++) {
    const eltT = bc[2 + i];
    pathSegments.push(i);
    const err = validateWithResult(eltT, value[i], pathSegments, depth + 1);
    pathSegments.pop();
    if (err) return err;
  }

  return null;
}

function validateObject(
  bc: any[],
  value: unknown,
  pathSegments: PathSegment[],
  depth: number,
): VError | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return createVError(buildPath(pathSegments), `expected object`);
  }

  const count = bc[1] as number;

  // Backward compatibility: check if bc[2] is strict flag (0 or 1) or first PROPERTY marker (Op.PROPERTY = 9)
  const hasStrictFlag = bc[2] === 0 || bc[2] === 1;
  const strict = hasStrictFlag && bc[2] === 1;
  let idx = hasStrictFlag ? 3 : 2;

  // Collect known property names for excess property checking
  const knownProps = strict ? new Set<string>() : null;

  for (let i = 0; i < count; i++) {
    const marker = bc[idx++];
    if (marker !== Op.PROPERTY) {
      throw new Error("corrupt bytecode: expected PROPERTY");
    }
    const name = bc[idx++];
    const optional = bc[idx++] === 1;
    const t = bc[idx++];

    if (knownProps) knownProps.add(name);

    if (Object.prototype.hasOwnProperty.call(value as object, name)) {
      pathSegments.push(name);
      // @ts-ignore
      const err = validateWithResult(
        t,
        (value as any)[name],
        pathSegments,
        depth + 1,
      );
      pathSegments.pop();
      if (err) return err;
    } else if (!optional) {
      pathSegments.push(name);
      const err = createVError(
        buildPath(pathSegments),
        `required property missing`,
      );
      pathSegments.pop();
      return err;
    }
  }

  // Check for excess properties if strict mode enabled
  if (strict && knownProps) {
    for (const key in value) {
      if (
        Object.prototype.hasOwnProperty.call(value, key) && !knownProps.has(key)
      ) {
        pathSegments.push(key);
        const err = createVError(
          buildPath(pathSegments),
          `excess property (not in schema)`,
        );
        pathSegments.pop();
        return err;
      }
    }
  }

  return null;
}

function validateDUnion(
  bc: any[],
  value: unknown,
  pathSegments: PathSegment[],
  depth: number,
): VError | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return createVError(
      buildPath(pathSegments),
      `expected object for discriminated union`,
    );
  }

  const tagKey = bc[1] as string;
  const vTag = (value as any)[tagKey];

  if (typeof vTag !== "string") {
    const n = bc[2] as number;
    const expected = [...Array(n).keys()].map((i) =>
      JSON.stringify(bc[3 + 2 * i])
    ).join(", ");
    pathSegments.push(tagKey);
    const err = createVError(
      buildPath(pathSegments),
      `expected string discriminant; expected one of: ${expected}`,
    );
    pathSegments.pop();
    return err;
  }

  const tagMap = getDunionTagMap(bc);
  const variantSchema = tagMap.get(vTag);

  if (variantSchema) {
    return validateWithResult(variantSchema, value, pathSegments, depth + 1);
  }

  const allTags = Array.from(tagMap.keys()).map((t) => JSON.stringify(t)).join(
    ", ",
  );
  pathSegments.push(tagKey);
  const err = createVError(
    buildPath(pathSegments),
    `unexpected tag ${JSON.stringify(vTag)}; expected one of: ${allTags}`,
  );
  pathSegments.pop();
  return err;
}

function validateUnion(
  bc: any[],
  value: unknown,
  pathSegments: PathSegment[],
  depth: number,
): VError | null {
  // Optimized: use Result-based validation instead of try/catch
  const n = bc[1] as number;
  for (let i = 0; i < n; i++) {
    const err = validateWithResult(bc[2 + i], value, pathSegments, depth + 1);
    if (!err) return null; // Success: one alternative matched
  }
  return createVError(buildPath(pathSegments), `no union alternative matched`);
}

// Internal validation that returns error instead of throwing (for UNION optimization)
// Now using ts-pattern for cleaner pattern matching
function validateWithResult(
  bc: any[],
  value: unknown,
  pathSegments: PathSegment[],
  depth: number,
): VError | null {
  if (depth > MAX_DEPTH) {
    return createVError(
      buildPath(pathSegments),
      `maximum nesting depth (${MAX_DEPTH}) exceeded`,
    );
  }

  const op = bc[0];

  return patternMatch<number, VError | null>(op)
    .with(
      Op.STRING,
      () =>
        typeof value !== "string"
          ? createVError(
            buildPath(pathSegments),
            `expected string, got ${typeof value}`,
          )
          : null,
    )
    .with(
      Op.NUMBER,
      () =>
        typeof value !== "number" || !Number.isFinite(value)
          ? createVError(buildPath(pathSegments), `expected finite number`)
          : null,
    )
    .with(
      Op.BOOLEAN,
      () =>
        typeof value !== "boolean"
          ? createVError(buildPath(pathSegments), `expected boolean`)
          : null,
    )
    .with(
      Op.NULL,
      () =>
        value !== null
          ? createVError(buildPath(pathSegments), `expected null`)
          : null,
    )
    .with(
      Op.UNDEFINED,
      () =>
        value !== undefined
          ? createVError(buildPath(pathSegments), `expected undefined`)
          : null,
    )
    .with(Op.LITERAL, () => {
      const lit = bc[1];
      return value !== lit
        ? createVError(
          buildPath(pathSegments),
          `expected literal ${JSON.stringify(lit)}`,
        )
        : null;
    })
    .with(Op.ARRAY, () => validateArray(bc, value, pathSegments, depth))
    .with(Op.TUPLE, () => validateTuple(bc, value, pathSegments, depth))
    .with(Op.OBJECT, () => validateObject(bc, value, pathSegments, depth))
    .with(Op.DUNION, () => validateDUnion(bc, value, pathSegments, depth))
    .with(Op.UNION, () => validateUnion(bc, value, pathSegments, depth))
    .with(Op.READONLY, () => {
      // Use cached inner schema for performance
      const inner = getInnerSchema(bc);
      return validateWithResult(inner, value, pathSegments, depth + 1);
    })
    .with(Op.BRAND, () => {
      // Use cached inner schema for performance
      const inner = getInnerSchema(bc);
      return validateWithResult(inner, value, pathSegments, depth + 1);
    })
    .with(Op.REFINE_MIN, () => {
      const minValue = bc[1] as number;
      const innerSchema = bc[2];
      const err = validateWithResult(
        innerSchema,
        value,
        pathSegments,
        depth + 1,
      );
      if (err) return err;
      if (typeof value !== "number") {
        return createVError(
          buildPath(pathSegments),
          `min refinement requires number type`,
        );
      }
      return value < minValue
        ? createVError(
          buildPath(pathSegments),
          `expected >= ${minValue}, got ${value}`,
        )
        : null;
    })
    .with(Op.REFINE_MAX, () => {
      const maxValue = bc[1] as number;
      const innerSchema = bc[2];
      const err = validateWithResult(
        innerSchema,
        value,
        pathSegments,
        depth + 1,
      );
      if (err) return err;
      if (typeof value !== "number") {
        return createVError(
          buildPath(pathSegments),
          `max refinement requires number type`,
        );
      }
      return value > maxValue
        ? createVError(
          buildPath(pathSegments),
          `expected <= ${maxValue}, got ${value}`,
        )
        : null;
    })
    .with(Op.REFINE_INTEGER, () => {
      const innerSchema = bc[1];
      const err = validateWithResult(
        innerSchema,
        value,
        pathSegments,
        depth + 1,
      );
      if (err) return err;
      if (typeof value !== "number") {
        return createVError(
          buildPath(pathSegments),
          `integer refinement requires number type`,
        );
      }
      return !Number.isInteger(value)
        ? createVError(
          buildPath(pathSegments),
          `expected integer, got ${value}`,
        )
        : null;
    })
    .with(Op.REFINE_MIN_LENGTH, () => {
      const minLen = bc[1] as number;
      const innerSchema = bc[2];
      const err = validateWithResult(
        innerSchema,
        value,
        pathSegments,
        depth + 1,
      );
      if (err) return err;
      if (typeof value !== "string") {
        return createVError(
          buildPath(pathSegments),
          `minLength refinement requires string type`,
        );
      }
      return value.length < minLen
        ? createVError(
          buildPath(pathSegments),
          `expected length >= ${minLen}, got ${value.length}`,
        )
        : null;
    })
    .with(Op.REFINE_MAX_LENGTH, () => {
      const maxLen = bc[1] as number;
      const innerSchema = bc[2];
      const err = validateWithResult(
        innerSchema,
        value,
        pathSegments,
        depth + 1,
      );
      if (err) return err;
      if (typeof value !== "string") {
        return createVError(
          buildPath(pathSegments),
          `maxLength refinement requires string type`,
        );
      }
      return value.length > maxLen
        ? createVError(
          buildPath(pathSegments),
          `expected length <= ${maxLen}, got ${value.length}`,
        )
        : null;
    })
    .with(Op.REFINE_MIN_ITEMS, () => {
      const minItems = bc[1] as number;
      const innerSchema = bc[2];
      const err = validateWithResult(
        innerSchema,
        value,
        pathSegments,
        depth + 1,
      );
      if (err) return err;
      if (!Array.isArray(value)) {
        return createVError(
          buildPath(pathSegments),
          `minItems refinement requires array type`,
        );
      }
      return value.length < minItems
        ? createVError(
          buildPath(pathSegments),
          `expected array length >= ${minItems}, got ${value.length}`,
        )
        : null;
    })
    .with(Op.REFINE_MAX_ITEMS, () => {
      const maxItems = bc[1] as number;
      const innerSchema = bc[2];
      const err = validateWithResult(
        innerSchema,
        value,
        pathSegments,
        depth + 1,
      );
      if (err) return err;
      if (!Array.isArray(value)) {
        return createVError(
          buildPath(pathSegments),
          `maxItems refinement requires array type`,
        );
      }
      return value.length > maxItems
        ? createVError(
          buildPath(pathSegments),
          `expected array length <= ${maxItems}, got ${value.length}`,
        )
        : null;
    })
    .with(Op.REFINE_EMAIL, () => {
      const innerSchema = bc[1];
      const err = validateWithResult(
        innerSchema,
        value,
        pathSegments,
        depth + 1,
      );
      if (err) return err;
      if (typeof value !== "string") {
        return createVError(
          buildPath(pathSegments),
          `email refinement requires string type`,
        );
      }
      // Simple email regex (not RFC-compliant, but good enough for most cases)
      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      return !emailPattern.test(value)
        ? createVError(
          buildPath(pathSegments),
          `expected valid email format`,
        )
        : null;
    })
    .with(Op.REFINE_URL, () => {
      const innerSchema = bc[1];
      const err = validateWithResult(
        innerSchema,
        value,
        pathSegments,
        depth + 1,
      );
      if (err) return err;
      if (typeof value !== "string") {
        return createVError(
          buildPath(pathSegments),
          `url refinement requires string type`,
        );
      }
      // Simple URL validation
      try {
        new URL(value);
        return null;
      } catch {
        return createVError(
          buildPath(pathSegments),
          `expected valid URL format`,
        );
      }
    })
    .with(Op.REFINE_PATTERN, () => {
      const pattern = bc[1] as string;
      const innerSchema = bc[2];
      const err = validateWithResult(
        innerSchema,
        value,
        pathSegments,
        depth + 1,
      );
      if (err) return err;
      if (typeof value !== "string") {
        return createVError(
          buildPath(pathSegments),
          `pattern refinement requires string type`,
        );
      }
      const regex = new RegExp(pattern);
      return !regex.test(value)
        ? createVError(
          buildPath(pathSegments),
          `expected to match pattern ${pattern}`,
        )
        : null;
    })
    .with(Op.REFINE_POSITIVE, () => {
      const innerSchema = bc[1];
      const err = validateWithResult(
        innerSchema,
        value,
        pathSegments,
        depth + 1,
      );
      if (err) return err;
      if (typeof value !== "number") {
        return createVError(
          buildPath(pathSegments),
          `positive refinement requires number type`,
        );
      }
      return value <= 0
        ? createVError(
          buildPath(pathSegments),
          `expected positive number (> 0), got ${value}`,
        )
        : null;
    })
    .with(Op.REFINE_NEGATIVE, () => {
      const innerSchema = bc[1];
      const err = validateWithResult(
        innerSchema,
        value,
        pathSegments,
        depth + 1,
      );
      if (err) return err;
      if (typeof value !== "number") {
        return createVError(
          buildPath(pathSegments),
          `negative refinement requires number type`,
        );
      }
      return value >= 0
        ? createVError(
          buildPath(pathSegments),
          `expected negative number (< 0), got ${value}`,
        )
        : null;
    })
    .with(Op.REFINE_NON_EMPTY, () => {
      const innerSchema = bc[1];
      const err = validateWithResult(
        innerSchema,
        value,
        pathSegments,
        depth + 1,
      );
      if (err) return err;
      if (!Array.isArray(value)) {
        return createVError(
          buildPath(pathSegments),
          `nonEmpty refinement requires array type`,
        );
      }
      return value.length === 0
        ? createVError(
          buildPath(pathSegments),
          `expected non-empty array`,
        )
        : null;
    })
    // Phase 1: Result/Option validators
    .with(Op.RESULT_OK, () => {
      // Validate Result.ok structure: { ok: true, value: T }
      if (!value || typeof value !== "object" || !("ok" in value)) {
        return createVError(buildPath(pathSegments), "expected Result type");
      }
      const resultValue = value as any;
      if (resultValue.ok !== true) {
        return createVError(buildPath(pathSegments), "expected Result.ok");
      }
      const valueSchema = bc[1];
      pathSegments.push("value");
      const err = validateWithResult(
        valueSchema,
        resultValue.value,
        pathSegments,
        depth + 1,
      );
      pathSegments.pop();
      return err;
    })
    .with(Op.RESULT_ERR, () => {
      // Validate Result.err structure: { ok: false, error: E }
      if (!value || typeof value !== "object" || !("ok" in value)) {
        return createVError(buildPath(pathSegments), "expected Result type");
      }
      const resultValue = value as any;
      if (resultValue.ok !== false) {
        return createVError(buildPath(pathSegments), "expected Result.err");
      }
      const errorSchema = bc[1];
      pathSegments.push("error");
      const err = validateWithResult(
        errorSchema,
        resultValue.error,
        pathSegments,
        depth + 1,
      );
      pathSegments.pop();
      return err;
    })
    .with(Op.OPTION_SOME, () => {
      // Validate Option.some structure: { some: true, value: T }
      if (!value || typeof value !== "object" || !("some" in value)) {
        return createVError(buildPath(pathSegments), "expected Option type");
      }
      const optionValue = value as any;
      if (optionValue.some !== true) {
        return createVError(buildPath(pathSegments), "expected Option.some");
      }
      const valueSchema = bc[1];
      pathSegments.push("value");
      const err = validateWithResult(
        valueSchema,
        optionValue.value,
        pathSegments,
        depth + 1,
      );
      pathSegments.pop();
      return err;
    })
    .with(Op.OPTION_NONE, () => {
      // Validate Option.none structure: { some: false }
      if (!value || typeof value !== "object" || !("some" in value)) {
        return createVError(buildPath(pathSegments), "expected Option type");
      }
      const optionValue = value as any;
      if (optionValue.some !== false) {
        return createVError(buildPath(pathSegments), "expected Option.none");
      }
      return null;
    })
    // Phase 1.2: Metadata wrapper (transparent pass-through)
    .with(Op.METADATA, () => {
      // METADATA format: [Op.METADATA, metadata, innerSchema]
      // Just validate the inner schema, ignoring metadata
      const innerSchema = bc[2];
      return validateWithResult(innerSchema, value, pathSegments, depth);
    })
    .otherwise(() =>
      createVError(buildPath(pathSegments), `unsupported opcode ${op}`)
    );
}

// Convert VError to throwable Error
function vErrorToError(vErr: VError): Error {
  const err = new Error(vErr.fullMessage);
  err.name = "ValidationError";
  return err;
}

// Public throwing API (backwards compatible)
function validateWith(
  bc: any[],
  value: unknown,
  pathSegments: PathSegment[] = [],
  depth = 0,
): void {
  const err = validateWithResult(bc, value, pathSegments, depth);
  if (err) throw vErrorToError(err);
}

function assertBytecode(t: any): asserts t is any[] {
  if (!isBC(t)) {
    const isPlaceholder = t && typeof t === "object" &&
      t.__lfp === TYPEOF_PLACEHOLDER;
    const hint = isPlaceholder
      ? "This looks like an untransformed `typeOf<T>()`. Run `deno task build` (compiler transform) before executing."
      : "Expected compiler-inlined bytecode array.";
    throw new Error(`LFTS runtime: missing bytecode. ${hint}`);
  }
}

export function decode(bc: unknown): TypeObject {
  return bc as any[];
}

/**
 * Validate a value against a schema (throws on error)
 * @param t - Bytecode schema
 * @param value - Value to validate
 * @returns The validated value (for chaining)
 * @throws VError if validation fails
 */
export function validate(t: TypeObject, value: unknown) {
  assertBytecode(t);
  validateWith(t as any[], value, []);
  return value; // if valid, return value
}

/**
 * Validate a value against a schema (returns Result)
 * Functional alternative to validate() that returns success/error instead of throwing
 * @param t - Bytecode schema
 * @param value - Value to validate
 * @returns Result<T, ValidationError> with either the validated value or error details
 */
export function validateSafe<T>(
  t: TypeObject,
  value: unknown,
): Result<T, ValidationError> {
  assertBytecode(t);
  const err = validateWithResult(t as any[], value, [], 0);
  if (err) {
    return { ok: false, error: { path: err.path, message: err.message } };
  }
  return { ok: true, value: value as T };
}

/**
 * Validate a value against a schema and collect ALL errors (error aggregation)
 * Instead of stopping at the first error, this collects all validation failures
 *
 * @param t - Bytecode schema
 * @param value - Value to validate
 * @param maxErrors - Maximum number of errors to collect (default: 100, prevents infinite loops)
 * @returns ValidationResult<T> with either the validated value or all errors
 *
 * @example
 * const result = validateAll(UserSchema, userData);
 * if (!result.ok) {
 *   console.log(`Found ${result.errors.length} validation errors:`);
 *   result.errors.forEach(err => console.log(`  ${err.path}: ${err.message}`));
 * }
 */
export function validateAll<T>(
  t: TypeObject,
  value: unknown,
  maxErrors = 100,
): ValidationResult<T> {
  assertBytecode(t);
  const errors: ValidationError[] = [];
  collectErrors(t as any[], value, [], 0, errors, maxErrors);

  if (errors.length === 0) {
    return { ok: true, value: value as T };
  }
  return { ok: false, errors };
}

// Internal function for error aggregation - collects all errors instead of short-circuiting
function collectErrors(
  bc: any[],
  value: unknown,
  pathSegments: PathSegment[],
  depth: number,
  errors: ValidationError[],
  maxErrors: number,
): void {
  // Stop if we've hit the max error limit
  if (errors.length >= maxErrors) return;

  if (depth > MAX_DEPTH) {
    errors.push({
      path: buildPath(pathSegments),
      message: `maximum nesting depth (${MAX_DEPTH}) exceeded`,
    });
    return;
  }

  const op = bc[0];

  patternMatch<number, void>(op)
    .with(Op.STRING, () => {
      if (typeof value !== "string") {
        errors.push({
          path: buildPath(pathSegments),
          message: `expected string, got ${typeof value}`,
        });
      }
    })
    .with(Op.NUMBER, () => {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        errors.push({
          path: buildPath(pathSegments),
          message: `expected finite number`,
        });
      }
    })
    .with(Op.BOOLEAN, () => {
      if (typeof value !== "boolean") {
        errors.push({
          path: buildPath(pathSegments),
          message: `expected boolean`,
        });
      }
    })
    .with(Op.NULL, () => {
      if (value !== null) {
        errors.push({
          path: buildPath(pathSegments),
          message: `expected null`,
        });
      }
    })
    .with(Op.UNDEFINED, () => {
      if (value !== undefined) {
        errors.push({
          path: buildPath(pathSegments),
          message: `expected undefined`,
        });
      }
    })
    .with(Op.LITERAL, () => {
      const lit = bc[1];
      if (value !== lit) {
        errors.push({
          path: buildPath(pathSegments),
          message: `expected literal ${JSON.stringify(lit)}`,
        });
      }
    })
    .with(Op.ARRAY, () => {
      if (!Array.isArray(value)) {
        errors.push({
          path: buildPath(pathSegments),
          message: `expected array`,
        });
        return;
      }
      const elemT = bc[1];
      // Validate all elements even if some fail
      for (let i = 0; i < value.length && errors.length < maxErrors; i++) {
        pathSegments.push(i);
        collectErrors(
          elemT,
          value[i],
          pathSegments,
          depth + 1,
          errors,
          maxErrors,
        );
        pathSegments.pop();
      }
    })
    .with(Op.TUPLE, () => {
      const n = bc[1] as number;
      if (!Array.isArray(value)) {
        errors.push({
          path: buildPath(pathSegments),
          message: `expected tuple[${n}]`,
        });
        return;
      }
      if (value.length !== n) {
        errors.push({
          path: buildPath(pathSegments),
          message: `expected tuple length ${n}, got ${value.length}`,
        });
      }
      // Validate all elements even if length is wrong
      const checkLength = Math.min(n, value.length);
      for (let i = 0; i < checkLength && errors.length < maxErrors; i++) {
        const eltT = bc[2 + i];
        pathSegments.push(i);
        collectErrors(
          eltT,
          value[i],
          pathSegments,
          depth + 1,
          errors,
          maxErrors,
        );
        pathSegments.pop();
      }
    })
    .with(Op.OBJECT, () => {
      if (value === null || typeof value !== "object" || Array.isArray(value)) {
        errors.push({
          path: buildPath(pathSegments),
          message: `expected object`,
        });
        return;
      }

      const count = bc[1] as number;
      const hasStrictFlag = bc[2] === 0 || bc[2] === 1;
      const strict = hasStrictFlag && bc[2] === 1;
      let idx = hasStrictFlag ? 3 : 2;
      const knownProps = strict ? new Set<string>() : null;

      // Validate all properties, don't stop at first error
      for (let i = 0; i < count && errors.length < maxErrors; i++) {
        const marker = bc[idx++];
        if (marker !== Op.PROPERTY) {
          throw new Error("corrupt bytecode: expected PROPERTY");
        }
        const name = bc[idx++];
        const optional = bc[idx++] === 1;
        const t = bc[idx++];

        if (knownProps) knownProps.add(name);

        if (Object.prototype.hasOwnProperty.call(value as object, name)) {
          pathSegments.push(name);
          collectErrors(
            t,
            (value as any)[name],
            pathSegments,
            depth + 1,
            errors,
            maxErrors,
          );
          pathSegments.pop();
        } else if (!optional) {
          pathSegments.push(name);
          errors.push({
            path: buildPath(pathSegments),
            message: `required property missing`,
          });
          pathSegments.pop();
        }
      }

      // Check for excess properties
      if (strict && knownProps && errors.length < maxErrors) {
        for (const key in value) {
          if (
            Object.prototype.hasOwnProperty.call(value, key) &&
            !knownProps.has(key)
          ) {
            pathSegments.push(key);
            errors.push({
              path: buildPath(pathSegments),
              message: `excess property (not in schema)`,
            });
            pathSegments.pop();
            if (errors.length >= maxErrors) break;
          }
        }
      }
    })
    .with(Op.DUNION, () => {
      if (value === null || typeof value !== "object" || Array.isArray(value)) {
        errors.push({
          path: buildPath(pathSegments),
          message: `expected object for discriminated union`,
        });
        return;
      }

      const tagKey = bc[1] as string;
      const vTag = (value as any)[tagKey];

      if (typeof vTag !== "string") {
        const n = bc[2] as number;
        const expected = [...Array(n).keys()].map((i) =>
          JSON.stringify(bc[3 + 2 * i])
        ).join(", ");
        pathSegments.push(tagKey);
        errors.push({
          path: buildPath(pathSegments),
          message: `expected string discriminant; expected one of: ${expected}`,
        });
        pathSegments.pop();
        return;
      }

      const tagMap = getDunionTagMap(bc);
      const variantSchema = tagMap.get(vTag);

      if (variantSchema) {
        collectErrors(
          variantSchema,
          value,
          pathSegments,
          depth + 1,
          errors,
          maxErrors,
        );
      } else {
        const allTags = Array.from(tagMap.keys()).map((t) => JSON.stringify(t))
          .join(", ");
        pathSegments.push(tagKey);
        errors.push({
          path: buildPath(pathSegments),
          message: `unexpected tag ${
            JSON.stringify(vTag)
          }; expected one of: ${allTags}`,
        });
        pathSegments.pop();
      }
    })
    .with(Op.UNION, () => {
      // For unions with aggregation, we try all alternatives and report if NONE match
      // This is different from the short-circuit version
      const n = bc[1] as number;
      let anyMatched = false;

      for (let i = 0; i < n; i++) {
        const alternativeErrors: ValidationError[] = [];
        collectErrors(
          bc[2 + i],
          value,
          pathSegments,
          depth + 1,
          alternativeErrors,
          maxErrors,
        );
        if (alternativeErrors.length === 0) {
          anyMatched = true;
          break; // One alternative matched, union is valid
        }
      }

      if (!anyMatched) {
        errors.push({
          path: buildPath(pathSegments),
          message: `no union alternative matched`,
        });
      }
    })
    .with(Op.READONLY, () => {
      // Use cached inner schema for performance
      const inner = getInnerSchema(bc);
      collectErrors(inner, value, pathSegments, depth + 1, errors, maxErrors);
    })
    .with(Op.BRAND, () => {
      // Use cached inner schema for performance
      const inner = getInnerSchema(bc);
      collectErrors(inner, value, pathSegments, depth + 1, errors, maxErrors);
    })
    .with(Op.REFINE_MIN, () => {
      const minValue = bc[1] as number;
      const innerSchema = bc[2];
      // First validate the inner type
      collectErrors(
        innerSchema,
        value,
        pathSegments,
        depth + 1,
        errors,
        maxErrors,
      );
      // Then check refinement if no errors so far
      if (
        errors.length < maxErrors && typeof value === "number" &&
        value < minValue
      ) {
        errors.push({
          path: buildPath(pathSegments),
          message: `expected >= ${minValue}, got ${value}`,
        });
      }
    })
    .with(Op.REFINE_MAX, () => {
      const maxValue = bc[1] as number;
      const innerSchema = bc[2];
      collectErrors(
        innerSchema,
        value,
        pathSegments,
        depth + 1,
        errors,
        maxErrors,
      );
      if (
        errors.length < maxErrors && typeof value === "number" &&
        value > maxValue
      ) {
        errors.push({
          path: buildPath(pathSegments),
          message: `expected <= ${maxValue}, got ${value}`,
        });
      }
    })
    .with(Op.REFINE_INTEGER, () => {
      const innerSchema = bc[1];
      collectErrors(
        innerSchema,
        value,
        pathSegments,
        depth + 1,
        errors,
        maxErrors,
      );
      if (
        errors.length < maxErrors && typeof value === "number" &&
        !Number.isInteger(value)
      ) {
        errors.push({
          path: buildPath(pathSegments),
          message: `expected integer, got ${value}`,
        });
      }
    })
    .with(Op.REFINE_MIN_LENGTH, () => {
      const minLen = bc[1] as number;
      const innerSchema = bc[2];
      collectErrors(
        innerSchema,
        value,
        pathSegments,
        depth + 1,
        errors,
        maxErrors,
      );
      if (
        errors.length < maxErrors && typeof value === "string" &&
        value.length < minLen
      ) {
        errors.push({
          path: buildPath(pathSegments),
          message: `expected length >= ${minLen}, got ${value.length}`,
        });
      }
    })
    .with(Op.REFINE_MAX_LENGTH, () => {
      const maxLen = bc[1] as number;
      const innerSchema = bc[2];
      collectErrors(
        innerSchema,
        value,
        pathSegments,
        depth + 1,
        errors,
        maxErrors,
      );
      if (
        errors.length < maxErrors && typeof value === "string" &&
        value.length > maxLen
      ) {
        errors.push({
          path: buildPath(pathSegments),
          message: `expected length <= ${maxLen}, got ${value.length}`,
        });
      }
    })
    .with(Op.REFINE_MIN_ITEMS, () => {
      const minItems = bc[1] as number;
      const innerSchema = bc[2];
      collectErrors(
        innerSchema,
        value,
        pathSegments,
        depth + 1,
        errors,
        maxErrors,
      );
      if (
        errors.length < maxErrors && Array.isArray(value) &&
        value.length < minItems
      ) {
        errors.push({
          path: buildPath(pathSegments),
          message: `expected array length >= ${minItems}, got ${value.length}`,
        });
      }
    })
    .with(Op.REFINE_MAX_ITEMS, () => {
      const maxItems = bc[1] as number;
      const innerSchema = bc[2];
      collectErrors(
        innerSchema,
        value,
        pathSegments,
        depth + 1,
        errors,
        maxErrors,
      );
      if (
        errors.length < maxErrors && Array.isArray(value) &&
        value.length > maxItems
      ) {
        errors.push({
          path: buildPath(pathSegments),
          message: `expected array length <= ${maxItems}, got ${value.length}`,
        });
      }
    })
    .with(Op.REFINE_EMAIL, () => {
      const innerSchema = bc[1];
      collectErrors(
        innerSchema,
        value,
        pathSegments,
        depth + 1,
        errors,
        maxErrors,
      );
      if (errors.length < maxErrors && typeof value === "string") {
        const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailPattern.test(value)) {
          errors.push({
            path: buildPath(pathSegments),
            message: `expected valid email format`,
          });
        }
      }
    })
    .with(Op.REFINE_URL, () => {
      const innerSchema = bc[1];
      collectErrors(
        innerSchema,
        value,
        pathSegments,
        depth + 1,
        errors,
        maxErrors,
      );
      if (errors.length < maxErrors && typeof value === "string") {
        try {
          new URL(value);
        } catch {
          errors.push({
            path: buildPath(pathSegments),
            message: `expected valid URL format`,
          });
        }
      }
    })
    .with(Op.REFINE_PATTERN, () => {
      const pattern = bc[1] as string;
      const innerSchema = bc[2];
      collectErrors(
        innerSchema,
        value,
        pathSegments,
        depth + 1,
        errors,
        maxErrors,
      );
      if (errors.length < maxErrors && typeof value === "string") {
        const regex = new RegExp(pattern);
        if (!regex.test(value)) {
          errors.push({
            path: buildPath(pathSegments),
            message: `expected to match pattern ${pattern}`,
          });
        }
      }
    })
    .with(Op.REFINE_POSITIVE, () => {
      const innerSchema = bc[1];
      collectErrors(
        innerSchema,
        value,
        pathSegments,
        depth + 1,
        errors,
        maxErrors,
      );
      if (errors.length < maxErrors && typeof value === "number" && value <= 0) {
        errors.push({
          path: buildPath(pathSegments),
          message: `expected positive number (> 0), got ${value}`,
        });
      }
    })
    .with(Op.REFINE_NEGATIVE, () => {
      const innerSchema = bc[1];
      collectErrors(
        innerSchema,
        value,
        pathSegments,
        depth + 1,
        errors,
        maxErrors,
      );
      if (errors.length < maxErrors && typeof value === "number" && value >= 0) {
        errors.push({
          path: buildPath(pathSegments),
          message: `expected negative number (< 0), got ${value}`,
        });
      }
    })
    .with(Op.REFINE_NON_EMPTY, () => {
      const innerSchema = bc[1];
      collectErrors(
        innerSchema,
        value,
        pathSegments,
        depth + 1,
        errors,
        maxErrors,
      );
      if (errors.length < maxErrors && Array.isArray(value) && value.length === 0) {
        errors.push({
          path: buildPath(pathSegments),
          message: `expected non-empty array`,
        });
      }
    })
    // Phase 1.2: Metadata wrapper (transparent pass-through)
    .with(Op.METADATA, () => {
      // METADATA format: [Op.METADATA, metadata, innerSchema]
      // Just validate the inner schema, ignoring metadata
      const innerSchema = bc[2];
      collectErrors(innerSchema, value, pathSegments, depth, errors, maxErrors);
    })
    .otherwise(() => {
      errors.push({
        path: buildPath(pathSegments),
        message: `unsupported opcode ${op}`,
      });
    });
}

export function serialize(t: TypeObject, value: unknown) {
  // Iteration-1: no structural changes; rely on validate for correctness
  validate(t, value);
  return value;
}

// Exhaustive pattern matching helper for ADTs discriminated by `type`.
export function match<T extends { type: string }, R>(
  value: T,
  cases:
    & { [K in T["type"]]?: (v: Extract<T, { type: K }>) => R }
    & Record<string, ((v: any) => R) | undefined>,
): R {
  const tag = (value as any).type;
  const handler = (cases as any)[tag];
  if (typeof handler !== "function") {
    throw new Error(`match: unhandled case '${String(tag)}'`);
  }
  return handler(value as any);
}

// ============================================================================
// Phase 1: Result/Option Combinators
// ============================================================================

/**
 * Result combinator namespace for functional error handling.
 * Provides map, andThen, mapErr, and other combinators for composing
 * Result-returning functions without manual if/else branching.
 */
export const Result = {
  /**
   * Create a successful Result with a value.
   */
  ok<T, E = never>(value: T): Result<T, E> {
    return { ok: true, value };
  },

  /**
   * Create a failed Result with an error.
   */
  err<T = never, E = unknown>(error: E): Result<T, E> {
    return { ok: false, error };
  },

  /**
   * Transform the value inside a successful Result.
   * If the Result is an error, returns the error unchanged.
   */
  map<T, U, E>(
    result: Result<T, E>,
    fn: (value: T) => U,
  ): Result<U, E> {
    return result.ok ? Result.ok(fn(result.value)) : result;
  },

  /**
   * Chain Result-returning functions together.
   * Short-circuits on the first error.
   */
  andThen<T, U, E>(
    result: Result<T, E>,
    fn: (value: T) => Result<U, E>,
  ): Result<U, E> {
    return result.ok ? fn(result.value) : result;
  },

  /**
   * Transform the error inside a failed Result.
   * If the Result is successful, returns it unchanged.
   */
  mapErr<T, E, F>(
    result: Result<T, E>,
    fn: (error: E) => F,
  ): Result<T, F> {
    return result.ok ? result : Result.err(fn(result.error));
  },

  /**
   * Apply a predicate to the value and convert to error if it fails.
   * Returns a function that can be used in andThen chains.
   * If the input Result is already an error, it is returned unchanged.
   */
  ensure<T, E>(
    predicate: (value: T) => boolean,
    error: E,
  ): (result: Result<T, E>) => Result<T, E> {
    return (result) => {
      if (!result.ok) return result; // Preserve existing error
      return predicate(result.value) ? result : Result.err(error);
    };
  },

  /**
   * Unwrap a Result value or provide a default.
   */
  unwrapOr<T, E>(result: Result<T, E>, defaultValue: T): T {
    return result.ok ? result.value : defaultValue;
  },

  /**
   * Check if a Result is successful.
   */
  isOk<T, E>(result: Result<T, E>): result is { ok: true; value: T } {
    return result.ok;
  },

  /**
   * Check if a Result is an error.
   */
  isErr<T, E>(result: Result<T, E>): result is { ok: false; error: E } {
    return !result.ok;
  },
};

/**
 * Option combinator namespace for optional values.
 * Provides map, andThen, okOr, and other combinators for working with
 * optional values without null checks.
 */
export const Option = {
  /**
   * Create an Option with a value.
   */
  some<T>(value: T): Option<T> {
    return { some: true, value };
  },

  /**
   * Create an empty Option.
   */
  none<T>(): Option<T> {
    return { some: false };
  },

  /**
   * Safely get the first element of an array.
   */
  first<T>(arr: readonly T[]): Option<T> {
    return arr.length > 0 ? Option.some(arr[0]) : Option.none();
  },

  /**
   * Create an Option from a nullable value.
   */
  from<T>(value: T | null | undefined): Option<T> {
    return value != null ? Option.some(value) : Option.none();
  },

  /**
   * Transform the value inside an Option.
   * If the Option is empty, returns empty Option.
   */
  map<T, U>(option: Option<T>, fn: (value: T) => U): Option<U> {
    return option.some ? Option.some(fn(option.value)) : Option.none();
  },

  /**
   * Chain Option-returning functions together.
   * Short-circuits on the first empty Option.
   */
  andThen<T, U>(option: Option<T>, fn: (value: T) => Option<U>): Option<U> {
    return option.some ? fn(option.value) : Option.none();
  },

  /**
   * Convert an Option to a Result, providing an error value for None.
   */
  okOr<T, E>(option: Option<T>, error: E): Result<T, E> {
    return option.some ? Result.ok(option.value) : Result.err(error);
  },

  /**
   * Unwrap an Option value or provide a default.
   */
  unwrapOr<T>(option: Option<T>, defaultValue: T): T {
    return option.some ? option.value : defaultValue;
  },

  /**
   * Check if an Option has a value.
   */
  isSome<T>(option: Option<T>): option is { some: true; value: T } {
    return option.some;
  },

  /**
   * Check if an Option is empty.
   */
  isNone<T>(option: Option<T>): option is { some: false } {
    return !option.some;
  },

  /**
   * Combine multiple Options into one. All must have values.
   */
  zip<T extends readonly unknown[]>(
    ...options: { [K in keyof T]: Option<T[K]> }
  ): Option<T> {
    const values: any[] = [];
    for (const opt of options) {
      if (!Option.isSome(opt)) return Option.none();
      values.push(opt.value);
    }
    return Option.some(values as any);
  },
};

/**
 * AsyncResult combinator namespace for effectful operations.
 * Provides ergonomic helpers for composing Promise<Result<T, E>> operations
 * commonly used with ports/capabilities that perform I/O or other effects.
 *
 * Philosophy: Effects are just async functions that can fail.
 * Use standard async/await with Result types for error handling.
 */
export const AsyncResult = {
  /**
   * Wrap an async operation that may throw into Promise<Result<T, E>>.
   * Converts exceptions into Result.err values.
   *
   * Example:
   *   const result = await AsyncResult.try(
   *     async () => await fetch(url).then(r => r.json()),
   *     (err) => `Network error: ${err}`
   *   );
   */
  try<T, E>(
    fn: () => Promise<T>,
    onError: (error: unknown) => E,
  ): Promise<Result<T, E>> {
    return fn()
      .then((value) => Result.ok<T, E>(value))
      .catch((error) => Result.err<T, E>(onError(error)));
  },

  /**
   * Chain async Result-returning functions together.
   * Short-circuits on the first error.
   *
   * Example:
   *   const result = await AsyncResult.andThen(
   *     loadUser(id),
   *     (user) => loadPosts(user.id)
   *   );
   */
  async andThen<T, U, E>(
    promise: Promise<Result<T, E>>,
    fn: (value: T) => Promise<Result<U, E>>,
  ): Promise<Result<U, E>> {
    const result = await promise;
    return result.ok ? fn(result.value) : result;
  },

  /**
   * Transform the success value inside an async Result.
   * If the Result is an error, returns the error unchanged.
   *
   * Example:
   *   const result = await AsyncResult.map(
   *     loadUser(id),
   *     (user) => user.name
   *   );
   */
  async map<T, U, E>(
    promise: Promise<Result<T, E>>,
    fn: (value: T) => U,
  ): Promise<Result<U, E>> {
    const result = await promise;
    return result.ok ? Result.ok(fn(result.value)) : result;
  },

  /**
   * Transform the error value inside an async Result.
   * If the Result is successful, returns it unchanged.
   *
   * Example:
   *   const result = await AsyncResult.mapErr(
   *     loadUser(id),
   *     (err) => `Failed to load user: ${err}`
   *   );
   */
  async mapErr<T, E, F>(
    promise: Promise<Result<T, E>>,
    fn: (error: E) => F,
  ): Promise<Result<T, F>> {
    const result = await promise;
    return result.ok ? result : Result.err(fn(result.error));
  },

  /**
   * Run multiple async Results in parallel. Fail-fast on first error.
   * Returns array of success values if all succeed.
   *
   * Example:
   *   const result = await AsyncResult.all([
   *     loadUser(id1),
   *     loadUser(id2),
   *     loadUser(id3),
   *   ]);
   *   // result: Result<[User, User, User], LoadError>
   */
  async all<T, E>(
    promises: readonly Promise<Result<T, E>>[],
  ): Promise<Result<readonly T[], E>> {
    const results = await Promise.all(promises);
    const values: T[] = [];
    for (const result of results) {
      if (!result.ok) return result;
      values.push(result.value);
    }
    return Result.ok(values);
  },

  /**
   * Run multiple async Results in parallel. Wait for all to complete.
   * Returns separate arrays of successes and failures.
   *
   * Example:
   *   const result = await AsyncResult.allSettled([
   *     loadUser(id1),
   *     loadUser(id2),
   *     loadUser(id3),
   *   ]);
   *   // result: { successes: User[], failures: LoadError[] }
   */
  async allSettled<T, E>(
    promises: readonly Promise<Result<T, E>>[],
  ): Promise<{ successes: readonly T[]; failures: readonly E[] }> {
    const results = await Promise.all(promises);
    const successes: T[] = [];
    const failures: E[] = [];
    for (const result of results) {
      if (result.ok) {
        successes.push(result.value);
      } else {
        failures.push(result.error);
      }
    }
    return { successes, failures };
  },

  /**
   * Race multiple async Results. Return the first one that completes.
   * If the first completion is an error, that error is returned.
   *
   * Example:
   *   const result = await AsyncResult.race([
   *     loadFromCache(key),
   *     loadFromDatabase(key),
   *     loadFromAPI(key),
   *   ]);
   */
  async race<T, E>(
    promises: readonly Promise<Result<T, E>>[],
  ): Promise<Result<T, E>> {
    return await Promise.race(promises);
  },
};

// ============================================================================
// Pipeline Helpers (pre-TC39 |> bridge)
// ============================================================================

const PIPE_STAGE = Symbol.for("lfts.pipeline.stage");
const PIPE_TOKEN = Symbol.for("lfts.pipeline.token");

type PipelineMode = "value" | "result";

export interface StageMeta {
  readonly label?: string;
  readonly expectsResult: boolean;
}

export interface StageSnapshot {
  readonly index: number;
  readonly label?: string;
  readonly mode: PipelineMode;
  readonly status: "ok" | "err";
  readonly startedAt: number;
  readonly finishedAt: number;
  readonly durationMs: number;
  readonly error?: unknown;
}

type StageInvokeResult =
  | { readonly kind: "value"; readonly value: unknown }
  | { readonly kind: "result"; readonly result: Result<unknown, unknown> };

interface StageHandler {
  readonly meta: StageMeta;
  invoke(
    input: unknown,
    ctx: PipelineRunContext,
  ): Promise<StageInvokeResult>;
}

interface PipelineRunContext {
  readonly mode: PipelineMode;
}

interface PipelineAssemblyContext {
  readonly seed: () => Promise<unknown>;
  readonly stages: StageHandler[];
  snapshots: StageSnapshot[];
}

type PipelineRunOutcome = {
  readonly mode: PipelineMode;
  readonly result: Result<unknown, unknown>;
  readonly value: unknown;
  readonly snapshots: StageSnapshot[];
  readonly thrown?: unknown;
};

type TailParameters<Fn extends (input: any, ...args: any[]) => any> =
  Parameters<Fn> extends [any, ...infer Rest] ? Rest : never;

type StageInput<Fn extends (input: any, ...args: any[]) => any> =
  Parameters<Fn> extends [infer First, ...any[]] ? First : never;

type StageReturn<Fn extends (...args: any[]) => any> = Awaited<ReturnType<Fn>>;

type StageOutput<Fn extends (input: any, ...args: any[]) => any> =
  StageReturn<Fn> extends PipelineToken<infer Value, any> ? Value
    : StageReturn<Fn> extends Result<infer Value, any> ? Value
    : StageReturn<Fn>;

type StageError<Fn extends (input: any, ...args: any[]) => any> =
  StageReturn<Fn> extends Result<any, infer Err> ? Err : never;

interface PipeStageMarker<I, O, E> {
  readonly [PIPE_STAGE]: true;
  readonly meta: StageMeta;
  readonly label?: string;
}

type PipeStageCallable<Fn extends (input: any, ...args: any[]) => any> =
  TailParameters<Fn> extends []
    ? PipeStageMarker<StageInput<Fn>, StageOutput<Fn>, StageError<Fn>>
    : (
      ...args: TailParameters<Fn>
    ) => PipeStageMarker<StageInput<Fn>, StageOutput<Fn>, StageError<Fn>>;

export type PipeStage<Fn extends (input: any, ...args: any[]) => any> =
  & PipeStageCallable<Fn>
  & PipeStageMarker<StageInput<Fn>, StageOutput<Fn>, StageError<Fn>>;

type PipeableShape<T> = {
  [K in keyof T]: T[K] extends (input: infer I, ...args: infer R) => infer O ? (
      PipeStage<(input: I, ...args: R) => O>
    )
    : T[K];
};

const scheduleMicrotask: (cb: () => void) => void = typeof queueMicrotask ===
    "function"
  ? queueMicrotask.bind(globalThis)
  : (cb) => {
    Promise.resolve().then(cb);
  };

const now =
  typeof performance !== "undefined" && typeof performance.now === "function"
    ? () => performance.now()
    : () => Date.now();

let activePipelineContext: PipelineAssemblyContext | null = null;

export class PipelineExecutionError<E = unknown> extends Error {
  readonly error: E;
  readonly snapshots: readonly StageSnapshot[];

  constructor(message: string, error: E, snapshots: readonly StageSnapshot[]) {
    super(message);
    this.name = "PipelineExecutionError";
    this.error = error;
    this.snapshots = snapshots;
    if (error instanceof Error) {
      (this as any).cause = error;
    }
  }
}

export interface PipelineToken<T, E = never> {
  readonly [PIPE_TOKEN]: true;
  run(): Promise<T>;
  runResult(): Promise<Result<T, E>>;
  inspect(): readonly StageSnapshot[];
}

interface PipelineTokenInternalContext extends PipelineAssemblyContext {
  snapshots: StageSnapshot[];
}

class PipelineTokenImpl<T = unknown, E = unknown>
  implements PipelineToken<T, E> {
  readonly [PIPE_TOKEN] = true as const;

  constructor(private readonly ctx: PipelineTokenInternalContext) {}

  [Symbol.toPrimitive](): number {
    activePipelineContext = this.ctx;
    return 0;
  }

  async run(): Promise<T> {
    const outcome = await runPipeline(this.ctx);
    this.ctx.snapshots = outcome.snapshots;
    if ("thrown" in outcome && outcome.thrown !== undefined) {
      throw outcome.thrown;
    }
    if (outcome.mode === "result") {
      const typed = outcome.result as Result<T, E>;
      if (typed.ok) {
        return typed.value;
      }
      throw new PipelineExecutionError(
        "Pipeline produced a Result.err",
        typed.error,
        outcome.snapshots,
      );
    }
    return outcome.value as T;
  }

  async runResult(): Promise<Result<T, E>> {
    const outcome = await runPipeline(this.ctx);
    this.ctx.snapshots = outcome.snapshots;
    if ("thrown" in outcome && outcome.thrown !== undefined) {
      throw outcome.thrown;
    }
    if (outcome.mode === "result") {
      return outcome.result as Result<T, E>;
    }
    return Result.ok(outcome.value as T);
  }

  inspect(): readonly StageSnapshot[] {
    return this.ctx.snapshots;
  }
}

export interface AsPipeOptions {
  readonly label?: string;
  readonly expect?: "value" | "result";
}

export function asPipe<Fn extends (input: any, ...args: any[]) => any>(
  fn: Fn,
  options?: AsPipeOptions,
): PipeStage<Fn>;

export function asPipe<Shape extends Record<PropertyKey, unknown>>(
  object: Shape,
  options?: AsPipeOptions,
): PipeableShape<Shape>;

export function asPipe(
  fnOrObj: unknown,
  options?: AsPipeOptions,
): unknown {
  if (
    typeof fnOrObj === "object" && fnOrObj !== null &&
    typeof (fnOrObj as object) !== "function"
  ) {
    const proxied = new Proxy(fnOrObj as Record<PropertyKey, unknown>, {
      get(target, prop, receiver) {
        const value = Reflect.get(target, prop, receiver);
        if (typeof value === "function") {
          const bound = (value as (...args: unknown[]) => unknown).bind(
            target,
          );
          const label = options?.label ??
            (typeof prop === "string" ? prop : value.name || undefined);
          return asPipe(bound, { ...options, label });
        }
        return value;
      },
    });
    return proxied as PipeableShape<typeof fnOrObj>;
  }

  if (typeof fnOrObj !== "function") {
    throw new TypeError("asPipe expects a function or an object with methods");
  }

  return createStageProxy(
    fnOrObj as (input: any, ...args: any[]) => any,
    options ?? {},
  );
}

export function pipe<T>(value: T | Promise<T>): PipelineToken<T, never>;
export function pipe<T, E>(
  value: Result<T, E> | Promise<Result<T, E>>,
): PipelineToken<T, E>;
export function pipe(value: unknown): PipelineToken<unknown, unknown> {
  const ctx: PipelineTokenInternalContext = {
    seed: () => Promise.resolve(value),
    stages: [],
    snapshots: [],
  };
  const token = new PipelineTokenImpl(ctx);
  return token;
}

export function isPipelineToken(
  value: unknown,
): value is PipelineToken<unknown> {
  return typeof value === "object" && value !== null &&
    (value as PipelineToken<unknown>)[PIPE_TOKEN] === true;
}

function createStageProxy<
  Fn extends (input: any, ...args: any[]) => any,
>(
  fn: Fn,
  options: AsPipeOptions,
  boundArgs?: TailParameters<Fn>,
): PipeStage<Fn> {
  const label = options.label ?? (fn.name || undefined);
  const expectsResult = options.expect === "result";
  const target = function () {};

  const handler = {
    apply(
      _target: () => void,
      _thisArg: unknown,
      args: unknown[],
    ) {
      return createStageProxy(
        fn,
        options,
        args as TailParameters<Fn>,
      );
    },

    get(_: () => void, prop: PropertyKey) {
      if (prop === Symbol.toPrimitive) {
        return () => {
          const ctx = activePipelineContext;
          if (!ctx) {
            throw new Error(
              "pipe() must be on the left-hand side of a | expression.",
            );
          }
          const args = (boundArgs ?? []) as readonly unknown[];
          ctx.stages.push(createStageHandler(fn, args, {
            label,
            expectsResult,
          }));
          scheduleMicrotask(() => {
            if (activePipelineContext === ctx) {
              activePipelineContext = null;
            }
          });
          return 0;
        };
      }

      if (prop === PIPE_STAGE) return true;
      if (prop === "meta") {
        return {
          label,
          expectsResult,
        } satisfies StageMeta;
      }
      if (prop === "label") return label;
      return Reflect.get(fn, prop);
    },
  } satisfies ProxyHandler<() => void>;

  return new Proxy(target, handler) as unknown as PipeStage<Fn>;
}

function createStageHandler(
  fn: (input: unknown, ...args: unknown[]) => unknown,
  boundArgs: readonly unknown[],
  meta: StageMeta,
): StageHandler {
  return {
    meta,
    async invoke(input, ctx): Promise<StageInvokeResult> {
      const raw = await Promise.resolve(fn(input, ...boundArgs));
      return normalizeStageOutput(raw, ctx, meta.expectsResult);
    },
  };
}

async function normalizeStageOutput(
  raw: unknown,
  ctx: PipelineRunContext,
  expectsResult: boolean,
): Promise<StageInvokeResult> {
  if (isPipelineToken(raw)) {
    if (ctx.mode === "result") {
      return {
        kind: "result",
        result: await raw.runResult(),
      };
    }
    return {
      kind: "value",
      value: await raw.run(),
    };
  }

  if (expectsResult) {
    return { kind: "result", result: ensureResult(raw) };
  }

  if (isResultLike(raw)) {
    return { kind: "result", result: raw };
  }

  return { kind: "value", value: raw };
}

function ensureResult<T, E = never>(
  value: T | Result<T, E>,
): Result<T, E> {
  return isResultLike(value) ? value : Result.ok(value);
}

function isResultLike(value: unknown): value is Result<unknown, unknown> {
  if (typeof value !== "object" || value === null) return false;
  if (!("ok" in value)) return false;
  const ok = (value as Record<string, unknown>).ok;
  return typeof ok === "boolean" &&
    (ok ? "value" in value : "error" in value);
}

async function runPipeline(
  ctx: PipelineTokenInternalContext,
): Promise<PipelineRunOutcome> {
  const snapshots: StageSnapshot[] = [];
  let mode: PipelineMode = "value";
  let currentValue: unknown;
  let currentResult: Result<unknown, unknown> | null = null;

  const resolvedSeed = await ctx.seed();
  if (isResultLike(resolvedSeed)) {
    mode = "result";
    currentResult = resolvedSeed;
    if (!resolvedSeed.ok) {
      return {
        mode,
        result: resolvedSeed,
        value: undefined,
        snapshots,
      };
    }
    currentValue = resolvedSeed.value;
  } else {
    currentValue = resolvedSeed;
  }

  for (let index = 0; index < ctx.stages.length; index++) {
    const stage = ctx.stages[index];
    const startedAt = now();
    let status: "ok" | "err" = "ok";
    let errorValue: unknown;
    try {
      const output = await stage.invoke(currentValue, { mode });
      if (output.kind === "result") {
        mode = "result";
        currentResult = output.result;
        if (!output.result.ok) {
          status = "err";
          errorValue = output.result.error;
          snapshots.push(
            createSnapshot(
              stage.meta,
              index,
              startedAt,
              status,
              mode,
              errorValue,
            ),
          );
          return {
            mode,
            result: output.result,
            value: undefined,
            snapshots,
          };
        }
        currentValue = output.result.value;
      } else {
        currentValue = output.value;
        if (mode === "result") {
          currentResult = Result.ok(currentValue);
        }
      }
    } catch (err) {
      status = "err";
      errorValue = err;
      snapshots.push(
        createSnapshot(stage.meta, index, startedAt, status, mode, errorValue),
      );
      if (mode === "result") {
        return {
          mode,
          result: Result.err(err),
          value: undefined,
          snapshots,
        };
      }
      return {
        mode,
        result: Result.err(err),
        value: undefined,
        snapshots,
        thrown: err,
      };
    }
    snapshots.push(
      createSnapshot(stage.meta, index, startedAt, status, mode, errorValue),
    );
  }

  if (mode === "result") {
    const finalResult = currentResult ?? Result.ok(currentValue);
    return {
      mode,
      result: finalResult,
      value: finalResult.ok ? finalResult.value : undefined,
      snapshots,
    };
  }

  return {
    mode,
    result: Result.ok(currentValue),
    value: currentValue,
    snapshots,
  };
}

function createSnapshot(
  meta: StageMeta,
  index: number,
  startedAt: number,
  status: "ok" | "err",
  mode: PipelineMode,
  errorValue: unknown,
): StageSnapshot {
  const finishedAt = now();
  return {
    index,
    label: meta.label,
    mode,
    status,
    startedAt,
    finishedAt,
    durationMs: finishedAt - startedAt,
    error: status === "err" ? errorValue : undefined,
  };
}

// ============================================================================
// Phase 1.2: Runtime Introspection Hooks
// ============================================================================

/**
 * Metadata extracted from a schema with introspection support.
 */
export type SchemaMetadata = {
  readonly name?: string;
  readonly source?: string;
};

/**
 * Introspection context provided to hook callbacks.
 * Allows observing validation events without mutating data.
 */
export type InspectionContext<T> = {
  readonly schemaName?: string;
  readonly schemaSource?: string;

  /**
   * Register a callback to be invoked when validation fails.
   * Receives the validation error details.
   */
  onFailure: (callback: (error: ValidationError) => void) => void;

  /**
   * Register a callback to be invoked when validation succeeds.
   * Receives the validated value (snapshot, not the actual value).
   */
  onSuccess: (callback: (value: T) => void) => void;
};

/**
 * Schema wrapper with introspection support.
 * Provides the same validation API with added observability hooks.
 */
export type InspectableSchema<T> = {
  readonly schema: TypeObject;
  readonly metadata: SchemaMetadata;

  /**
   * Validate with Result-based error handling.
   */
  validate: (value: unknown) => Result<T, ValidationError>;

  /**
   * Validate with throwing behavior.
   */
  validateUnsafe: (value: unknown) => T;

  /**
   * Validate and collect all errors (up to maxErrors).
   */
  validateAll: (value: unknown, maxErrors?: number) => ValidationResult<T>;
};

/**
 * Extract metadata from a schema if it has a METADATA wrapper.
 * Returns null if no metadata is present.
 */
function extractMetadata(schema: TypeObject): SchemaMetadata | null {
  if (!Array.isArray(schema) || schema.length < 2) return null;
  if (schema[0] !== Op.METADATA) return null;
  return schema[1] as SchemaMetadata;
}

/**
 * Unwrap METADATA wrapper to get the inner schema.
 */
function unwrapMetadata(schema: TypeObject): any[] {
  if (!Array.isArray(schema) || schema.length < 3) return schema as any[];
  if (schema[0] !== Op.METADATA) return schema as any[];
  return schema[2] as any[];
}

/**
 * Create an inspectable schema wrapper with observability hooks.
 *
 * @param schema - The bytecode schema (may have METADATA wrapper)
 * @param configure - Optional configuration function to register hooks
 * @returns InspectableSchema with validation methods
 *
 * @example
 * ```ts
 * const OrderSchema = inspect(Order$, (ctx) => {
 *   ctx.onFailure((error) => {
 *     logger.warn('Order validation failed', {
 *       schema: ctx.schemaName,
 *       error
 *     });
 *   });
 * });
 *
 * const result = OrderSchema.validate(data);
 * ```
 */
export function inspect<T>(
  schema: TypeObject,
  configure?: (ctx: InspectionContext<T>) => void,
): InspectableSchema<T> {
  const metadata = extractMetadata(schema) || {};
  const innerSchema = unwrapMetadata(schema);

  // Hook storage
  const onSuccessCallbacks: Array<(value: T) => void> = [];
  const onFailureCallbacks: Array<(error: ValidationError) => void> = [];

  // Build context object
  const context: InspectionContext<T> = {
    schemaName: metadata.name,
    schemaSource: metadata.source,
    onSuccess: (callback) => {
      onSuccessCallbacks.push(callback);
    },
    onFailure: (callback) => {
      onFailureCallbacks.push(callback);
    },
  };

  // Allow user to configure hooks
  if (configure) {
    configure(context);
  }

  // Helper to trigger success hooks
  const triggerSuccess = (value: T) => {
    for (const callback of onSuccessCallbacks) {
      try {
        callback(value);
      } catch (err) {
        // Swallow hook errors to prevent breaking validation flow
        console.error("Introspection hook error (onSuccess):", err);
      }
    }
  };

  // Helper to trigger failure hooks
  const triggerFailure = (error: ValidationError) => {
    for (const callback of onFailureCallbacks) {
      try {
        callback(error);
      } catch (err) {
        // Swallow hook errors to prevent breaking validation flow
        console.error("Introspection hook error (onFailure):", err);
      }
    }
  };

  return {
    schema: innerSchema,
    metadata,

    validate: (value: unknown): Result<T, ValidationError> => {
      const result = validateSafe<T>(innerSchema, value);
      if (result.ok) {
        triggerSuccess(result.value);
      } else {
        triggerFailure(result.error);
      }
      return result;
    },

    validateUnsafe: (value: unknown): T => {
      try {
        const validated = validate(innerSchema, value) as T;
        triggerSuccess(validated);
        return validated;
      } catch (err) {
        // Convert error to ValidationError and trigger hook
        // The error from validate() is a regular Error with "path: message" format
        if (err instanceof Error && err.name === "ValidationError") {
          // Parse "path: message" format from fullMessage
          // If no colon, path is empty and message is the whole thing
          const match = err.message.match(/^([^:]*): (.*)$/);
          const error: ValidationError = match
            ? { path: match[1], message: match[2] }
            : { path: "", message: err.message };
          triggerFailure(error);
        }
        throw err;
      }
    },

    validateAll: (value: unknown, maxErrors = 100): ValidationResult<T> => {
      const result = validateAll<T>(innerSchema, value, maxErrors);
      if (result.ok) {
        triggerSuccess(result.value);
      } else if (result.errors.length > 0) {
        // Trigger failure hook with first error for simplicity
        triggerFailure(result.errors[0]);
      }
      return result;
    },
  };
}

/**
 * Attach metadata to a schema for introspection.
 * This is typically used by the compiler, but can be used manually.
 *
 * @param schema - The bytecode schema
 * @param metadata - Schema metadata (name, source location, etc.)
 * @returns Schema wrapped with metadata
 *
 * @example
 * ```ts
 * const User$ = withMetadata(userSchema, {
 *   name: 'User',
 *   source: 'src/types/user.schema.ts'
 * });
 * ```
 */
export function withMetadata(
  schema: TypeObject,
  metadata: SchemaMetadata,
): TypeObject {
  return [Op.METADATA, metadata, schema];
}

// ============================================================================
// Port Validation (Phase 2)
// ============================================================================

/**
 * Port validation error type.
 */
export type PortValidationError =
  | { readonly type: "not_object"; readonly message: string }
  | {
    readonly type: "missing_method";
    readonly methodName: string;
    readonly message: string;
  }
  | {
    readonly type: "wrong_type";
    readonly methodName: string;
    readonly message: string;
  }
  | {
    readonly type: "wrong_arity";
    readonly methodName: string;
    readonly expected: number;
    readonly actual: number;
    readonly message: string;
  };

/**
 * Validate that an implementation conforms to a port interface schema.
 *
 * This function checks that:
 * 1. The implementation is an object
 * 2. All required methods exist
 * 3. All methods are functions
 * 4. All methods have the correct arity (parameter count)
 *
 * Note: This performs structural validation only. It does NOT validate:
 * - Parameter types (runtime type checking is expensive and often impractical)
 * - Return types (would require calling the function)
 * - Method behavior/correctness
 *
 * For full type safety, rely on TypeScript's compile-time checking.
 * Use this function for runtime contract verification (e.g., plugin systems,
 * dependency injection containers, testing).
 *
 * @param portSchema - The bytecode schema for the port (Op.PORT)
 * @param impl - The implementation to validate
 * @returns Result with the validated implementation or an error
 *
 * @example
 * ```ts
 * interface StoragePort {
 *   load(key: string): Promise<Result<Data, Error>>;
 *   save(key: string, data: Data): Promise<Result<void, Error>>;
 * }
 *
 * // Port schema generated by compiler (or manual)
 * const StoragePort$ = enc.port("StoragePort", [
 *   { name: "load", params: [enc.str()], returnType: enc.obj([]) },
 *   { name: "save", params: [enc.str(), enc.obj([])], returnType: enc.obj([]) }
 * ]);
 *
 * const impl = {
 *   load: async (key: string) => { ... },
 *   save: async (key: string, data: Data) => { ... }
 * };
 *
 * const result = validatePort(StoragePort$, impl);
 * if (result.ok) {
 *   // Use impl with confidence
 *   const storage: StoragePort = result.value;
 * }
 * ```
 */
export function validatePort<T>(
  portSchema: TypeObject,
  impl: unknown,
): Result<T, PortValidationError> {
  // Ensure schema is a PORT opcode
  if (!isBC(portSchema) || portSchema[0] !== Op.PORT) {
    return Result.err({
      type: "not_object",
      message: "Schema is not a PORT bytecode",
    });
  }

  // Check that impl is an object
  if (typeof impl !== "object" || impl === null) {
    return Result.err({
      type: "not_object",
      message: `Expected object, got ${typeof impl}`,
    });
  }

  const portName = portSchema[1] as string;
  const methodCount = portSchema[2] as number;

  // Parse method definitions from bytecode
  // Format: [Op.PORT, name, count, Op.PORT_METHOD, name1, paramCount1, ...params1, return1, ...]
  let offset = 3;
  for (let i = 0; i < methodCount; i++) {
    if (portSchema[offset] !== Op.PORT_METHOD) {
      return Result.err({
        type: "not_object",
        message: `Invalid PORT bytecode: expected PORT_METHOD at offset ${offset}`,
      });
    }

    const methodName = portSchema[offset + 1] as string;
    const paramCount = portSchema[offset + 2] as number;

    // Check if method exists on impl
    const method = (impl as any)[methodName];
    if (method === undefined) {
      return Result.err({
        type: "missing_method",
        methodName,
        message: `Port ${portName} requires method '${methodName}', but it is missing`,
      });
    }

    // Check if method is a function
    if (typeof method !== "function") {
      return Result.err({
        type: "wrong_type",
        methodName,
        message:
          `Port ${portName} method '${methodName}' must be a function, got ${typeof method}`,
      });
    }

    // Check arity (parameter count)
    // Note: JavaScript function.length gives the number of named parameters
    // This won't catch rest parameters or optional parameters correctly,
    // but it's a reasonable structural check
    if (method.length !== paramCount) {
      return Result.err({
        type: "wrong_arity",
        methodName,
        expected: paramCount,
        actual: method.length,
        message:
          `Port ${portName} method '${methodName}' expects ${paramCount} parameter(s), but implementation has ${method.length}`,
      });
    }

    // Move offset past this method definition
    // PORT_METHOD + name + paramCount + params + returnType
    offset += 3 + paramCount + 1;
  }

  // All checks passed
  return Result.ok(impl as T);
}

/**
 * Extract port name from a PORT bytecode schema.
 * Useful for error messages and debugging.
 *
 * @param portSchema - The PORT bytecode schema
 * @returns The port name, or undefined if not a valid PORT schema
 */
export function getPortName(portSchema: TypeObject): string | undefined {
  if (!isBC(portSchema) || portSchema[0] !== Op.PORT) {
    return undefined;
  }
  return portSchema[1] as string;
}

/**
 * Extract method names from a PORT bytecode schema.
 * Useful for introspection and debugging.
 *
 * @param portSchema - The PORT bytecode schema
 * @returns Array of method names, or empty array if not a valid PORT schema
 */
export function getPortMethods(portSchema: TypeObject): string[] {
  if (!isBC(portSchema) || portSchema[0] !== Op.PORT) {
    return [];
  }

  const methodCount = portSchema[2] as number;
  const methods: string[] = [];

  let offset = 3;
  for (let i = 0; i < methodCount; i++) {
    if (portSchema[offset] !== Op.PORT_METHOD) break;

    const methodName = portSchema[offset + 1] as string;
    const paramCount = portSchema[offset + 2] as number;
    methods.push(methodName);

    // Move to next method
    offset += 3 + paramCount + 1;
  }

  return methods;
}
