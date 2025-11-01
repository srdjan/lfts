// packages/lfts-codegen/mock-data.ts
// Mock data generator for testing

import { introspect, type TypeObject } from "../lfts-type-runtime/mod.ts";
import type { SchemaInfo } from "../lfts-type-runtime/introspection.ts";

/**
 * Options for mock data generation
 */
export type MockOptions = {
  /** Seed for deterministic generation (default: random) */
  seed?: number;
  /** Include optional fields (default: 0.5 probability) */
  optionalProbability?: number;
  /** Maximum array length (default: 3) */
  maxArrayLength?: number;
  /** Minimum array length (default: 1) */
  minArrayLength?: number;
};

const DEFAULT_OPTIONS: Required<MockOptions> = {
  seed: Math.random() * 1000000,
  optionalProbability: 0.5,
  maxArrayLength: 3,
  minArrayLength: 1,
};

// Simple seeded random number generator
class SeededRandom {
  private seed: number;

  constructor(seed: number) {
    this.seed = seed;
  }

  next(): number {
    this.seed = (this.seed * 9301 + 49297) % 233280;
    return this.seed / 233280;
  }

  nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  nextBoolean(): boolean {
    return this.next() < 0.5;
  }

  choose<T>(array: readonly T[]): T {
    return array[this.nextInt(0, array.length - 1)];
  }

  nextDigit(): string {
    return String(this.nextInt(0, 9));
  }

  nextUpperLetter(): string {
    return String.fromCharCode(65 + this.nextInt(0, 25)); // A-Z
  }

  nextLowerLetter(): string {
    return String.fromCharCode(97 + this.nextInt(0, 25)); // a-z
  }
}

/**
 * Generate a string matching common regex patterns
 */
function generatePatternString(pattern: string, rng: SeededRandom): string {
  // Handle common patterns
  if (pattern === "^\\d{5}$") {
    // US ZIP code
    return Array.from({ length: 5 }, () => rng.nextDigit()).join("");
  }
  if (pattern === "^\\d{5}-\\d{4}$") {
    // US ZIP+4 code
    return `${Array.from({ length: 5 }, () => rng.nextDigit()).join("")}-${
      Array.from({ length: 4 }, () => rng.nextDigit()).join("")
    }`;
  }
  if (pattern === "^[A-Z]+$") {
    // Uppercase letters only
    return "MOCK";
  }
  if (pattern === "^[a-z]+$") {
    // Lowercase letters only
    return "mock";
  }
  if (pattern === "^[A-Z]{2}$") {
    // Two uppercase letters (state code)
    return rng.nextUpperLetter() + rng.nextUpperLetter();
  }
  if (pattern.match(/^\^\\d\{(\d+)\}\$$/)) {
    // Exactly N digits
    const match = pattern.match(/^\^\\d\{(\d+)\}\$$/);
    if (match) {
      const length = parseInt(match[1]);
      return Array.from({ length }, () => rng.nextDigit()).join("");
    }
  }

  // Fallback: generate a simple string that might match
  return "mock-value";
}

/**
 * Generate mock data from an LFTS bytecode schema
 *
 * @param schema - LFTS bytecode schema
 * @param options - Generation options
 * @returns Mock data matching the schema
 *
 * @example
 * ```ts
 * import { generateMockData } from "lfts-codegen";
 *
 * const mockUser = generateMockData(User$, {
 *   seed: 12345, // Deterministic generation
 *   optionalProbability: 1.0, // Always include optional fields
 * });
 *
 * console.log(mockUser);
 * // {
 * //   id: "mock-string-0",
 * //   name: "mock-string-1",
 * //   email: "user@example.com",
 * //   age: 42
 * // }
 * ```
 */
