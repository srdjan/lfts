
// packages/lfp-type-runtime/mod.ts
import { Op } from "../lfp-type-spec/src/mod.ts";

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

class VError extends Error {
  constructor(public readonly path: string, msg: string) {
    super(path ? `${path}: ${msg}` : msg);
    this.name = 'ValidationError';
  }
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

// Internal validation that returns error instead of throwing (for UNION optimization)
function validateWithResult(bc: any[], value: unknown, pathSegments: PathSegment[], depth: number): VError | null {
  if (depth > MAX_DEPTH) {
    return new VError(buildPath(pathSegments), `maximum nesting depth (${MAX_DEPTH}) exceeded`);
  }

  const op = bc[0];
  switch (op) {
    case Op.STRING:
      if (typeof value !== "string") return new VError(buildPath(pathSegments), `expected string, got ${typeof value}`);
      return null;
    case Op.NUMBER:
      if (typeof value !== "number" || !Number.isFinite(value)) return new VError(buildPath(pathSegments), `expected finite number`);
      return null;
    case Op.BOOLEAN:
      if (typeof value !== "boolean") return new VError(buildPath(pathSegments), `expected boolean`);
      return null;
    case Op.NULL:
      if (value !== null) return new VError(buildPath(pathSegments), `expected null`);
      return null;
    case Op.UNDEFINED:
      if (value !== undefined) return new VError(buildPath(pathSegments), `expected undefined`);
      return null;
    case Op.LITERAL: {
      const lit = bc[1];
      if (value !== lit) return new VError(buildPath(pathSegments), `expected literal ${JSON.stringify(lit)}`);
      return null;
    }
    case Op.ARRAY: {
      const elemT = bc[1];
      if (!Array.isArray(value)) return new VError(buildPath(pathSegments), `expected array`);
      for (let i = 0; i < value.length; i++) {
        pathSegments.push(i);
        const err = validateWithResult(elemT, value[i], pathSegments, depth + 1);
        pathSegments.pop();
        if (err) return err;
      }
      return null;
    }
    case Op.TUPLE: {
      const n = bc[1] as number;
      if (!Array.isArray(value)) return new VError(buildPath(pathSegments), `expected tuple[${n}]`);
      if (value.length !== n) return new VError(buildPath(pathSegments), `expected tuple length ${n}, got ${value.length}`);
      for (let i = 0; i < n; i++) {
        const eltT = bc[2 + i];
        pathSegments.push(i);
        const err = validateWithResult(eltT, value[i], pathSegments, depth + 1);
        pathSegments.pop();
        if (err) return err;
      }
      return null;
    }
    case Op.OBJECT: {
      if (value === null || typeof value !== "object" || Array.isArray(value)) return new VError(buildPath(pathSegments), `expected object`);
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
          const err = new VError(buildPath(pathSegments), `required property missing`);
          pathSegments.pop();
          return err;
        }
      }

      // Check for excess properties if strict mode enabled
      if (strict && knownProps) {
        for (const key in value) {
          if (Object.prototype.hasOwnProperty.call(value, key) && !knownProps.has(key)) {
            pathSegments.push(key);
            const err = new VError(buildPath(pathSegments), `excess property (not in schema)`);
            pathSegments.pop();
            return err;
          }
        }
      }

      return null;
    }
    case Op.DUNION: {
      if (value === null || typeof value !== "object" || Array.isArray(value)) return new VError(buildPath(pathSegments), `expected object for discriminated union`);
      const tagKey = bc[1] as string;
      const vTag = (value as any)[tagKey];
      if (typeof vTag !== "string") {
        const n = bc[2] as number;
        const expected = [...Array(n).keys()].map(i => JSON.stringify(bc[3+2*i])).join(", ");
        pathSegments.push(tagKey);
        const err = new VError(buildPath(pathSegments), `expected string discriminant; expected one of: ${expected}`);
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
      const err = new VError(buildPath(pathSegments), `unexpected tag ${JSON.stringify(vTag)}; expected one of: ${allTags}`);
      pathSegments.pop();
      return err;
    }
    case Op.UNION: {
      // Optimized: use Result-based validation instead of try/catch
      const n = bc[1] as number;
      for (let i = 0; i < n; i++) {
        const err = validateWithResult(bc[2 + i], value, pathSegments, depth + 1);
        if (!err) return null; // Success: one alternative matched
      }
      return new VError(buildPath(pathSegments), `no union alternative matched`);
    }
    case Op.READONLY: {
      const inner = bc[1];
      return validateWithResult(inner, value, pathSegments, depth + 1);
    }
    case Op.BRAND: {
      const _tag = bc[1];
      const inner = bc[2];
      return validateWithResult(inner, value, pathSegments, depth + 1);
    }
    default:
      return new VError(buildPath(pathSegments), `unsupported opcode ${op}`);
  }
}

// Public throwing API (backwards compatible)
function validateWith(bc: any[], value: unknown, pathSegments: PathSegment[] = [], depth = 0): void {
  const err = validateWithResult(bc, value, pathSegments, depth);
  if (err) throw err;
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
  try {
    validateWith(t as any[], value, []);
    return { ok: true, value: value as T };
  } catch (err) {
    if (err instanceof VError) {
      return { ok: false, error: { path: err.path, message: err.message } };
    }
    // Unexpected errors (e.g., corrupt bytecode)
    return { ok: false, error: { path: "", message: String(err) } };
  }
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
