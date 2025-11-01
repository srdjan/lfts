// packages/lfts-codegen/json-schema.ts
// JSON Schema (Draft 2020-12) generator from LFTS bytecode schemas

import { introspect, type TypeObject } from "../lfts-type-runtime/mod.ts";
import type { SchemaInfo } from "../lfts-type-runtime/introspection.ts";

/**
 * JSON Schema output format
 * Follows JSON Schema Draft 2020-12 specification
 */
export type JsonSchema = {
  $schema?: string;
  $id?: string;
  title?: string;
  description?: string;
  type?: string | string[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  prefixItems?: JsonSchema[];
  enum?: (string | number | boolean)[];
  const?: string | number | boolean;
  oneOf?: JsonSchema[];
  anyOf?: JsonSchema[];
  allOf?: JsonSchema[];
  not?: JsonSchema;
  discriminator?: {
    propertyName: string;
    mapping?: Record<string, string>;
  };
  additionalProperties?: boolean | JsonSchema;
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  multipleOf?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  format?: string;
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;
  [key: string]: unknown;
};

/**
 * Options for JSON Schema generation
 */
export type JsonSchemaOptions = {
  /** Include $schema property (default: true) */
  includeSchema?: boolean;
  /** Schema draft version (default: "2020-12") */
  draft?: "2020-12" | "2019-09" | "07" | "04";
  /** Include title from metadata (default: true) */
  includeTitle?: boolean;
  /** Include description from metadata (default: true) */
  includeDescription?: boolean;
  /** Strict mode: set additionalProperties: false (default: false) */
  strict?: boolean;
  /** Custom format mappings for refinements */
  formatMappings?: {
    email?: string;
    url?: string;
    [key: string]: string | undefined;
  };
};

const DEFAULT_OPTIONS: Required<JsonSchemaOptions> = {
  includeSchema: true,
  draft: "2020-12",
  includeTitle: true,
  includeDescription: true,
  strict: false,
  formatMappings: {
    email: "email",
    url: "uri",
  },
};

/**
 * Generate JSON Schema from an LFTS bytecode schema
 *
 * @param schema - LFTS bytecode schema
 * @param options - Generation options
 * @returns JSON Schema object
 *
 * @example
 * ```ts
 * import { generateJsonSchema } from "lfts-codegen";
 *
 * const jsonSchema = generateJsonSchema(User$, {
 *   includeSchema: true,
 *   strict: true,
 * });
 *
 * console.log(JSON.stringify(jsonSchema, null, 2));
 * ```
 */
export function generateJsonSchema(
  schema: TypeObject,
  options: JsonSchemaOptions = {},
): JsonSchema {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const result = convertSchema(schema, opts);

  // Add $schema property at root level
  if (opts.includeSchema) {
    const draftUrls = {
      "2020-12": "https://json-schema.org/draft/2020-12/schema",
      "2019-09": "https://json-schema.org/draft/2019-09/schema",
      "07": "http://json-schema.org/draft-07/schema#",
      "04": "http://json-schema.org/draft-04/schema#",
    };
    result.$schema = draftUrls[opts.draft];
  }

  return result;
}

function convertSchema(
  schema: TypeObject,
  opts: Required<JsonSchemaOptions>,
): JsonSchema {
  const info = introspect(schema);

  switch (info.kind) {
    case "primitive":
      return convertPrimitive(info);

    case "literal":
      return convertLiteral(info);

    case "array":
      return convertArray(info, opts);

    case "tuple":
      return convertTuple(info, opts);

    case "object":
      return convertObject(info, opts);

    case "union":
      return convertUnion(info, opts);

    case "dunion":
      return convertDiscriminatedUnion(info, opts);

    case "brand":
      // Brands are transparent in JSON Schema
      return convertSchema(info.inner, opts);

    case "readonly":
      // Readonly is transparent in JSON Schema
      return convertSchema(info.inner, opts);

    case "refinement":
      return convertRefinement(info, opts);

    case "metadata":
      // Extract metadata and apply to inner schema
      const innerSchema = convertSchema(info.inner, opts);
      if (opts.includeTitle && info.metadata.name) {
        innerSchema.title = info.metadata.name;
      }
      if (opts.includeDescription && info.metadata.source) {
        innerSchema.description = `Source: ${info.metadata.source}`;
      }
      return innerSchema;

    case "result":
      // Result types are application-specific, represent as anyOf
      if (info.valueType && info.errorType) {
        return {
          anyOf: [
            { ...convertSchema(info.valueType, opts), title: "Success" },
            { ...convertSchema(info.errorType, opts), title: "Error" },
          ],
        };
      } else if (info.valueType) {
        return convertSchema(info.valueType, opts);
      } else if (info.errorType) {
        return convertSchema(info.errorType, opts);
      }
      return { type: "object" };

    case "option":
      // Option types are nullable values
      if (info.valueType) {
        return {
          anyOf: [
            convertSchema(info.valueType, opts),
            { type: "null" },
          ],
        };
      }
      return { type: "null" };

    case "port":
      // Ports are not representable in JSON Schema (runtime behavior)
      return {
        type: "object",
        description: `Port: ${info.portName}`,
      };

    case "effect":
      // Effects are not representable in JSON Schema (runtime behavior)
      return {
        type: "object",
        description: `Effect: ${info.effectType}`,
      };
  }
}

function convertPrimitive(info: Extract<SchemaInfo, { kind: "primitive" }>): JsonSchema {
  const typeMap: Record<string, string> = {
    string: "string",
    number: "number",
    boolean: "boolean",
    null: "null",
    undefined: "null", // JSON Schema uses null for undefined
  };
  return { type: typeMap[info.type] };
}

function convertLiteral(info: Extract<SchemaInfo, { kind: "literal" }>): JsonSchema {
  return { const: info.value };
}

function convertArray(
  info: Extract<SchemaInfo, { kind: "array" }>,
  opts: Required<JsonSchemaOptions>,
): JsonSchema {
  return {
    type: "array",
    items: convertSchema(info.element, opts),
  };
}

function convertTuple(
  info: Extract<SchemaInfo, { kind: "tuple" }>,
  opts: Required<JsonSchemaOptions>,
): JsonSchema {
  return {
    type: "array",
    prefixItems: info.elements.map((el) => convertSchema(el, opts)),
    minItems: info.elements.length,
    maxItems: info.elements.length,
  };
}

function convertObject(
  info: Extract<SchemaInfo, { kind: "object" }>,
  opts: Required<JsonSchemaOptions>,
): JsonSchema {
  const properties: Record<string, JsonSchema> = {};
  const required: string[] = [];

  for (const prop of info.properties) {
    properties[prop.name] = convertSchema(prop.type, opts);
    if (!prop.optional) {
      required.push(prop.name);
    }
  }

  const result: JsonSchema = {
    type: "object",
    properties,
  };

  if (required.length > 0) {
    result.required = required;
  }

  // Apply strict mode or schema's own strict flag
  if (opts.strict || info.strict) {
    result.additionalProperties = false;
  }

  return result;
}

function convertUnion(
  info: Extract<SchemaInfo, { kind: "union" }>,
  opts: Required<JsonSchemaOptions>,
): JsonSchema {
  return {
    anyOf: info.alternatives.map((alt) => convertSchema(alt, opts)),
  };
}

function convertDiscriminatedUnion(
  info: Extract<SchemaInfo, { kind: "dunion" }>,
  opts: Required<JsonSchemaOptions>,
): JsonSchema {
  return {
    oneOf: info.variants.map((variant) => ({
      ...convertSchema(variant.schema, opts),
      title: variant.tag,
    })),
    discriminator: {
      propertyName: info.discriminant,
    },
  };
}

function convertRefinement(
  info: Extract<SchemaInfo, { kind: "refinement" }>,
  opts: Required<JsonSchemaOptions>,
): JsonSchema {
  // Start with the inner schema
  const baseSchema = convertSchema(info.inner, opts);

  // Apply each refinement constraint
  for (const refinement of info.refinements) {
    switch (refinement.kind) {
      case "min":
        baseSchema.minimum = refinement.value;
        break;
      case "max":
        baseSchema.maximum = refinement.value;
        break;
      case "integer":
        baseSchema.multipleOf = 1;
        break;
      case "minLength":
        baseSchema.minLength = refinement.value;
        break;
      case "maxLength":
        baseSchema.maxLength = refinement.value;
        break;
      case "minItems":
        baseSchema.minItems = refinement.value;
        break;
      case "maxItems":
        baseSchema.maxItems = refinement.value;
        break;
      case "email":
        baseSchema.format = opts.formatMappings.email || "email";
        break;
      case "url":
        baseSchema.format = opts.formatMappings.url || "uri";
        break;
      case "pattern":
        baseSchema.pattern = refinement.pattern;
        break;
    }
  }

  return baseSchema;
}
