
// packages/lfp-type-runtime/mod.ts
import { Op } from "../lfp-type-spec/src/mod.ts";

export const TYPEOF_PLACEHOLDER = Symbol.for("lfp.typeOf.placeholder");

// Dev shim: valid TS without compiler
export function typeOf<T>(): any {
  return { __lfp: TYPEOF_PLACEHOLDER };
}

export type TypeObject = unknown;

function isBC(x: unknown): x is any[] { return Array.isArray(x); }

class VError extends Error {
  constructor(public path: string, msg: string) { super(path ? `${path}: ${msg}` : msg); }
}

function pathJoin(base: string, seg: string | number): string {
  if (base === "") return typeof seg === "number" ? `[${seg}]` : seg;
  return typeof seg === "number" ? `${base}[${seg}]` : `${base}.${seg}`;
}

function validateWith(bc: any[], value: unknown, path = ""): void {
  const op = bc[0];
  switch (op) {
    case Op.STRING:
      if (typeof value !== "string") throw new VError(path, `expected string, got ${typeof value}`);
      return;
    case Op.NUMBER:
      if (typeof value !== "number" || !Number.isFinite(value)) throw new VError(path, `expected finite number`);
      return;
    case Op.BOOLEAN:
      if (typeof value !== "boolean") throw new VError(path, `expected boolean`);
      return;
    case Op.NULL:
      if (value !== null) throw new VError(path, `expected null`);
      return;
    case Op.UNDEFINED:
      if (value !== undefined) throw new VError(path, `expected undefined`);
      return;
    case Op.LITERAL: {
      const lit = bc[1];
      if (value !== lit) throw new VError(path, `expected literal ${JSON.stringify(lit)}`);
      return;
    }
    case Op.ARRAY: {
      const elemT = bc[1];
      if (!Array.isArray(value)) throw new VError(path, `expected array`);
      for (let i = 0; i < value.length; i++) validateWith(elemT, value[i], pathJoin(path, i));
      return;
    }
    case Op.TUPLE: {
      const n = bc[1] as number;
      if (!Array.isArray(value)) throw new VError(path, `expected tuple[${n}]`);
      if (value.length !== n) throw new VError(path, `expected tuple length ${n}, got ${value.length}`);
      for (let i = 0; i < n; i++) {
        const eltT = bc[2 + i];
        validateWith(eltT, value[i], pathJoin(path, i));
      }
      return;
    }
    case Op.OBJECT: {
      if (value === null || typeof value !== "object" || Array.isArray(value)) throw new VError(path, `expected object`);
      const count = bc[1] as number;
      let idx = 2;
      for (let i = 0; i < count; i++) {
        const marker = bc[idx++];
        if (marker !== Op.PROPERTY) throw new Error("corrupt bytecode: expected PROPERTY");
        const name = bc[idx++];
        const optional = bc[idx++] === 1;
        const t = bc[idx++];
        if (Object.prototype.hasOwnProperty.call(value as object, name)) {
          // @ts-ignore
          validateWith(t, (value as any)[name], pathJoin(path, name));
        } else if (!optional) {
          throw new VError(pathJoin(path, name), `required property missing`);
        }
      }
      return;
    }
    case Op.DUNION: {
      if (value === null || typeof value !== "object" || Array.isArray(value)) throw new VError(path, `expected object for discriminated union`);
      const tagKey = bc[1] as string;
      const n = bc[2] as number;
      const vTag = (value as any)[tagKey];
      if (typeof vTag !== "string") throw new VError(pathJoin(path, tagKey), `expected string discriminant; expected one of: ${[...Array(n).keys()].map(i => JSON.stringify(bc[3+2*i])).join(", ")}`);
      for (let i = 0; i < n; i++) {
        const tag = bc[3 + 2*i] as string;
        const schema = bc[3 + 2*i + 1] as any[];
        if (vTag === tag) { validateWith(schema, value, path); return; }
      }
      const expected = [...Array(n).keys()].map(i => bc[3+2*i]);
      throw new VError(pathJoin(path, tagKey), `unexpected tag ${JSON.stringify(vTag)}; expected one of: ${expected.map(x=>JSON.stringify(x)).join(", ")}`);
    }
    case Op.UNION: {
      const n = bc[1] as number;
      for (let i = 0; i < n; i++) {
        try {
          validateWith(bc[2 + i], value, path);
          return; // one alternative matched
        } catch (_) { /* continue */ }
      }
      throw new VError(path, `no union alternative matched`);
    }
    case Op.READONLY: {
      const inner = bc[1];
      validateWith(inner, value, path);
      // we don't enforce immutability at runtime in MVP
      return;
    }
    case Op.BRAND: {
      const _tag = bc[1];
      const inner = bc[2];
      validateWith(inner, value, path);
      return;
    }
    default:
      throw new VError(path, `unsupported opcode ${op}`);
  }
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

export function validate(t: TypeObject, value: unknown) {
  assertBytecode(t);
  validateWith(t as any[], value, "");
  return value; // if valid, return value
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
