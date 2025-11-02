// packages/lfts-type-runtime/introspection.ts
// Schema introspection API for examining type structure at runtime
import { Op } from "../lfts-type-spec/src/mod.js";
// ============================================================================
// Core Introspection
// ============================================================================
/**
 * Introspect a schema to extract its structure.
 * This is the primary entry point for examining schema bytecode.
 *
 * @param schema - The bytecode schema to introspect
 * @returns SchemaInfo discriminated union describing the schema structure
 * @throws Error if the schema is malformed or uses an unsupported opcode
 *
 * @example
 * ```ts
 * const info = introspect(User$);
 * if (info.kind === "object") {
 *   console.log(`Object with ${info.properties.length} properties`);
 *   for (const prop of info.properties) {
 *     console.log(`  ${prop.name}: ${prop.optional ? "optional" : "required"}`);
 *   }
 * }
 * ```
 */
export function introspect(schema) {
    assertBytecode(schema);
    const bc = schema;
    const op = bc[0];
    switch (op) {
        // Primitives
        case Op.STRING:
            return { kind: "primitive", type: "string" };
        case Op.NUMBER:
            return { kind: "primitive", type: "number" };
        case Op.BOOLEAN:
            return { kind: "primitive", type: "boolean" };
        case Op.NULL:
            return { kind: "primitive", type: "null" };
        case Op.UNDEFINED:
            return { kind: "primitive", type: "undefined" };
        // Literal
        case Op.LITERAL:
            return { kind: "literal", value: bc[1] };
        // Array
        case Op.ARRAY:
            return { kind: "array", element: bc[1] };
        // Tuple
        case Op.TUPLE: {
            const length = bc[1];
            const elements = [];
            for (let i = 0; i < length; i++) {
                elements.push(bc[2 + i]);
            }
            return { kind: "tuple", elements };
        }
        // Object
        case Op.OBJECT: {
            const count = bc[1];
            // Check for strict flag (backward compatibility)
            const hasStrictFlag = bc[2] === 0 || bc[2] === 1;
            const strict = hasStrictFlag && bc[2] === 1;
            let idx = hasStrictFlag ? 3 : 2;
            const properties = [];
            for (let i = 0; i < count; i++) {
                const marker = bc[idx++];
                if (marker !== Op.PROPERTY) {
                    throw new Error("Corrupt bytecode: expected PROPERTY marker");
                }
                const name = bc[idx++];
                const optional = bc[idx++] === 1;
                const type = bc[idx++];
                properties.push({ name, type, optional });
            }
            return { kind: "object", properties, strict };
        }
        // Union
        case Op.UNION: {
            const count = bc[1];
            const alternatives = [];
            for (let i = 0; i < count; i++) {
                alternatives.push(bc[2 + i]);
            }
            return { kind: "union", alternatives };
        }
        // Discriminated Union
        case Op.DUNION: {
            const discriminant = bc[1];
            const count = bc[2];
            const variants = [];
            for (let i = 0; i < count; i++) {
                const tag = bc[3 + 2 * i];
                const schema = bc[3 + 2 * i + 1];
                variants.push({ tag, schema });
            }
            return { kind: "dunion", discriminant, variants };
        }
        // Readonly
        case Op.READONLY:
            return { kind: "readonly", inner: bc[1] };
        // Brand
        case Op.BRAND:
            return { kind: "brand", tag: bc[1], inner: bc[2] };
        // Refinements - collect all nested refinements into single SchemaInfo
        case Op.REFINE_MIN:
        case Op.REFINE_MAX:
        case Op.REFINE_INTEGER:
        case Op.REFINE_MIN_LENGTH:
        case Op.REFINE_MAX_LENGTH:
        case Op.REFINE_MIN_ITEMS:
        case Op.REFINE_MAX_ITEMS:
        case Op.REFINE_EMAIL:
        case Op.REFINE_URL:
        case Op.REFINE_PATTERN:
        case Op.REFINE_POSITIVE:
        case Op.REFINE_NEGATIVE:
        case Op.REFINE_NON_EMPTY: {
            // Collect all refinements by unwrapping nested refinement layers
            const refinements = [];
            let current = bc;
            let innerSchema = bc;
            while (true) {
                const currentOp = current[0];
                switch (currentOp) {
                    case Op.REFINE_MIN:
                        refinements.push({ kind: "min", value: current[1] });
                        innerSchema = current[2];
                        current = innerSchema;
                        break;
                    case Op.REFINE_MAX:
                        refinements.push({ kind: "max", value: current[1] });
                        innerSchema = current[2];
                        current = innerSchema;
                        break;
                    case Op.REFINE_INTEGER:
                        refinements.push({ kind: "integer" });
                        innerSchema = current[1];
                        current = innerSchema;
                        break;
                    case Op.REFINE_MIN_LENGTH:
                        refinements.push({ kind: "minLength", value: current[1] });
                        innerSchema = current[2];
                        current = innerSchema;
                        break;
                    case Op.REFINE_MAX_LENGTH:
                        refinements.push({ kind: "maxLength", value: current[1] });
                        innerSchema = current[2];
                        current = innerSchema;
                        break;
                    case Op.REFINE_MIN_ITEMS:
                        refinements.push({ kind: "minItems", value: current[1] });
                        innerSchema = current[2];
                        current = innerSchema;
                        break;
                    case Op.REFINE_MAX_ITEMS:
                        refinements.push({ kind: "maxItems", value: current[1] });
                        innerSchema = current[2];
                        current = innerSchema;
                        break;
                    case Op.REFINE_EMAIL:
                        refinements.push({ kind: "email" });
                        innerSchema = current[1];
                        current = innerSchema;
                        break;
                    case Op.REFINE_URL:
                        refinements.push({ kind: "url" });
                        innerSchema = current[1];
                        current = innerSchema;
                        break;
                    case Op.REFINE_PATTERN:
                        refinements.push({ kind: "pattern", pattern: current[1] });
                        innerSchema = current[2];
                        current = innerSchema;
                        break;
                    case Op.REFINE_POSITIVE:
                        refinements.push({ kind: "positive" });
                        innerSchema = current[1];
                        current = innerSchema;
                        break;
                    case Op.REFINE_NEGATIVE:
                        refinements.push({ kind: "negative" });
                        innerSchema = current[1];
                        current = innerSchema;
                        break;
                    case Op.REFINE_NON_EMPTY:
                        refinements.push({ kind: "nonEmpty" });
                        innerSchema = current[1];
                        current = innerSchema;
                        break;
                    default:
                        // Reached non-refinement opcode, stop unwrapping
                        return { kind: "refinement", refinements, inner: innerSchema };
                }
            }
        }
        // Result types
        case Op.RESULT_OK:
            return {
                kind: "result",
                valueType: bc[1],
                errorType: null,
            };
        case Op.RESULT_ERR:
            return {
                kind: "result",
                valueType: null, // Not present in ERR variant
                errorType: bc[1],
            };
        // Option types
        case Op.OPTION_SOME:
            return {
                kind: "option",
                valueType: bc[1],
            };
        case Op.OPTION_NONE:
            return {
                kind: "option",
                valueType: null,
            };
        // Metadata wrapper
        case Op.METADATA:
            return {
                kind: "metadata",
                metadata: bc[1],
                inner: bc[2],
            };
        // Port
        case Op.PORT: {
            const portName = bc[1];
            const methodCount = bc[2];
            const methods = [];
            let offset = 3;
            for (let i = 0; i < methodCount; i++) {
                if (bc[offset] !== Op.PORT_METHOD) {
                    throw new Error("Corrupt bytecode: expected PORT_METHOD marker");
                }
                const name = bc[offset + 1];
                const paramCount = bc[offset + 2];
                const params = [];
                for (let j = 0; j < paramCount; j++) {
                    params.push(bc[offset + 3 + j]);
                }
                const returnType = bc[offset + 3 + paramCount];
                methods.push({ name, params, returnType });
                offset += 3 + paramCount + 1;
            }
            return { kind: "port", portName, methods };
        }
        // Effect
        case Op.EFFECT:
            return {
                kind: "effect",
                effectType: bc[1],
                returnType: bc[2],
            };
        default:
            throw new Error(`Unsupported opcode for introspection: ${op}`);
    }
}
// ============================================================================
// Convenience Helpers
// ============================================================================
/**
 * Get the kind of a schema without full introspection.
 * Useful for quick type checks.
 *
 * @param schema - The bytecode schema
 * @returns The kind string (e.g., "object", "array", "primitive")
 */
