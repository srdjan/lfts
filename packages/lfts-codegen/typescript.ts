// packages/lfts-codegen/typescript.ts
// TypeScript type definition generator from LFTS bytecode schemas

import { introspect, type TypeObject } from "../lfts-type-runtime/mod.ts";
import type { SchemaInfo } from "../lfts-type-runtime/introspection.ts";

/**
 * Options for TypeScript generation
 */
export type TypeScriptOptions = {
  /** Use type aliases instead of interfaces for objects (default: true) */
  useTypeAliases?: boolean;
  /** Make all properties readonly (default: false) */
  readonly?: boolean;
  /** Export generated types (default: true) */
  exportTypes?: boolean;
  /** Add JSDoc comments (default: true) */
  includeJsDoc?: boolean;
  /** Use 'unknown' instead of 'any' for fallbacks (default: true) */
  useUnknown?: boolean;
  /** Indentation (default: 2 spaces) */
  indent?: string;
};

const DEFAULT_OPTIONS: Required<TypeScriptOptions> = {
  useTypeAliases: true,
  readonly: false,
  exportTypes: true,
  includeJsDoc: true,
  useUnknown: true,
  indent: "  ",
};

/**
 * Generate TypeScript type definition from an LFTS bytecode schema
 *
 * @param typeName - Name for the generated type
 * @param schema - LFTS bytecode schema
 * @param options - Generation options
 * @returns TypeScript type definition as string
 *
 * @example
 * ```ts
 * import { generateTypeScript } from "lfts-codegen";
 *
 * const typeDefinition = generateTypeScript("User", User$, {
 *   readonly: true,
 *   exportTypes: true,
 * });
 *
 * console.log(typeDefinition);
 * // export type User = {
 * //   readonly id: string;
 * //   readonly name: string;
 * //   readonly email: string;
 * //   readonly age?: number;
 * // };
 * ```
 */
export function generateTypeScript(
  typeName: string,
  schema: TypeObject,
  options: TypeScriptOptions = {},
): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const typeDefinition = convertSchema(schema, opts, 0);

  const exportKeyword = opts.exportTypes ? "export " : "";
  const typeKeyword = opts.useTypeAliases ? "type" : "interface";

  // For interfaces, we need special handling
  if (!opts.useTypeAliases && typeDefinition.startsWith("{")) {
    return `${exportKeyword}${typeKeyword} ${typeName} ${typeDefinition}`;
  }

  return `${exportKeyword}${typeKeyword} ${typeName} = ${typeDefinition};`;
}

function convertSchema(
  schema: TypeObject,
  opts: Required<TypeScriptOptions>,
  depth: number,
): string {
  const info = introspect(schema);

  switch (info.kind) {
    case "primitive":
      return convertPrimitive(info);

    case "literal":
      return convertLiteral(info);

    case "array":
      return convertArray(info, opts, depth);

    case "tuple":
      return convertTuple(info, opts, depth);

    case "object":
      return convertObject(info, opts, depth);

    case "union":
      return convertUnion(info, opts, depth);

    case "dunion":
      return convertDiscriminatedUnion(info, opts, depth);

    case "brand":
      // Represent brands as intersection with brand marker
      const innerType = convertSchema(info.inner, opts, depth);
      return `${innerType} & { readonly __brand: "${info.tag}" }`;

    case "readonly":
      // Apply Readonly<T> wrapper
      const readonlyInner = convertSchema(info.inner, opts, depth);
      return `Readonly<${readonlyInner}>`;

    case "refinement":
      // Refinements are runtime-only, just return the inner type
      return convertSchema(info.inner, opts, depth);

    case "metadata":
      // Metadata is transparent, just use inner type
      return convertSchema(info.inner, opts, depth);

    case "result":
      // Result type as discriminated union
      if (info.valueType && info.errorType) {
        const okType = convertSchema(info.valueType, opts, depth);
        const errType = convertSchema(info.errorType, opts, depth);
        return `{ ok: true; value: ${okType} } | { ok: false; error: ${errType} }`;
      } else if (info.valueType) {
        const valueType = convertSchema(info.valueType, opts, depth);
        return `{ ok: true; value: ${valueType} }`;
      } else if (info.errorType) {
        const errorType = convertSchema(info.errorType, opts, depth);
        return `{ ok: false; error: ${errorType} }`;
      }
      return opts.useUnknown ? "unknown" : "any";

    case "option":
      // Option as nullable type
      if (info.valueType) {
        const valueType = convertSchema(info.valueType, opts, depth);
        return `${valueType} | null`;
      }
      return "null";

    case "port":
      // Generate interface for port
      return convertPort(info, opts, depth);

    case "effect":
      // Effect type as generic wrapper
      const returnType = convertSchema(info.returnType, opts, depth);
      return `Effect<"${info.effectType}", ${returnType}>`;
  }
}

