// packages/lfts-type-runtime/mod.ts
import { Op } from "../lfts-type-spec/src/mod.js";
import { match as patternMatch } from "ts-pattern";
import { introspect as introspectSchema } from "./introspection.js";
export const TYPEOF_PLACEHOLDER = Symbol.for("lfts.typeOf.placeholder");
// Dev shim: valid TS without compiler
export function typeOf() {
    return { __lfp: TYPEOF_PLACEHOLDER };
}
export { getKind, getProperties, getRefinements, getVariants, hashSchema, introspect, schemasEqual, traverse, unwrapAll, unwrapBrand, unwrapReadonly, } from "./introspection.js";
// ============================================================================
// Type Object System (Phase 1: v0.10.0)
// ============================================================================
// Re-export Type object classes and utilities
export { Type, StringType, NumberType, BooleanType, NullType, UndefinedType, LiteralType, ArrayType, TupleType, ObjectType, UnionType, DUnionType, ReadonlyType, BrandType, MetadataType, RefineMinType, RefineMaxType, RefineIntegerType, RefineMinLengthType, RefineMaxLengthType, RefineMinItemsType, RefineMaxItemsType, RefineEmailType, RefineUrlType, RefinePatternType, RefinePositiveType, RefineNegativeType, RefineNonEmptyType, createTypeObject, } from "./type-object.js";
// Re-export programmatic type builders
export { t, primitives } from "./builders.js";
function isBC(x) {
    return Array.isArray(x);
}
// Factory function for creating validation errors
function createVError(path, message) {
    return {
        __brand: "VError",
        path,
        message,
        fullMessage: path ? `${path}: ${message}` : message,
    };
}
// Type guard for VError
function isVError(x) {
    return typeof x === "object" && x !== null && x.__brand === "VError";
}
// Build path string from segments (only called on error)
function buildPath(segments) {
    if (segments.length === 0)
        return "";
    let path = "";
    for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        if (typeof seg === "number") {
            path += `[${seg}]`;
        }
        else {
            path += i === 0 ? seg : `.${seg}`;
        }
    }
    return path;
}
// ============================================================================
// Validation Constants
// ============================================================================
// Simple email regex (not RFC-compliant, but good enough for most cases)
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_DEPTH = 100;
// DUNION tag map cache: WeakMap keyed by bytecode array reference
// Converts O(n) linear search to O(1) lookup after first validation
const dunionCache = new WeakMap();
function getDunionTagMap(bc) {
    let map = dunionCache.get(bc);
    if (!map) {
        // Build map on first access: tag → schema
        map = new Map();
        const n = bc[2];
        for (let i = 0; i < n; i++) {
            const tag = bc[3 + 2 * i];
            const schema = bc[3 + 2 * i + 1];
            map.set(tag, schema);
        }
        dunionCache.set(bc, map);
    }
    return map;
}
// Schema memoization cache: Cache unwrapped inner schemas for READONLY/BRAND wrappers
// Provides 10-20% performance gain by avoiding redundant wrapper traversals
const wrapperCache = new WeakMap();
function getInnerSchema(bc) {
    let inner = wrapperCache.get(bc);
    if (!inner) {
        // Extract inner schema based on opcode
        const op = bc[0];
        if (op === Op.READONLY) {
            inner = bc[1];
        }
        else if (op === Op.BRAND) {
            inner = bc[2]; // BRAND: [Op.BRAND, tag, innerType]
        }
        else {
            inner = bc; // Not a wrapper, return as-is
        }
        wrapperCache.set(bc, inner);
    }
    return inner;
}
// Helper functions for complex validation cases (extracted from switch statement)
function validateArray(bc, value, pathSegments, depth) {
    if (!Array.isArray(value)) {
        return createVError(buildPath(pathSegments), `expected array`);
    }
    const elemT = bc[1];
    for (let i = 0; i < value.length; i++) {
        pathSegments.push(i);
        const err = validateWithResult(elemT, value[i], pathSegments, depth + 1);
        pathSegments.pop();
        if (err)
            return err;
    }
    return null;
}
function validateTuple(bc, value, pathSegments, depth) {
    const n = bc[1];
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
        if (err)
            return err;
    }
    return null;
}
function validateObject(bc, value, pathSegments, depth) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        return createVError(buildPath(pathSegments), `expected object`);
    }
    const count = bc[1];
    // Backward compatibility: check if bc[2] is strict flag (0 or 1) or first PROPERTY marker (Op.PROPERTY = 9)
    const hasStrictFlag = bc[2] === 0 || bc[2] === 1;
    const strict = hasStrictFlag && bc[2] === 1;
    let idx = hasStrictFlag ? 3 : 2;
    // Collect known property names for excess property checking
    const knownProps = strict ? new Set() : null;
    for (let i = 0; i < count; i++) {
        const marker = bc[idx++];
        if (marker !== Op.PROPERTY) {
            throw new Error("corrupt bytecode: expected PROPERTY");
        }
        const name = bc[idx++];
        const optional = bc[idx++] === 1;
        const t = bc[idx++];
        if (knownProps)
            knownProps.add(name);
        if (Object.prototype.hasOwnProperty.call(value, name)) {
            pathSegments.push(name);
            // @ts-ignore
            const err = validateWithResult(t, value[name], pathSegments, depth + 1);
            pathSegments.pop();
            if (err)
                return err;
        }
        else if (!optional) {
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
function validateDUnion(bc, value, pathSegments, depth) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        return createVError(buildPath(pathSegments), `expected object for discriminated union`);
    }
    const tagKey = bc[1];
    const vTag = value[tagKey];
    if (typeof vTag !== "string") {
        const n = bc[2];
        const expected = [...Array(n).keys()].map((i) => JSON.stringify(bc[3 + 2 * i])).join(", ");
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
    const allTags = Array.from(tagMap.keys()).map((t) => JSON.stringify(t)).join(", ");
    pathSegments.push(tagKey);
    const err = createVError(buildPath(pathSegments), `unexpected tag ${JSON.stringify(vTag)}; expected one of: ${allTags}`);
    pathSegments.pop();
    return err;
}
/**
 * Calculate similarity score between a value and a schema.
 * Used to find the "closest match" when union validation fails.
 *
 * Scoring strategy:
 * - Primitive type mismatch: 0.0 (completely wrong type)
 * - Object: ratio of matching properties to total properties
 * - Array: 0.5 if value is array, 0.0 otherwise
 * - Literal: 1.0 if same type, 0.0 otherwise
 * - Complex types: recursive similarity calculation
 */
function calculateSimilarity(bc, value, depth) {
    // Use validateWithResult to get the error
    const error = validateWithResult(bc, value, [], depth);
    // If validation succeeded, this shouldn't be called (bug)
    if (!error) {
        return {
            score: 1.0,
            error: createVError("", "validation succeeded"),
            diagnostics: "value matches schema",
        };
    }
    const op = bc[0];
    // Primitive type checks
    if (op === Op.STRING) {
        if (typeof value === "string") {
            // String type matches but validation failed (shouldn't happen for plain STRING)
            return { score: 1.0, error, diagnostics: "string type matches" };
        }
        return {
            score: 0.0,
            error,
            diagnostics: `expected string, got ${typeof value}`,
        };
    }
    if (op === Op.NUMBER) {
        if (typeof value === "number") {
            return { score: 1.0, error, diagnostics: "number type matches" };
        }
        return {
            score: 0.0,
            error,
            diagnostics: `expected number, got ${typeof value}`,
        };
    }
    if (op === Op.BOOLEAN) {
        if (typeof value === "boolean") {
            return { score: 1.0, error, diagnostics: "boolean type matches" };
        }
        return {
            score: 0.0,
            error,
            diagnostics: `expected boolean, got ${typeof value}`,
        };
    }
    if (op === Op.NULL) {
        if (value === null) {
            return { score: 1.0, error, diagnostics: "null matches" };
        }
        return { score: 0.0, error, diagnostics: "expected null" };
    }
    if (op === Op.UNDEFINED) {
        if (value === undefined) {
            return { score: 1.0, error, diagnostics: "undefined matches" };
        }
        return { score: 0.0, error, diagnostics: "expected undefined" };
    }
    if (op === Op.LITERAL) {
        const lit = bc[1];
        if (typeof value === typeof lit) {
            return {
                score: 0.8,
                error,
                diagnostics: `expected literal ${JSON.stringify(lit)}, got ${JSON.stringify(value)}`,
            };
        }
        return {
            score: 0.0,
            error,
            diagnostics: `expected ${typeof lit}, got ${typeof value}`,
        };
    }
    if (op === Op.ARRAY) {
        if (!Array.isArray(value)) {
            return { score: 0.0, error, diagnostics: "expected array" };
        }
        // Value is an array, so partial match
        return { score: 0.5, error, diagnostics: "array type matches" };
    }
    if (op === Op.TUPLE) {
        const expectedLen = bc[1];
        if (!Array.isArray(value)) {
            return { score: 0.0, error, diagnostics: `expected tuple[${expectedLen}]` };
        }
        if (value.length !== expectedLen) {
            return {
                score: 0.3,
                error,
                diagnostics: `expected tuple length ${expectedLen}, got ${value.length}`,
            };
        }
        return { score: 0.6, error, diagnostics: "tuple length matches" };
    }
    if (op === Op.OBJECT) {
        if (value === null || typeof value !== "object" || Array.isArray(value)) {
            return { score: 0.0, error, diagnostics: "expected object" };
        }
        // Calculate property-level similarity
        const count = bc[1];
        const hasStrictFlag = bc[2] === 0 || bc[2] === 1;
        let idx = hasStrictFlag ? 3 : 2;
        let totalProps = 0;
        let matchingPoints = 0; // Use points instead of count for weighted scoring
        const missingProps = [];
        const invalidProps = [];
        for (let i = 0; i < count; i++) {
            const marker = bc[idx++];
            if (marker !== Op.PROPERTY)
                break;
            const name = bc[idx++];
            const optional = bc[idx++] === 1;
            const propType = bc[idx++];
            totalProps++;
            const hasProp = Object.prototype.hasOwnProperty.call(value, name);
            if (!hasProp) {
                if (!optional) {
                    missingProps.push(name);
                    // Missing required property - user forgot to include it
                    matchingPoints += 0.1;
                }
                else {
                    // Optional property missing is perfectly fine
                    matchingPoints += 1.0;
                }
            }
            else {
                // Property exists, check if it validates
                const propErr = validateWithResult(propType, value[name], [], depth + 1);
                if (!propErr) {
                    // Perfect match
                    matchingPoints += 1.0;
                }
                else {
                    // Property exists but wrong type - credit for right structure, penalty for wrong type
                    invalidProps.push(name);
                    matchingPoints += 0.4;
                }
            }
        }
        // Use raw matching points plus a small bonus for high percentage
        // This prevents favoring schemas with fewer properties
        const percentageMatch = totalProps > 0 ? matchingPoints / totalProps : 0.5;
        const score = matchingPoints + (percentageMatch * 0.5);
        const diagnosticParts = [];
        if (missingProps.length > 0) {
            diagnosticParts.push(`missing ${missingProps.length} required ${missingProps.length === 1 ? "property" : "properties"}: ${missingProps.join(", ")}`);
        }
        if (invalidProps.length > 0) {
            diagnosticParts.push(`invalid ${invalidProps.length} ${invalidProps.length === 1 ? "property" : "properties"}: ${invalidProps.join(", ")}`);
        }
        const diagnostics = diagnosticParts.length > 0
            ? diagnosticParts.join("; ")
            : "object structure mismatch";
        return { score, error, diagnostics };
    }
    if (op === Op.READONLY) {
        const inner = getInnerSchema(bc);
        return calculateSimilarity(inner, value, depth + 1);
    }
    if (op === Op.BRAND) {
        const inner = getInnerSchema(bc);
        return calculateSimilarity(inner, value, depth + 1);
    }
    // For other types, return low similarity
    return { score: 0.1, error, diagnostics: "complex type mismatch" };
}
function validateUnion(bc, value, pathSegments, depth) {
    // Try all alternatives and track the best match
    const n = bc[1];
    let bestMatch = null;
    for (let i = 0; i < n; i++) {
        const err = validateWithResult(bc[2 + i], value, pathSegments, depth + 1);
        if (!err)
            return null; // Success: one alternative matched
        // Calculate similarity for this failed alternative
        const similarity = calculateSimilarity(bc[2 + i], value, depth + 1);
        if (!bestMatch || similarity.score > bestMatch.score) {
            bestMatch = similarity;
        }
    }
    // Generate enhanced error message with best match diagnostics
    if (bestMatch && bestMatch.score >= 0.2) {
        // If we found a reasonably close match, include diagnostics
        return createVError(buildPath(pathSegments), `no union alternative matched. Closest match: ${bestMatch.diagnostics}`);
    }
    // Fallback to generic message if no good match
    return createVError(buildPath(pathSegments), `no union alternative matched`);
}
// Internal validation that returns error instead of throwing (for UNION optimization)
// Now using ts-pattern for cleaner pattern matching
// Exported for use by Type object system
export function validateWithResult(bc, value, pathSegments, depth) {
    if (depth > MAX_DEPTH) {
        return createVError(buildPath(pathSegments), `maximum nesting depth (${MAX_DEPTH}) exceeded`);
    }
    const op = bc[0];
    return patternMatch(op)
        .with(Op.STRING, () => typeof value !== "string"
        ? createVError(buildPath(pathSegments), `expected string, got ${typeof value}`)
        : null)
        .with(Op.NUMBER, () => typeof value !== "number" || !Number.isFinite(value)
        ? createVError(buildPath(pathSegments), `expected finite number`)
        : null)
        .with(Op.BOOLEAN, () => typeof value !== "boolean"
        ? createVError(buildPath(pathSegments), `expected boolean`)
        : null)
        .with(Op.NULL, () => value !== null
        ? createVError(buildPath(pathSegments), `expected null`)
        : null)
        .with(Op.UNDEFINED, () => value !== undefined
        ? createVError(buildPath(pathSegments), `expected undefined`)
        : null)
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
        const minValue = bc[1];
        const innerSchema = bc[2];
        const err = validateWithResult(innerSchema, value, pathSegments, depth + 1);
        if (err)
            return err;
        if (typeof value !== "number") {
            return createVError(buildPath(pathSegments), `min refinement requires number type`);
        }
        return value < minValue
            ? createVError(buildPath(pathSegments), `expected >= ${minValue}, got ${value}`)
            : null;
    })
        .with(Op.REFINE_MAX, () => {
        const maxValue = bc[1];
        const innerSchema = bc[2];
        const err = validateWithResult(innerSchema, value, pathSegments, depth + 1);
        if (err)
            return err;
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
        if (err)
            return err;
        if (typeof value !== "number") {
            return createVError(buildPath(pathSegments), `integer refinement requires number type`);
        }
        return !Number.isInteger(value)
            ? createVError(buildPath(pathSegments), `expected integer, got ${value}`)
            : null;
    })
        .with(Op.REFINE_MIN_LENGTH, () => {
        const minLen = bc[1];
        const innerSchema = bc[2];
        const err = validateWithResult(innerSchema, value, pathSegments, depth + 1);
        if (err)
            return err;
        if (typeof value !== "string") {
            return createVError(buildPath(pathSegments), `minLength refinement requires string type`);
        }
        return value.length < minLen
            ? createVError(buildPath(pathSegments), `expected length >= ${minLen}, got ${value.length}`)
            : null;
    })
        .with(Op.REFINE_MAX_LENGTH, () => {
        const maxLen = bc[1];
        const innerSchema = bc[2];
        const err = validateWithResult(innerSchema, value, pathSegments, depth + 1);
        if (err)
            return err;
        if (typeof value !== "string") {
            return createVError(buildPath(pathSegments), `maxLength refinement requires string type`);
        }
        return value.length > maxLen
            ? createVError(buildPath(pathSegments), `expected length <= ${maxLen}, got ${value.length}`)
            : null;
    })
        .with(Op.REFINE_MIN_ITEMS, () => {
        const minItems = bc[1];
        const innerSchema = bc[2];
        const err = validateWithResult(innerSchema, value, pathSegments, depth + 1);
        if (err)
            return err;
        if (!Array.isArray(value)) {
            return createVError(buildPath(pathSegments), `minItems refinement requires array type`);
        }
        return value.length < minItems
            ? createVError(buildPath(pathSegments), `expected array length >= ${minItems}, got ${value.length}`)
            : null;
    })
        .with(Op.REFINE_MAX_ITEMS, () => {
        const maxItems = bc[1];
        const innerSchema = bc[2];
        const err = validateWithResult(innerSchema, value, pathSegments, depth + 1);
        if (err)
            return err;
        if (!Array.isArray(value)) {
            return createVError(buildPath(pathSegments), `maxItems refinement requires array type`);
        }
        return value.length > maxItems
            ? createVError(buildPath(pathSegments), `expected array length <= ${maxItems}, got ${value.length}`)
            : null;
    })
        .with(Op.REFINE_EMAIL, () => {
        const innerSchema = bc[1];
        const err = validateWithResult(innerSchema, value, pathSegments, depth + 1);
        if (err)
            return err;
        if (typeof value !== "string") {
            return createVError(buildPath(pathSegments), `email refinement requires string type`);
        }
        return !EMAIL_PATTERN.test(value)
            ? createVError(buildPath(pathSegments), `expected valid email format`)
            : null;
    })
        .with(Op.REFINE_URL, () => {
        const innerSchema = bc[1];
        const err = validateWithResult(innerSchema, value, pathSegments, depth + 1);
        if (err)
            return err;
        if (typeof value !== "string") {
            return createVError(buildPath(pathSegments), `url refinement requires string type`);
        }
        // Simple URL validation
        try {
            new URL(value);
            return null;
        }
        catch {
            return createVError(buildPath(pathSegments), `expected valid URL format`);
        }
    })
        .with(Op.REFINE_PATTERN, () => {
        const pattern = bc[1];
        const innerSchema = bc[2];
        const err = validateWithResult(innerSchema, value, pathSegments, depth + 1);
        if (err)
            return err;
        if (typeof value !== "string") {
            return createVError(buildPath(pathSegments), `pattern refinement requires string type`);
        }
        const regex = new RegExp(pattern);
        return !regex.test(value)
            ? createVError(buildPath(pathSegments), `expected to match pattern ${pattern}`)
            : null;
    })
        .with(Op.REFINE_POSITIVE, () => {
        const innerSchema = bc[1];
        const err = validateWithResult(innerSchema, value, pathSegments, depth + 1);
        if (err)
            return err;
        if (typeof value !== "number") {
            return createVError(buildPath(pathSegments), `positive refinement requires number type`);
        }
        return value <= 0
            ? createVError(buildPath(pathSegments), `expected positive number (> 0), got ${value}`)
            : null;
    })
        .with(Op.REFINE_NEGATIVE, () => {
        const innerSchema = bc[1];
        const err = validateWithResult(innerSchema, value, pathSegments, depth + 1);
        if (err)
            return err;
        if (typeof value !== "number") {
            return createVError(buildPath(pathSegments), `negative refinement requires number type`);
        }
        return value >= 0
            ? createVError(buildPath(pathSegments), `expected negative number (< 0), got ${value}`)
            : null;
    })
        .with(Op.REFINE_NON_EMPTY, () => {
        const innerSchema = bc[1];
        const err = validateWithResult(innerSchema, value, pathSegments, depth + 1);
        if (err)
            return err;
        if (!Array.isArray(value)) {
            return createVError(buildPath(pathSegments), `nonEmpty refinement requires array type`);
        }
        return value.length === 0
            ? createVError(buildPath(pathSegments), `expected non-empty array`)
            : null;
    })
        // Phase 1: Result/Option validators
        .with(Op.RESULT_OK, () => {
        // Validate Result.ok structure: { ok: true, value: T }
        if (!value || typeof value !== "object" || !("ok" in value)) {
            return createVError(buildPath(pathSegments), "expected Result type");
        }
        const resultValue = value;
        if (resultValue.ok !== true) {
            return createVError(buildPath(pathSegments), "expected Result.ok");
        }
        const valueSchema = bc[1];
        pathSegments.push("value");
        const err = validateWithResult(valueSchema, resultValue.value, pathSegments, depth + 1);
        pathSegments.pop();
        return err;
    })
        .with(Op.RESULT_ERR, () => {
        // Validate Result.err structure: { ok: false, error: E }
        if (!value || typeof value !== "object" || !("ok" in value)) {
            return createVError(buildPath(pathSegments), "expected Result type");
        }
        const resultValue = value;
        if (resultValue.ok !== false) {
            return createVError(buildPath(pathSegments), "expected Result.err");
        }
        const errorSchema = bc[1];
        pathSegments.push("error");
        const err = validateWithResult(errorSchema, resultValue.error, pathSegments, depth + 1);
        pathSegments.pop();
        return err;
    })
        .with(Op.OPTION_SOME, () => {
        // Validate Option.some structure: { some: true, value: T }
        if (!value || typeof value !== "object" || !("some" in value)) {
            return createVError(buildPath(pathSegments), "expected Option type");
        }
        const optionValue = value;
        if (optionValue.some !== true) {
            return createVError(buildPath(pathSegments), "expected Option.some");
        }
        const valueSchema = bc[1];
        pathSegments.push("value");
        const err = validateWithResult(valueSchema, optionValue.value, pathSegments, depth + 1);
        pathSegments.pop();
        return err;
    })
        .with(Op.OPTION_NONE, () => {
        // Validate Option.none structure: { some: false }
        if (!value || typeof value !== "object" || !("some" in value)) {
            return createVError(buildPath(pathSegments), "expected Option type");
        }
        const optionValue = value;
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
        .otherwise(() => createVError(buildPath(pathSegments), `unsupported opcode ${op}`));
}
// Convert VError to throwable Error
function vErrorToError(vErr) {
    const err = new Error(vErr.fullMessage);
    err.name = "ValidationError";
    return err;
}
// Public throwing API (backwards compatible)
function validateWith(bc, value, pathSegments = [], depth = 0) {
    const err = validateWithResult(bc, value, pathSegments, depth);
    if (err)
        throw vErrorToError(err);
}
/**
 * Internal helper to assert that a value is valid bytecode.
 * Exported for use by introspection.ts to avoid duplication.
 * @internal
 */
export function assertBytecode(t) {
    // Handle Type objects (v0.10.0+) - unwrap to bytecode
    if (t && typeof t === "object" && "bc" in t && Array.isArray(t.bc)) {
        // This is a Type object, validation functions will handle unwrapping
        return;
    }
    if (!isBC(t)) {
        const isPlaceholder = t && typeof t === "object" &&
            t.__lfp === TYPEOF_PLACEHOLDER;
        const hint = isPlaceholder
            ? "This looks like an untransformed `typeOf<T>()`. Run `deno task build` (compiler transform) before executing."
            : "Expected compiler-inlined bytecode array or Type object.";
        throw new Error(`LFTS runtime: missing bytecode. ${hint}`);
    }
}
export function decode(bc) {
    return bc;
}
/**
 * Unwrap Type objects to bytecode arrays (v0.10.0+)
 * @param t - Bytecode array or Type object
 * @returns Bytecode array
 */
function unwrapBytecode(t) {
    // Handle Type objects (v0.10.0+)
    if (t && typeof t === "object" && "bc" in t && Array.isArray(t.bc)) {
        return t.bc;
    }
    // Already a bytecode array
    return t;
}
/**
 * Validate a value against a schema (throws on error)
 * @param t - Bytecode schema or Type object
 * @param value - Value to validate
 * @returns The validated value (for chaining)
 * @throws VError if validation fails
 */
export function validate(t, value) {
    assertBytecode(t);
    const bc = unwrapBytecode(t);
    validateWith(bc, value, []);
    return value; // if valid, return value
}
/**
 * Validate a value against a schema (returns Result)
 * Functional alternative to validate() that returns success/error instead of throwing
 * @param t - Bytecode schema or Type object
 * @param value - Value to validate
 * @returns Result<T, ValidationError> with either the validated value or error details
 */
export function validateSafe(t, value) {
    assertBytecode(t);
    const bc = unwrapBytecode(t);
    const err = validateWithResult(bc, value, [], 0);
    if (err) {
        return { ok: false, error: { path: err.path, message: err.message } };
    }
    return { ok: true, value: value };
}
/**
 * Validate a value against a schema and collect ALL errors (error aggregation)
 * Instead of stopping at the first error, this collects all validation failures
 *
 * @param t - Bytecode schema or Type object
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
export function validateAll(t, value, maxErrors = 100) {
    assertBytecode(t);
    const bc = unwrapBytecode(t);
    const errors = [];
    collectErrors(bc, value, [], 0, errors, maxErrors);
    if (errors.length === 0) {
        return { ok: true, value: value };
    }
    return { ok: false, errors };
}
// Internal function for error aggregation - collects all errors instead of short-circuiting
function collectErrors(bc, value, pathSegments, depth, errors, maxErrors) {
    // Stop if we've hit the max error limit
    if (errors.length >= maxErrors)
        return;
    if (depth > MAX_DEPTH) {
        errors.push({
            path: buildPath(pathSegments),
            message: `maximum nesting depth (${MAX_DEPTH}) exceeded`,
        });
        return;
    }
    const op = bc[0];
    patternMatch(op)
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
            collectErrors(elemT, value[i], pathSegments, depth + 1, errors, maxErrors);
            pathSegments.pop();
        }
    })
        .with(Op.TUPLE, () => {
        const n = bc[1];
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
            collectErrors(eltT, value[i], pathSegments, depth + 1, errors, maxErrors);
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
        const count = bc[1];
        const hasStrictFlag = bc[2] === 0 || bc[2] === 1;
        const strict = hasStrictFlag && bc[2] === 1;
        let idx = hasStrictFlag ? 3 : 2;
        const knownProps = strict ? new Set() : null;
        // Validate all properties, don't stop at first error
        for (let i = 0; i < count && errors.length < maxErrors; i++) {
            const marker = bc[idx++];
            if (marker !== Op.PROPERTY) {
                throw new Error("corrupt bytecode: expected PROPERTY");
            }
            const name = bc[idx++];
            const optional = bc[idx++] === 1;
            const t = bc[idx++];
            if (knownProps)
                knownProps.add(name);
            if (Object.prototype.hasOwnProperty.call(value, name)) {
                pathSegments.push(name);
                collectErrors(t, value[name], pathSegments, depth + 1, errors, maxErrors);
                pathSegments.pop();
            }
            else if (!optional) {
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
                if (Object.prototype.hasOwnProperty.call(value, key) &&
                    !knownProps.has(key)) {
                    pathSegments.push(key);
                    errors.push({
                        path: buildPath(pathSegments),
                        message: `excess property (not in schema)`,
                    });
                    pathSegments.pop();
                    if (errors.length >= maxErrors)
                        break;
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
        const tagKey = bc[1];
        const vTag = value[tagKey];
        if (typeof vTag !== "string") {
            const n = bc[2];
            const expected = [...Array(n).keys()].map((i) => JSON.stringify(bc[3 + 2 * i])).join(", ");
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
            collectErrors(variantSchema, value, pathSegments, depth + 1, errors, maxErrors);
        }
        else {
            const allTags = Array.from(tagMap.keys()).map((t) => JSON.stringify(t))
                .join(", ");
            pathSegments.push(tagKey);
            errors.push({
                path: buildPath(pathSegments),
                message: `unexpected tag ${JSON.stringify(vTag)}; expected one of: ${allTags}`,
            });
            pathSegments.pop();
        }
    })
        .with(Op.UNION, () => {
        // For unions with aggregation, we try all alternatives and report if NONE match
        // Use similarity scoring to provide helpful diagnostics
        const n = bc[1];
        let anyMatched = false;
        let bestMatch = null;
        for (let i = 0; i < n; i++) {
            const alternativeErrors = [];
            collectErrors(bc[2 + i], value, pathSegments, depth + 1, alternativeErrors, maxErrors);
            if (alternativeErrors.length === 0) {
                anyMatched = true;
                break; // One alternative matched, union is valid
            }
            // Calculate similarity for failed alternative
            const similarity = calculateSimilarity(bc[2 + i], value, depth + 1);
            if (!bestMatch || similarity.score > bestMatch.score) {
                bestMatch = similarity;
            }
        }
        if (!anyMatched) {
            // Include diagnostics if we found a reasonably close match
            const message = bestMatch && bestMatch.score >= 0.2
                ? `no union alternative matched. Closest match: ${bestMatch.diagnostics}`
                : `no union alternative matched`;
            errors.push({
                path: buildPath(pathSegments),
                message,
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
        const minValue = bc[1];
        const innerSchema = bc[2];
        // First validate the inner type
        collectErrors(innerSchema, value, pathSegments, depth + 1, errors, maxErrors);
        // Then check refinement if no errors so far
        if (errors.length < maxErrors && typeof value === "number" &&
            value < minValue) {
            errors.push({
                path: buildPath(pathSegments),
                message: `expected >= ${minValue}, got ${value}`,
            });
        }
    })
        .with(Op.REFINE_MAX, () => {
        const maxValue = bc[1];
        const innerSchema = bc[2];
        collectErrors(innerSchema, value, pathSegments, depth + 1, errors, maxErrors);
        if (errors.length < maxErrors && typeof value === "number" &&
            value > maxValue) {
            errors.push({
                path: buildPath(pathSegments),
                message: `expected <= ${maxValue}, got ${value}`,
            });
        }
    })
        .with(Op.REFINE_INTEGER, () => {
        const innerSchema = bc[1];
        collectErrors(innerSchema, value, pathSegments, depth + 1, errors, maxErrors);
        if (errors.length < maxErrors && typeof value === "number" &&
            !Number.isInteger(value)) {
            errors.push({
                path: buildPath(pathSegments),
                message: `expected integer, got ${value}`,
            });
        }
    })
        .with(Op.REFINE_MIN_LENGTH, () => {
        const minLen = bc[1];
        const innerSchema = bc[2];
        collectErrors(innerSchema, value, pathSegments, depth + 1, errors, maxErrors);
        if (errors.length < maxErrors && typeof value === "string" &&
            value.length < minLen) {
            errors.push({
                path: buildPath(pathSegments),
                message: `expected length >= ${minLen}, got ${value.length}`,
            });
        }
    })
        .with(Op.REFINE_MAX_LENGTH, () => {
        const maxLen = bc[1];
        const innerSchema = bc[2];
        collectErrors(innerSchema, value, pathSegments, depth + 1, errors, maxErrors);
        if (errors.length < maxErrors && typeof value === "string" &&
            value.length > maxLen) {
            errors.push({
                path: buildPath(pathSegments),
                message: `expected length <= ${maxLen}, got ${value.length}`,
            });
        }
    })
        .with(Op.REFINE_MIN_ITEMS, () => {
        const minItems = bc[1];
        const innerSchema = bc[2];
        collectErrors(innerSchema, value, pathSegments, depth + 1, errors, maxErrors);
        if (errors.length < maxErrors && Array.isArray(value) &&
            value.length < minItems) {
            errors.push({
                path: buildPath(pathSegments),
                message: `expected array length >= ${minItems}, got ${value.length}`,
            });
        }
    })
        .with(Op.REFINE_MAX_ITEMS, () => {
        const maxItems = bc[1];
        const innerSchema = bc[2];
        collectErrors(innerSchema, value, pathSegments, depth + 1, errors, maxErrors);
        if (errors.length < maxErrors && Array.isArray(value) &&
            value.length > maxItems) {
            errors.push({
                path: buildPath(pathSegments),
                message: `expected array length <= ${maxItems}, got ${value.length}`,
            });
        }
    })
        .with(Op.REFINE_EMAIL, () => {
        const innerSchema = bc[1];
        collectErrors(innerSchema, value, pathSegments, depth + 1, errors, maxErrors);
        if (errors.length < maxErrors && typeof value === "string") {
            if (!EMAIL_PATTERN.test(value)) {
                errors.push({
                    path: buildPath(pathSegments),
                    message: `expected valid email format`,
                });
            }
        }
    })
        .with(Op.REFINE_URL, () => {
        const innerSchema = bc[1];
        collectErrors(innerSchema, value, pathSegments, depth + 1, errors, maxErrors);
        if (errors.length < maxErrors && typeof value === "string") {
            try {
                new URL(value);
            }
            catch {
                errors.push({
                    path: buildPath(pathSegments),
                    message: `expected valid URL format`,
                });
            }
        }
    })
        .with(Op.REFINE_PATTERN, () => {
        const pattern = bc[1];
        const innerSchema = bc[2];
        collectErrors(innerSchema, value, pathSegments, depth + 1, errors, maxErrors);
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
        collectErrors(innerSchema, value, pathSegments, depth + 1, errors, maxErrors);
        if (errors.length < maxErrors && typeof value === "number" && value <= 0) {
            errors.push({
                path: buildPath(pathSegments),
                message: `expected positive number (> 0), got ${value}`,
            });
        }
    })
        .with(Op.REFINE_NEGATIVE, () => {
        const innerSchema = bc[1];
        collectErrors(innerSchema, value, pathSegments, depth + 1, errors, maxErrors);
        if (errors.length < maxErrors && typeof value === "number" && value >= 0) {
            errors.push({
                path: buildPath(pathSegments),
                message: `expected negative number (< 0), got ${value}`,
            });
        }
    })
        .with(Op.REFINE_NON_EMPTY, () => {
        const innerSchema = bc[1];
        collectErrors(innerSchema, value, pathSegments, depth + 1, errors, maxErrors);
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
export function serialize(t, value) {
    // Iteration-1: no structural changes; rely on validate for correctness
    validate(t, value);
    return value;
}
// Exhaustive pattern matching helper for ADTs discriminated by `type`.
export function match(value, cases) {
    const tag = value.type;
    const handler = cases[tag];
    if (typeof handler !== "function") {
        throw new Error(`match: unhandled case '${String(tag)}'`);
    }
    return handler(value);
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
    ok(value) {
        return { ok: true, value };
    },
    /**
     * Create a failed Result with an error.
     */
    err(error) {
        return { ok: false, error };
    },
    /**
     * Transform the value inside a successful Result.
     * If the Result is an error, returns the error unchanged.
     */
    map(result, fn) {
        return result.ok ? Result.ok(fn(result.value)) : result;
    },
    /**
     * Chain Result-returning functions together.
     * Short-circuits on the first error.
     */
    andThen(result, fn) {
        return result.ok ? fn(result.value) : result;
    },
    /**
     * Transform the error inside a failed Result.
     * If the Result is successful, returns it unchanged.
     */
    mapErr(result, fn) {
        return result.ok ? result : Result.err(fn(result.error));
    },
    /**
     * Apply a predicate to the value and convert to error if it fails.
     * Returns a function that can be used in andThen chains.
     * If the input Result is already an error, it is returned unchanged.
     */
    ensure(predicate, error) {
        return (result) => {
            if (!result.ok)
                return result; // Preserve existing error
            return predicate(result.value) ? result : Result.err(error);
        };
    },
    /**
     * Unwrap a Result value or provide a default.
     */
    unwrapOr(result, defaultValue) {
        return result.ok ? result.value : defaultValue;
    },
    /**
     * Check if a Result is successful.
     */
    isOk(result) {
        return result.ok;
    },
    /**
     * Check if a Result is an error.
     */
    isErr(result) {
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
    some(value) {
        return { some: true, value };
    },
    /**
     * Create an empty Option.
     */
    none() {
        return { some: false };
    },
    /**
     * Safely get the first element of an array.
     */
    first(arr) {
        return arr.length > 0 ? Option.some(arr[0]) : Option.none();
    },
    /**
     * Create an Option from a nullable value.
     */
    from(value) {
        return value != null ? Option.some(value) : Option.none();
    },
    /**
     * Transform the value inside an Option.
     * If the Option is empty, returns empty Option.
     */
    map(option, fn) {
        return option.some ? Option.some(fn(option.value)) : Option.none();
    },
    /**
     * Chain Option-returning functions together.
     * Short-circuits on the first empty Option.
     */
    andThen(option, fn) {
        return option.some ? fn(option.value) : Option.none();
    },
    /**
     * Convert an Option to a Result, providing an error value for None.
     */
    okOr(option, error) {
        return option.some ? Result.ok(option.value) : Result.err(error);
    },
    /**
     * Unwrap an Option value or provide a default.
     */
    unwrapOr(option, defaultValue) {
        return option.some ? option.value : defaultValue;
    },
    /**
     * Check if an Option has a value.
     */
    isSome(option) {
        return option.some;
    },
    /**
     * Check if an Option is empty.
     */
    isNone(option) {
        return !option.some;
    },
    /**
     * Combine multiple Options into one. All must have values.
     */
    zip(...options) {
        const values = [];
        for (const opt of options) {
            if (!Option.isSome(opt))
                return Option.none();
            values.push(opt.value);
        }
        return Option.some(values);
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
    try(fn, onError) {
        return fn()
            .then((value) => Result.ok(value))
            .catch((error) => Result.err(onError(error)));
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
    async andThen(promise, fn) {
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
    async map(promise, fn) {
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
    async mapErr(promise, fn) {
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
    async all(promises) {
        const results = await Promise.all(promises);
        const values = [];
        for (const result of results) {
            if (!result.ok)
                return result;
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
    async allSettled(promises) {
        const results = await Promise.all(promises);
        const successes = [];
        const failures = [];
        for (const result of results) {
            if (result.ok) {
                successes.push(result.value);
            }
            else {
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
    async race(promises) {
        return await Promise.race(promises);
    },
};
/**
 * Extract metadata attached via `withMetadata()` if present.
 */
export function getMetadata(schema) {
    const info = introspectSchema(schema);
    if (info.kind !== "metadata")
        return undefined;
    return info.metadata;
}
/**
 * Collect metadata across a list of schemas with optional predicate filtering.
 */
export function collectMetadata(schemas, predicate) {
    const entries = [];
    for (const schema of schemas) {
        const metadata = getMetadata(schema);
        if (!metadata)
            continue;
        if (predicate && !predicate(metadata))
            continue;
        entries.push({ schema, metadata });
    }
    return entries;
}
/**
 * Extract metadata from a schema if it has a METADATA wrapper.
 * Returns null if no metadata is present.
 */
function extractMetadata(schema) {
    if (!Array.isArray(schema) || schema.length < 2)
        return null;
    if (schema[0] !== Op.METADATA)
        return null;
    return schema[1];
}
/**
 * Unwrap METADATA wrapper to get the inner schema.
 */
function unwrapMetadata(schema) {
    if (!Array.isArray(schema) || schema.length < 3)
        return schema;
    if (schema[0] !== Op.METADATA)
        return schema;
    return schema[2];
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
export function inspect(schema, configure) {
    const metadata = extractMetadata(schema) || {};
    const innerSchema = unwrapMetadata(schema);
    // Hook storage
    const onSuccessCallbacks = [];
    const onFailureCallbacks = [];
    // Build context object
    const context = {
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
    const triggerSuccess = (value) => {
        for (const callback of onSuccessCallbacks) {
            try {
                callback(value);
            }
            catch (err) {
                // Swallow hook errors to prevent breaking validation flow
                console.error("Introspection hook error (onSuccess):", err);
            }
        }
    };
    // Helper to trigger failure hooks
    const triggerFailure = (error) => {
        for (const callback of onFailureCallbacks) {
            try {
                callback(error);
            }
            catch (err) {
                // Swallow hook errors to prevent breaking validation flow
                console.error("Introspection hook error (onFailure):", err);
            }
        }
    };
    return {
        schema: innerSchema,
        metadata,
        validate: (value) => {
            const result = validateSafe(innerSchema, value);
            if (result.ok) {
                triggerSuccess(result.value);
            }
            else {
                triggerFailure(result.error);
            }
            return result;
        },
        validateUnsafe: (value) => {
            try {
                const validated = validate(innerSchema, value);
                triggerSuccess(validated);
                return validated;
            }
            catch (err) {
                // Convert error to ValidationError and trigger hook
                // The error from validate() is a regular Error with "path: message" format
                if (err instanceof Error && err.name === "ValidationError") {
                    // Parse "path: message" format from fullMessage
                    // If no colon, path is empty and message is the whole thing
                    const match = err.message.match(/^([^:]*): (.*)$/);
                    const error = match
                        ? { path: match[1], message: match[2] }
                        : { path: "", message: err.message };
                    triggerFailure(error);
                }
                throw err;
            }
        },
        validateAll: (value, maxErrors = 100) => {
            const result = validateAll(innerSchema, value, maxErrors);
            if (result.ok) {
                triggerSuccess(result.value);
            }
            else if (result.errors.length > 0) {
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
export function withMetadata(schema, metadata) {
    return [Op.METADATA, metadata, schema];
}
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
export function validatePort(portSchema, impl) {
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
    const portName = portSchema[1];
    const methodCount = portSchema[2];
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
        const methodName = portSchema[offset + 1];
        const paramCount = portSchema[offset + 2];
        // Check if method exists on impl
        const method = impl[methodName];
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
                message: `Port ${portName} method '${methodName}' must be a function, got ${typeof method}`,
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
                message: `Port ${portName} method '${methodName}' expects ${paramCount} parameter(s), but implementation has ${method.length}`,
            });
        }
        // Move offset past this method definition
        // PORT_METHOD + name + paramCount + params + returnType
        offset += 3 + paramCount + 1;
    }
    // All checks passed
    return Result.ok(impl);
}
/**
 * Extract port name from a PORT bytecode schema.
 * Useful for error messages and debugging.
 *
 * @param portSchema - The PORT bytecode schema
 * @returns The port name, or undefined if not a valid PORT schema
 */
export function getPortName(portSchema) {
    if (!isBC(portSchema) || portSchema[0] !== Op.PORT) {
        return undefined;
    }
    return portSchema[1];
}
export function getPortMethods(portSchema) {
    if (!isBC(portSchema) || portSchema[0] !== Op.PORT)
        return [];
    const methodCount = portSchema[2];
    const names = [];
    let offset = 3;
    for (let i = 0; i < methodCount; i++) {
        if (portSchema[offset] !== Op.PORT_METHOD) {
            return names;
        }
        const methodName = portSchema[offset + 1];
        const paramCount = portSchema[offset + 2];
        names.push(methodName);
        offset += 3 + paramCount + 1;
    }
    return names;
}
export { executeStep, createObservableSchema, analyzeWorkflow, createWorkflowRegistry, inspectStep, executeStepsInParallel, } from "./workflow.js";
export { STAGE_DEFINITION, defineBackendFunctionStage, defineFullStackHtmxStage, createStageCatalog, isStageDefinition, getStageDefinitionInfo, registerHtmxStageRoutes, } from "./stage-types.js";
export { createStateMachine, stateMachine, } from "./state-machine.js";