export function getKind(schema) {
    assertBytecode(schema);
    const bc = schema;
    const op = bc[0];
    switch (op) {
        case Op.STRING:
        case Op.NUMBER:
        case Op.BOOLEAN:
        case Op.NULL:
        case Op.UNDEFINED:
            return "primitive";
        case Op.LITERAL:
            return "literal";
        case Op.ARRAY:
            return "array";
        case Op.TUPLE:
            return "tuple";
        case Op.OBJECT:
            return "object";
        case Op.UNION:
            return "union";
        case Op.DUNION:
            return "dunion";
        case Op.BRAND:
            return "brand";
        case Op.READONLY:
            return "readonly";
        case Op.REFINE_MIN:
        case Op.REFINE_MAX:
        case Op.REFINE_INTEGER:
        case Op.REFINE_MIN_LENGTH:
        case Op.REFINE_MAX_LENGTH:
        case Op.REFINE_MIN_ITEMS:
        case Op.REFINE_MAX_ITEMS:
        case Op.REFINE_EMAIL:
        case Op.REFINE_URL:
        case Op.REFINE_PATTERN:
        case Op.REFINE_POSITIVE:
        case Op.REFINE_NEGATIVE:
        case Op.REFINE_NON_EMPTY:
            return "refinement";
        case Op.RESULT_OK:
        case Op.RESULT_ERR:
            return "result";
        case Op.OPTION_SOME:
        case Op.OPTION_NONE:
            return "option";
        case Op.METADATA:
            return "metadata";
        case Op.PORT:
            return "port";
        case Op.EFFECT:
            return "effect";
        default:
            throw new Error(`Unknown opcode: ${op}`);
    }
}
/**
 * Extract properties from an OBJECT schema.
 * Returns empty array if the schema is not an object.
 *
 * @param schema - The bytecode schema
 * @returns Array of property info, or empty array if not an object
 */