function convertPrimitive(info: Extract<SchemaInfo, { kind: "primitive" }>): string {
  const typeMap: Record<string, string> = {
    string: "string",
    number: "number",
    boolean: "boolean",
    null: "null",
    undefined: "undefined",
  };
  return typeMap[info.type];
}

function convertLiteral(info: Extract<SchemaInfo, { kind: "literal" }>): string {
  if (typeof info.value === "string") {
    return `"${info.value}"`;
  }
  return String(info.value);
}

function convertArray(
  info: Extract<SchemaInfo, { kind: "array" }>,
  opts: Required<TypeScriptOptions>,
  depth: number,
): string {
  const elementType = convertSchema(info.element, opts, depth);
  // Use Array<T> for complex types, T[] for simple types
  if (elementType.includes("|") || elementType.includes("&")) {
    return `Array<${elementType}>`;
  }
  return `${elementType}[]`;
}

function convertTuple(
  info: Extract<SchemaInfo, { kind: "tuple" }>,
  opts: Required<TypeScriptOptions>,
  depth: number,
): string {
  const elements = info.elements.map((el) => convertSchema(el, opts, depth));
  return `[${elements.join(", ")}]`;
}

function convertObject(
  info: Extract<SchemaInfo, { kind: "object" }>,
  opts: Required<TypeScriptOptions>,
  depth: number,
): string {
  if (info.properties.length === 0) {
    return "{}";
  }

  const indent = opts.indent.repeat(depth + 1);
  const closeIndent = opts.indent.repeat(depth);

  const properties = info.properties.map((prop) => {
    const readonlyKeyword = opts.readonly ? "readonly " : "";
    const optional = prop.optional ? "?" : "";
    const propType = convertSchema(prop.type, opts, depth + 1);
    return `${indent}${readonlyKeyword}${prop.name}${optional}: ${propType};`;
  });

  return `{\n${properties.join("\n")}\n${closeIndent}}`;
}

function convertUnion(
  info: Extract<SchemaInfo, { kind: "union" }>,
  opts: Required<TypeScriptOptions>,
  depth: number,
): string {
  const alternatives = info.alternatives.map((alt) => {
    const altType = convertSchema(alt, opts, depth);
    // Wrap in parens if it contains | or &
    if (altType.includes("|") || (altType.includes("&") && !altType.startsWith("{"))) {
      return `(${altType})`;
    }
    return altType;
  });
  return alternatives.join(" | ");
}

function convertDiscriminatedUnion(
  info: Extract<SchemaInfo, { kind: "dunion" }>,
  opts: Required<TypeScriptOptions>,
  depth: number,
): string {
  const variants = info.variants.map((variant) => {
    return convertSchema(variant.schema, opts, depth);
  });
  return variants.join(" | ");
}

function convertPort(
  info: Extract<SchemaInfo, { kind: "port" }>,
  opts: Required<TypeScriptOptions>,
  depth: number,
): string {
  if (info.methods.length === 0) {
    return "{}";
  }

  const indent = opts.indent.repeat(depth + 1);
  const closeIndent = opts.indent.repeat(depth);

  const methods = info.methods.map((method) => {
    const params = method.params.map((param, i) => {
      const paramType = convertSchema(param, opts, depth + 1);
      return `arg${i}: ${paramType}`;
    }).join(", ");
    const returnType = convertSchema(method.returnType, opts, depth + 1);
    return `${indent}${method.name}(${params}): ${returnType};`;
  });

  return `{\n${methods.join("\n")}\n${closeIndent}}`;
}
