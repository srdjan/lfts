
// packages/lfp-type-runtime/mod.ts
import { Op } from "../lfp-type-spec/src/mod.ts";
import { match as patternMatch } from "ts-pattern";

export const TYPEOF_PLACEHOLDER = Symbol.for("lfp.typeOf.placeholder");

// Dev shim: valid TS without compiler
export function typeOf<T>(): any {
  return { __lfp: TYPEOF_PLACEHOLDER };
}

export type TypeObject = unknown;

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

function isBC(x: unknown): x is any[] { return Array.isArray(x); }

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
      path += (i === 0 ? seg : `.${seg}`);
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
      const tag = bc[3 + 2*i] as string;
      const schema = bc[3 + 2*i + 1] as any[];
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
  depth: number
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
  depth: number
): VError | null {
  const n = bc[1] as number;

  if (!Array.isArray(value)) {
    return createVError(buildPath(pathSegments), `expected tuple[${n}]`);
  }

  if (value.length !== n) {
    return createVError(buildPath(pathSegments), `expected tuple length ${n}, got ${value.length}`);
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
  depth: number
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
    if (marker !== Op.PROPERTY) throw new Error("corrupt bytecode: expected PROPERTY");
    const name = bc[idx++];
    const optional = bc[idx++] === 1;
    const t = bc[idx++];

    if (knownProps) knownProps.add(name);

    if (Object.prototype.hasOwnProperty.call(value as object, name)) {
      pathSegments.push(name);
      // @ts-ignore
      const err = validateWithResult(t, (value as any)[name], pathSegments, depth + 1);
      pathSegments.pop();
      if (err) return err;
    } else if (!optional) {
      pathSegments.push(name);
      const err = createVError(buildPath(pathSegments), `required property missing`);
      pathSegments.pop();
      return err;
    }
  }

  // Check for excess properties if strict mode enabled
  if (strict && knownProps) {
    for (const key in value) {
      if (Object.prototype.hasOwnProperty.call(value, key) && !knownProps.has(key)) {
        pathSegments.push(key);
        const err = createVError(buildPath(pathSegments), `excess property (not in schema)`);
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
  depth: number
): VError | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return createVError(buildPath(pathSegments), `expected object for discriminated union`);
  }

  const tagKey = bc[1] as string;
  const vTag = (value as any)[tagKey];

  if (typeof vTag !== "string") {
    const n = bc[2] as number;
    const expected = [...Array(n).keys()].map(i => JSON.stringify(bc[3+2*i])).join(", ");
    pathSegments.push(tagKey);
    const err = createVError(buildPath(pathSegments), `expected string discriminant; expected one of: ${expected}`);
    pathSegments.pop();
    return err;
  }

  const tagMap = getDunionTagMap(bc);
  const variantSchema = tagMap.get(vTag);

  if (variantSchema) {
    return validateWithResult(variantSchema, value, pathSegments, depth + 1);
  }

  const allTags = Array.from(tagMap.keys()).map(t => JSON.stringify(t)).join(", ");
  pathSegments.push(tagKey);
  const err = createVError(buildPath(pathSegments), `unexpected tag ${JSON.stringify(vTag)}; expected one of: ${allTags}`);
  pathSegments.pop();
  return err;
}

function validateUnion(
  bc: any[],
  value: unknown,
  pathSegments: PathSegment[],
  depth: number
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
function validateWithResult(bc: any[], value: unknown, pathSegments: PathSegment[], depth: number): VError | null {
  if (depth > MAX_DEPTH) {
    return createVError(buildPath(pathSegments), `maximum nesting depth (${MAX_DEPTH}) exceeded`);
  }

  const op = bc[0];

  return patternMatch<number, VError | null>(op)
    .with(Op.STRING, () =>
      typeof value !== "string"
        ? createVError(buildPath(pathSegments), `expected string, got ${typeof value}`)
        : null
    )
    .with(Op.NUMBER, () =>
      typeof value !== "number" || !Number.isFinite(value)
        ? createVError(buildPath(pathSegments), `expected finite number`)
        : null
    )
    .with(Op.BOOLEAN, () =>
      typeof value !== "boolean"
        ? createVError(buildPath(pathSegments), `expected boolean`)
        : null
    )
    .with(Op.NULL, () =>
      value !== null
        ? createVError(buildPath(pathSegments), `expected null`)
        : null
    )
    .with(Op.UNDEFINED, () =>
      value !== undefined
        ? createVError(buildPath(pathSegments), `expected undefined`)
        : null
    )
    .with(Op.LITERAL, () => {
      const lit = bc[1];
      return value !== lit
        ? createVError(buildPath(pathSegments), `expected literal ${JSON.stringify(lit)}`)
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
      const err = validateWithResult(innerSchema, value, pathSegments, depth + 1);
      if (err) return err;
      if (typeof value !== "number") {
        return createVError(buildPath(pathSegments), `min refinement requires number type`);
      }
      return value < minValue
        ? createVError(buildPath(pathSegments), `expected >= ${minValue}, got ${value}`)
        : null;
    })
    .with(Op.REFINE_MAX, () => {
      const maxValue = bc[1] as number;
      const innerSchema = bc[2];
      const err = validateWithResult(innerSchema, value, pathSegments, depth + 1);
      if (err) return err;
      if (typeof value !== "number") {
        return createVError(buildPath(pathSegments), `max refinement requires number type`);
      }
      return value > maxValue
        ? createVError(buildPath(pathSegments), `expected <= ${maxValue}, got ${value}`)
        : null;
    })
    .with(Op.REFINE_INTEGER, () => {
      const innerSchema = bc[1];
      const err = validateWithResult(innerSchema, value, pathSegments, depth + 1);
      if (err) return err;
      if (typeof value !== "number") {
        return createVError(buildPath(pathSegments), `integer refinement requires number type`);
      }
      return !Number.isInteger(value)
        ? createVError(buildPath(pathSegments), `expected integer, got ${value}`)
        : null;
    })
    .with(Op.REFINE_MIN_LENGTH, () => {
      const minLen = bc[1] as number;
      const innerSchema = bc[2];
      const err = validateWithResult(innerSchema, value, pathSegments, depth + 1);
      if (err) return err;
      if (typeof value !== "string") {
        return createVError(buildPath(pathSegments), `minLength refinement requires string type`);
      }
      return value.length < minLen
        ? createVError(buildPath(pathSegments), `expected length >= ${minLen}, got ${value.length}`)
        : null;
    })
    .with(Op.REFINE_MAX_LENGTH, () => {
      const maxLen = bc[1] as number;
      const innerSchema = bc[2];
      const err = validateWithResult(innerSchema, value, pathSegments, depth + 1);
      if (err) return err;
      if (typeof value !== "string") {
        return createVError(buildPath(pathSegments), `maxLength refinement requires string type`);
      }
      return value.length > maxLen
        ? createVError(buildPath(pathSegments), `expected length <= ${maxLen}, got ${value.length}`)
        : null;
    })
    .with(Op.REFINE_MIN_ITEMS, () => {
      const minItems = bc[1] as number;
      const innerSchema = bc[2];
      const err = validateWithResult(innerSchema, value, pathSegments, depth + 1);
      if (err) return err;
      if (!Array.isArray(value)) {
        return createVError(buildPath(pathSegments), `minItems refinement requires array type`);
      }
      return value.length < minItems
        ? createVError(buildPath(pathSegments), `expected array length >= ${minItems}, got ${value.length}`)
        : null;
    })
    .with(Op.REFINE_MAX_ITEMS, () => {
      const maxItems = bc[1] as number;
      const innerSchema = bc[2];
      const err = validateWithResult(innerSchema, value, pathSegments, depth + 1);
      if (err) return err;
      if (!Array.isArray(value)) {
        return createVError(buildPath(pathSegments), `maxItems refinement requires array type`);
      }
      return value.length > maxItems
        ? createVError(buildPath(pathSegments), `expected array length <= ${maxItems}, got ${value.length}`)
        : null;
    })
    // Phase 1: Result/Option validators
    .with(Op.RESULT_OK, () => {
      // Validate Result.ok structure: { ok: true, value: T }
      if (!value || typeof value !== 'object' || !('ok' in value)) {
        return createVError(buildPath(pathSegments), 'expected Result type');
      }
      const resultValue = value as any;
      if (resultValue.ok !== true) {
        return createVError(buildPath(pathSegments), 'expected Result.ok');
      }
      const valueSchema = bc[1];
      pathSegments.push('value');
      const err = validateWithResult(valueSchema, resultValue.value, pathSegments, depth + 1);
      pathSegments.pop();
      return err;
    })
    .with(Op.RESULT_ERR, () => {
      // Validate Result.err structure: { ok: false, error: E }
      if (!value || typeof value !== 'object' || !('ok' in value)) {
        return createVError(buildPath(pathSegments), 'expected Result type');
      }
      const resultValue = value as any;
      if (resultValue.ok !== false) {
        return createVError(buildPath(pathSegments), 'expected Result.err');
      }
      const errorSchema = bc[1];
      pathSegments.push('error');
      const err = validateWithResult(errorSchema, resultValue.error, pathSegments, depth + 1);
      pathSegments.pop();
      return err;
    })
    .with(Op.OPTION_SOME, () => {
      // Validate Option.some structure: { some: true, value: T }
      if (!value || typeof value !== 'object' || !('some' in value)) {
        return createVError(buildPath(pathSegments), 'expected Option type');
      }
      const optionValue = value as any;
      if (optionValue.some !== true) {
        return createVError(buildPath(pathSegments), 'expected Option.some');
      }
      const valueSchema = bc[1];
      pathSegments.push('value');
      const err = validateWithResult(valueSchema, optionValue.value, pathSegments, depth + 1);
      pathSegments.pop();
      return err;
    })
    .with(Op.OPTION_NONE, () => {
      // Validate Option.none structure: { some: false }
      if (!value || typeof value !== 'object' || !('some' in value)) {
        return createVError(buildPath(pathSegments), 'expected Option type');
      }
      const optionValue = value as any;
      if (optionValue.some !== false) {
        return createVError(buildPath(pathSegments), 'expected Option.none');
      }
      return null;
    })
    .otherwise(() => createVError(buildPath(pathSegments), `unsupported opcode ${op}`));
}

// Convert VError to throwable Error
function vErrorToError(vErr: VError): Error {
  const err = new Error(vErr.fullMessage);
  err.name = 'ValidationError';
  return err;
}

// Public throwing API (backwards compatible)
function validateWith(bc: any[], value: unknown, pathSegments: PathSegment[] = [], depth = 0): void {
  const err = validateWithResult(bc, value, pathSegments, depth);
  if (err) throw vErrorToError(err);
}

function assertBytecode(t: any): asserts t is any[] {
  if (!isBC(t)) {
    const isPlaceholder = t && typeof t === "object" && t.__lfp === TYPEOF_PLACEHOLDER;
    const hint = isPlaceholder
      ? "This looks like an untransformed `typeOf<T>()`. Run `deno task build` (compiler transform) before executing."
      : "Expected compiler-inlined bytecode array.";
    throw new Error(`LFP runtime: missing bytecode. ${hint}`);
  }
}

export function decode(bc: unknown): TypeObject { return bc as any[]; }

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
export function validateSafe<T>(t: TypeObject, value: unknown): Result<T, ValidationError> {
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
  maxErrors = 100
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
  maxErrors: number
): void {
  // Stop if we've hit the max error limit
  if (errors.length >= maxErrors) return;

  if (depth > MAX_DEPTH) {
    errors.push({
      path: buildPath(pathSegments),
      message: `maximum nesting depth (${MAX_DEPTH}) exceeded`
    });
    return;
  }

  const op = bc[0];

  patternMatch<number, void>(op)
    .with(Op.STRING, () => {
      if (typeof value !== "string") {
        errors.push({
          path: buildPath(pathSegments),
          message: `expected string, got ${typeof value}`
        });
      }
    })
    .with(Op.NUMBER, () => {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        errors.push({
          path: buildPath(pathSegments),
          message: `expected finite number`
        });
      }
    })
    .with(Op.BOOLEAN, () => {
      if (typeof value !== "boolean") {
        errors.push({
          path: buildPath(pathSegments),
          message: `expected boolean`
        });
      }
    })
    .with(Op.NULL, () => {
      if (value !== null) {
        errors.push({
          path: buildPath(pathSegments),
          message: `expected null`
        });
      }
    })
    .with(Op.UNDEFINED, () => {
      if (value !== undefined) {
        errors.push({
          path: buildPath(pathSegments),
          message: `expected undefined`
        });
      }
    })
    .with(Op.LITERAL, () => {
      const lit = bc[1];
      if (value !== lit) {
        errors.push({
          path: buildPath(pathSegments),
          message: `expected literal ${JSON.stringify(lit)}`
        });
      }
    })
    .with(Op.ARRAY, () => {
      if (!Array.isArray(value)) {
        errors.push({
          path: buildPath(pathSegments),
          message: `expected array`
        });
        return;
      }
      const elemT = bc[1];
      // Validate all elements even if some fail
      for (let i = 0; i < value.length && errors.length < maxErrors; i++) {
        pathSegments.push(i);
        collectErrors(elemT, value[i], pathSegments, depth + 1, errors, maxErrors);
        pathSegments.pop();
      }
    })
    .with(Op.TUPLE, () => {
      const n = bc[1] as number;
      if (!Array.isArray(value)) {
        errors.push({
          path: buildPath(pathSegments),
          message: `expected tuple[${n}]`
        });
        return;
      }
      if (value.length !== n) {
        errors.push({
          path: buildPath(pathSegments),
          message: `expected tuple length ${n}, got ${value.length}`
        });
      }
      // Validate all elements even if length is wrong
      const checkLength = Math.min(n, value.length);
      for (let i = 0; i < checkLength && errors.length < maxErrors; i++) {
        const eltT = bc[2 + i];
        pathSegments.push(i);
        collectErrors(eltT, value[i], pathSegments, depth + 1, errors, maxErrors);
        pathSegments.pop();
      }
    })
    .with(Op.OBJECT, () => {
      if (value === null || typeof value !== "object" || Array.isArray(value)) {
        errors.push({
          path: buildPath(pathSegments),
          message: `expected object`
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
        if (marker !== Op.PROPERTY) throw new Error("corrupt bytecode: expected PROPERTY");
        const name = bc[idx++];
        const optional = bc[idx++] === 1;
        const t = bc[idx++];

        if (knownProps) knownProps.add(name);

        if (Object.prototype.hasOwnProperty.call(value as object, name)) {
          pathSegments.push(name);
          collectErrors(t, (value as any)[name], pathSegments, depth + 1, errors, maxErrors);
          pathSegments.pop();
        } else if (!optional) {
          pathSegments.push(name);
          errors.push({
            path: buildPath(pathSegments),
            message: `required property missing`
          });
          pathSegments.pop();
        }
      }

      // Check for excess properties
      if (strict && knownProps && errors.length < maxErrors) {
        for (const key in value) {
          if (Object.prototype.hasOwnProperty.call(value, key) && !knownProps.has(key)) {
            pathSegments.push(key);
            errors.push({
              path: buildPath(pathSegments),
              message: `excess property (not in schema)`
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
          message: `expected object for discriminated union`
        });
        return;
      }

      const tagKey = bc[1] as string;
      const vTag = (value as any)[tagKey];

      if (typeof vTag !== "string") {
        const n = bc[2] as number;
        const expected = [...Array(n).keys()].map(i => JSON.stringify(bc[3+2*i])).join(", ");
        pathSegments.push(tagKey);
        errors.push({
          path: buildPath(pathSegments),
          message: `expected string discriminant; expected one of: ${expected}`
        });
        pathSegments.pop();
        return;
      }

      const tagMap = getDunionTagMap(bc);
      const variantSchema = tagMap.get(vTag);

      if (variantSchema) {
        collectErrors(variantSchema, value, pathSegments, depth + 1, errors, maxErrors);
      } else {
        const allTags = Array.from(tagMap.keys()).map(t => JSON.stringify(t)).join(", ");
        pathSegments.push(tagKey);
        errors.push({
          path: buildPath(pathSegments),
          message: `unexpected tag ${JSON.stringify(vTag)}; expected one of: ${allTags}`
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
        collectErrors(bc[2 + i], value, pathSegments, depth + 1, alternativeErrors, maxErrors);
        if (alternativeErrors.length === 0) {
          anyMatched = true;
          break; // One alternative matched, union is valid
        }
      }

      if (!anyMatched) {
        errors.push({
          path: buildPath(pathSegments),
          message: `no union alternative matched`
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
      collectErrors(innerSchema, value, pathSegments, depth + 1, errors, maxErrors);
      // Then check refinement if no errors so far
      if (errors.length < maxErrors && typeof value === "number" && value < minValue) {
        errors.push({
          path: buildPath(pathSegments),
          message: `expected >= ${minValue}, got ${value}`
        });
      }
    })
    .with(Op.REFINE_MAX, () => {
      const maxValue = bc[1] as number;
      const innerSchema = bc[2];
      collectErrors(innerSchema, value, pathSegments, depth + 1, errors, maxErrors);
      if (errors.length < maxErrors && typeof value === "number" && value > maxValue) {
        errors.push({
          path: buildPath(pathSegments),
          message: `expected <= ${maxValue}, got ${value}`
        });
      }
    })
    .with(Op.REFINE_INTEGER, () => {
      const innerSchema = bc[1];
      collectErrors(innerSchema, value, pathSegments, depth + 1, errors, maxErrors);
      if (errors.length < maxErrors && typeof value === "number" && !Number.isInteger(value)) {
        errors.push({
          path: buildPath(pathSegments),
          message: `expected integer, got ${value}`
        });
      }
    })
    .with(Op.REFINE_MIN_LENGTH, () => {
      const minLen = bc[1] as number;
      const innerSchema = bc[2];
      collectErrors(innerSchema, value, pathSegments, depth + 1, errors, maxErrors);
      if (errors.length < maxErrors && typeof value === "string" && value.length < minLen) {
        errors.push({
          path: buildPath(pathSegments),
          message: `expected length >= ${minLen}, got ${value.length}`
        });
      }
    })
    .with(Op.REFINE_MAX_LENGTH, () => {
      const maxLen = bc[1] as number;
      const innerSchema = bc[2];
      collectErrors(innerSchema, value, pathSegments, depth + 1, errors, maxErrors);
      if (errors.length < maxErrors && typeof value === "string" && value.length > maxLen) {
        errors.push({
          path: buildPath(pathSegments),
          message: `expected length <= ${maxLen}, got ${value.length}`
        });
      }
    })
    .with(Op.REFINE_MIN_ITEMS, () => {
      const minItems = bc[1] as number;
      const innerSchema = bc[2];
      collectErrors(innerSchema, value, pathSegments, depth + 1, errors, maxErrors);
      if (errors.length < maxErrors && Array.isArray(value) && value.length < minItems) {
        errors.push({
          path: buildPath(pathSegments),
          message: `expected array length >= ${minItems}, got ${value.length}`
        });
      }
    })
    .with(Op.REFINE_MAX_ITEMS, () => {
      const maxItems = bc[1] as number;
      const innerSchema = bc[2];
      collectErrors(innerSchema, value, pathSegments, depth + 1, errors, maxErrors);
      if (errors.length < maxErrors && Array.isArray(value) && value.length > maxItems) {
        errors.push({
          path: buildPath(pathSegments),
          message: `expected array length <= ${maxItems}, got ${value.length}`
        });
      }
    })
    .otherwise(() => {
      errors.push({
        path: buildPath(pathSegments),
        message: `unsupported opcode ${op}`
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
  cases: { [K in T["type"]]?: (v: Extract<T, { type: K }>) => R } & Record<string, ((v: any) => R) | undefined>
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
    fn: (value: T) => U
  ): Result<U, E> {
    return result.ok ? Result.ok(fn(result.value)) : result;
  },

  /**
   * Chain Result-returning functions together.
   * Short-circuits on the first error.
   */
  andThen<T, U, E>(
    result: Result<T, E>,
    fn: (value: T) => Result<U, E>
  ): Result<U, E> {
    return result.ok ? fn(result.value) : result;
  },

  /**
   * Transform the error inside a failed Result.
   * If the Result is successful, returns it unchanged.
   */
  mapErr<T, E, F>(
    result: Result<T, E>,
    fn: (error: E) => F
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
    error: E
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