export function getProperties(schema) {
    const info = introspect(schema);
    return info.kind === "object" ? info.properties : [];
}
/**
 * Extract variants from a DUNION schema.
 * Returns empty array if the schema is not a discriminated union.
 *
 * @param schema - The bytecode schema
 * @returns Array of variant info, or empty array if not a DUNION
 */
export function getVariants(schema) {
    const info = introspect(schema);
    return info.kind === "dunion" ? info.variants : [];
}
/**
 * Extract refinements from a schema.
 * Returns empty array if the schema has no refinements.
 *
 * @param schema - The bytecode schema
 * @returns Array of refinement constraints
 */
export function getRefinements(schema) {
    const info = introspect(schema);
    return info.kind === "refinement" ? info.refinements : [];
}
/**
 * Unwrap a BRAND wrapper to get the inner schema.
 * Returns the schema unchanged if it's not a brand.
 *
 * @param schema - The bytecode schema
 * @returns The inner schema, or the schema itself if not a brand
 */
export function unwrapBrand(schema) {
    const info = introspect(schema);
    return info.kind === "brand" ? info.inner : schema;
}
/**
 * Unwrap a READONLY wrapper to get the inner schema.
 * Returns the schema unchanged if it's not readonly.
 *
 * @param schema - The bytecode schema
 * @returns The inner schema, or the schema itself if not readonly
 */
export function unwrapReadonly(schema) {
    const info = introspect(schema);
    return info.kind === "readonly" ? info.inner : schema;
}
/**
 * Unwrap all wrapper layers (BRAND, READONLY, REFINEMENT, METADATA) to get the base schema.
 * Recursively unwraps until reaching a non-wrapper type.
 *
 * @param schema - The bytecode schema
 * @returns The innermost schema without wrappers
 *
 * @example
 * ```ts
 * // Given: Readonly<UserId> where UserId = string & { __brand: "UserId" } & Min<0>
 * // Returns: string schema
 * const base = unwrapAll(complexSchema);
 * ```
 */
export function unwrapAll(schema) {
    let current = schema;
    let maxDepth = 100; // Prevent infinite loops
    while (maxDepth-- > 0) {
        const info = introspect(current);
        if (info.kind === "brand" || info.kind === "readonly" || info.kind === "refinement") {
            current = info.inner;
        }
        else if (info.kind === "metadata") {
            current = info.inner;
        }
        else {
            // Reached non-wrapper type
            return current;
        }
    }
    throw new Error("Maximum unwrap depth exceeded (possible cyclic schema)");
}
/**
 * Traverse a schema tree with a visitor pattern.
 * Calls the appropriate visitor method based on the schema kind.
 *
 * @param schema - The bytecode schema to traverse
 * @param visitor - Visitor object with methods for each schema kind
 * @returns The result from the visitor method
 * @throws Error if no visitor method is defined for the schema kind
 *
 * @example
 * ```ts
 * // Count total number of properties across nested objects
 * let count = 0;
 * traverse(schema, {
 *   object: (properties) => {
 *     count += properties.length;
 *     properties.forEach(prop => traverse(prop.type, visitor));
 *   },
 * });
 * ```
 */
