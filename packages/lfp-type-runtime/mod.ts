
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

// Validation error with path context
export type ValidationError = {
  readonly path: string;
  readonly message: string;
};

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
      const inner = bc[1];
      return validateWithResult(inner, value, pathSegments, depth + 1);
    })
    .with(Op.BRAND, () => {
      const _tag = bc[1];
      const inner = bc[2];
      return validateWithResult(inner, value, pathSegments, depth + 1);
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
