// packages/lfts-codegen/form-config.ts
// Form configuration generator for UI frameworks

import { introspect, type TypeObject } from "../lfts-type-runtime/mod.ts";
import type { SchemaInfo } from "../lfts-type-runtime/introspection.ts";

/**
 * Form field configuration
 */
export type FormField = {
  name: string;
  label: string;
  type: "text" | "number" | "email" | "url" | "checkbox" | "select" | "textarea" | "date";
  required: boolean;
  validation?: {
    min?: number;
    max?: number;
    minLength?: number;
    maxLength?: number;
    pattern?: string;
    email?: boolean;
    url?: boolean;
  };
  options?: string[]; // For select fields
  placeholder?: string;
  helpText?: string;
};

/**
 * Complete form configuration
 */
export type FormConfig = {
  fields: FormField[];
  title?: string;
  description?: string;
};

/**
 * Generate form configuration from an LFTS bytecode schema
 *
 * @param schema - LFTS bytecode schema (must be an object)
 * @param options - Generation options
 * @returns Form configuration
 *
 * @example
 * ```ts
 * import { generateFormConfig } from "lfts-codegen";
 *
 * const formConfig = generateFormConfig(User$, {
 *   title: "User Registration",
 * });
 *
 * // Use with your UI framework
 * formConfig.fields.forEach(field => {
 *   renderFormField(field);
 * });
 * ```
 */
export function generateFormConfig(
  schema: TypeObject,
  options: { title?: string; description?: string } = {},
): FormConfig {
  const info = introspect(schema);

  if (info.kind === "metadata") {
    // Extract metadata and use inner schema
    const config = generateFormConfig(info.inner, options);
    if (!config.title && info.metadata.name) {
      config.title = info.metadata.name;
    }
    if (!config.description && info.metadata.source) {
      config.description = `From: ${info.metadata.source}`;
    }
    return config;
  }

  if (info.kind !== "object") {
    throw new Error("Form config can only be generated from object schemas");
  }

  const fields: FormField[] = info.properties.map((prop) => {
    return convertPropertyToField(prop.name, prop.type, !prop.optional);
  });

  return {
    fields,
    title: options.title,
    description: options.description,
  };
}

function convertPropertyToField(
  name: string,
  schema: TypeObject,
  required: boolean,
): FormField {
  const info = introspect(schema);

  // Base field
  const field: FormField = {
    name,
    label: capitalizeFirst(name),
    type: "text",
    required,
  };

  // Unwrap wrappers
  if (info.kind === "brand" || info.kind === "readonly" || info.kind === "metadata") {
    return convertPropertyToField(name, info.inner, required);
  }

  // Handle refinements
  if (info.kind === "refinement") {
    const validation: FormField["validation"] = {};

    for (const refinement of info.refinements) {
      switch (refinement.kind) {
        case "min":
          validation.min = refinement.value;
          break;
        case "max":
          validation.max = refinement.value;
          break;
        case "minLength":
          validation.minLength = refinement.value;
          break;
        case "maxLength":
          validation.maxLength = refinement.value;
          break;
        case "email":
          validation.email = true;
          field.type = "email";
          break;
        case "url":
          validation.url = true;
          field.type = "url";
          break;
        case "pattern":
          validation.pattern = refinement.pattern;
          break;
      }
    }

    field.validation = validation;

    // Get the base type from refinement
    const innerInfo = introspect(info.inner);
    if (innerInfo.kind === "primitive") {
      switch (innerInfo.type) {
        case "number":
          field.type = "number";
          break;
        case "boolean":
          field.type = "checkbox";
          break;
        case "string":
          // Already set by refinements or default
          break;
      }
    }

    return field;
  }

  // Handle primitives
  if (info.kind === "primitive") {
    switch (info.type) {
      case "string":
        field.type = "text";
        break;
      case "number":
        field.type = "number";
        break;
      case "boolean":
        field.type = "checkbox";
        break;
    }
    return field;
  }

  // Handle literals as select with single option
  if (info.kind === "literal") {
    field.type = "select";
    field.options = [String(info.value)];
    return field;
  }

  // Handle unions as select
  if (info.kind === "union") {
    const options: string[] = [];
    for (const alt of info.alternatives) {
      const altInfo = introspect(alt);
      if (altInfo.kind === "literal") {
        options.push(String(altInfo.value));
      }
    }
    if (options.length > 0) {
      field.type = "select";
      field.options = options;
    }
    return field;
  }

  // Handle discriminated unions as select
  if (info.kind === "dunion") {
    field.type = "select";
    field.options = info.variants.map((v) => v.tag);
    return field;
  }

  // Arrays -> textarea for now (could be improved)
  if (info.kind === "array") {
    field.type = "textarea";
    field.helpText = "Enter comma-separated values";
    return field;
  }

  return field;
}

function capitalizeFirst(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