export function traverse(schema, visitor) {
    const info = introspect(schema);
    switch (info.kind) {
        case "primitive":
            if (!visitor.primitive) {
                throw new Error("Visitor must define 'primitive' method");
            }
            return visitor.primitive(info.type);
        case "literal":
            if (!visitor.literal) {
                throw new Error("Visitor must define 'literal' method");
            }
            return visitor.literal(info.value);
        case "array":
            if (!visitor.array) {
                throw new Error("Visitor must define 'array' method");
            }
            return visitor.array(info.element);
        case "tuple":
            if (!visitor.tuple) {
                throw new Error("Visitor must define 'tuple' method");
            }
            return visitor.tuple(info.elements);
        case "object":
            if (!visitor.object) {
                throw new Error("Visitor must define 'object' method");
            }
            return visitor.object(info.properties, info.strict);
        case "union":
            if (!visitor.union) {
                throw new Error("Visitor must define 'union' method");
            }
            return visitor.union(info.alternatives);
        case "dunion":
            if (!visitor.dunion) {
                throw new Error("Visitor must define 'dunion' method");
            }
            return visitor.dunion(info.discriminant, info.variants);
        case "brand":
            if (!visitor.brand) {
                throw new Error("Visitor must define 'brand' method");
            }
            return visitor.brand(info.tag, info.inner);
        case "readonly":
            if (!visitor.readonly) {
                throw new Error("Visitor must define 'readonly' method");
            }
            return visitor.readonly(info.inner);
        case "refinement":
            if (!visitor.refinement) {
                throw new Error("Visitor must define 'refinement' method");
            }
            return visitor.refinement(info.refinements, info.inner);
        case "result":
            if (!visitor.result) {
                throw new Error("Visitor must define 'result' method");
            }
            return visitor.result(info.valueType, info.errorType);
        case "option":
            if (!visitor.option) {
                throw new Error("Visitor must define 'option' method");
            }
            return visitor.option(info.valueType);
        case "metadata":
            if (!visitor.metadata) {
                throw new Error("Visitor must define 'metadata' method");
            }
            return visitor.metadata(info.metadata, info.inner);
        case "port":
            if (!visitor.port) {
                throw new Error("Visitor must define 'port' method");
            }
            return visitor.port(info.portName, info.methods);
        case "effect":
            if (!visitor.effect) {
                throw new Error("Visitor must define 'effect' method");
            }
            return visitor.effect(info.effectType, info.returnType);
    }
}
// ============================================================================
// Schema Identity
// ============================================================================
/**
 * Compute a stable hash of a schema structure.
 * Schemas with identical structure produce the same hash.
 *
 * Note: This is NOT a cryptographic hash. It's designed for:
 * - Schema identity comparison
 * - Cache keys
 * - Deduplication
 *
 * @param schema - The bytecode schema to hash
 * @returns A stable string hash of the schema structure
 *
 * @example
 * ```ts
 * const hash1 = hashSchema(User$);
 * const hash2 = hashSchema(User$);
 * assert(hash1 === hash2);
 * ```
 */
export function hashSchema(schema) {
    // Simple but stable hash: serialize bytecode to JSON
    // This is not optimized for performance, but works for initial implementation
    return JSON.stringify(schema);
}
/**
 * Check if two schemas have identical structure.
 * This is a deep structural comparison.
 *
 * @param schemaA - First schema
 * @param schemaB - Second schema
 * @returns true if schemas are structurally identical
 *
 * @example
 * ```ts
 * if (schemasEqual(actualSchema, expectedSchema)) {
 *   console.log("Schemas match!");
 * }
 * ```
 */
export function schemasEqual(schemaA, schemaB) {
    // For now, use hash comparison
    // Future: optimize with custom deep-equal that short-circuits
    return hashSchema(schemaA) === hashSchema(schemaB);
}
// ============================================================================
// Internal Helpers
// ============================================================================
function assertBytecode(schema) {
    if (!Array.isArray(schema)) {
        throw new Error("Expected bytecode array, got: " + typeof schema);
    }
    if (schema.length === 0) {
        throw new Error("Invalid bytecode: empty array");
    }
}