export function generateMockData(
  schema: TypeObject,
  options: MockOptions = {},
): unknown {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const rng = new SeededRandom(opts.seed);
  let counter = 0;

  return generate(schema, rng);

  function generate(currentSchema: TypeObject, rng: SeededRandom): unknown {
    const info = introspect(currentSchema);

    switch (info.kind) {
      case "primitive":
        return generatePrimitive(info, rng);

      case "literal":
        return info.value;

      case "array": {
        const length = rng.nextInt(opts.minArrayLength, opts.maxArrayLength);
        return Array.from({ length }, () => generate(info.element, rng));
      }

      case "tuple":
        return info.elements.map((el) => generate(el, rng));

      case "object": {
        const result: Record<string, unknown> = {};
        for (const prop of info.properties) {
          if (!prop.optional || rng.next() < opts.optionalProbability) {
            result[prop.name] = generate(prop.type, rng);
          }
        }
        return result;
      }

      case "union":
        // Pick a random alternative
        return generate(rng.choose(info.alternatives), rng);

      case "dunion": {
        // Pick a random variant
        const variant = rng.choose(info.variants);
        return generate(variant.schema, rng);
      }

      case "brand":
        // Brands are transparent at runtime
        return generate(info.inner, rng);

      case "readonly":
        // Readonly is transparent at runtime
        return generate(info.inner, rng);

      case "refinement":
        return generateRefinement(info, rng);

      case "metadata":
        // Metadata is transparent
        return generate(info.inner, rng);

      case "result":
        // Generate a success result
        if (info.valueType) {
          return { ok: true, value: generate(info.valueType, rng) };
        }
        return { ok: true, value: null };

      case "option":
        // 50% chance of Some vs None
        if (rng.nextBoolean() && info.valueType) {
          return generate(info.valueType, rng);
        }
        return null;

      case "port":
        // Ports can't be mocked (runtime behavior)
        return {};

      case "effect":
        // Effects can't be mocked (runtime behavior)
        return {};
    }
  }

  function generatePrimitive(
    info: Extract<SchemaInfo, { kind: "primitive" }>,
    rng: SeededRandom,
  ): unknown {
    switch (info.type) {
      case "string":
        return `mock-string-${counter++}`;
      case "number":
        return rng.nextInt(0, 100);
      case "boolean":
        return rng.nextBoolean();
      case "null":
        return null;
      case "undefined":
        return undefined;
    }
  }

  function generateRefinement(
    info: Extract<SchemaInfo, { kind: "refinement" }>,
    rng: SeededRandom,
  ): unknown {
    const innerInfo = introspect(info.inner);

    // Apply refinement constraints
    if (innerInfo.kind === "primitive") {
      if (innerInfo.type === "string") {
        let value = `mock-string-${counter++}`;

        // Apply refinement constraints in order
        for (const ref of info.refinements) {
          if (ref.kind === "email") {
            value = `user${counter}@example.com`;
          } else if (ref.kind === "url") {
            value = `https://example.com/${counter}`;
          } else if (ref.kind === "pattern") {
            // Generate value matching common patterns
            value = generatePatternString(ref.pattern, rng);
          }
        }

        // Apply length constraints after pattern/email/url
        for (const ref of info.refinements) {
          if (ref.kind === "minLength" && value.length < ref.value) {
            value = value.padEnd(ref.value, "x");
          }
          if (ref.kind === "maxLength" && value.length > ref.value) {
            value = value.substring(0, ref.value);
          }
        }

        return value;
      }

      if (innerInfo.type === "number") {
        let min = 0;
        let max = 100;

        // Apply numeric constraints
        for (const ref of info.refinements) {
          if (ref.kind === "min") {
            min = ref.value;
          }
          if (ref.kind === "max") {
            max = ref.value;
          }
        }

        let value = rng.nextInt(min, max);

        // Apply integer constraint
        for (const ref of info.refinements) {
          if (ref.kind === "integer") {
            value = Math.floor(value);
          }
        }

        return value;
      }
    }

    // Fallback: just generate the inner type
    return generate(info.inner, rng);
  }
}
