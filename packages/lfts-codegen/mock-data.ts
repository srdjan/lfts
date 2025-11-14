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

// Simple seeded random number generator (functional style)
type SeededRandom = {
  readonly seed: number;
};

function createSeededRandom(seed: number): SeededRandom {
  return { seed };
}

function next(rng: SeededRandom): readonly [number, SeededRandom] {
  const newSeed = (rng.seed * 9301 + 49297) % 233280;
  return [newSeed / 233280, { seed: newSeed }];
}

function nextInt(rng: SeededRandom, min: number, max: number): readonly [number, SeededRandom] {
  const [value, newRng] = next(rng);
  return [Math.floor(value * (max - min + 1)) + min, newRng];
}

function nextBoolean(rng: SeededRandom): readonly [boolean, SeededRandom] {
  const [value, newRng] = next(rng);
  return [value < 0.5, newRng];
}

function choose<T>(rng: SeededRandom, array: readonly T[]): readonly [T, SeededRandom] {
  const [index, newRng] = nextInt(rng, 0, array.length - 1);
  return [array[index], newRng];
}

function nextDigit(rng: SeededRandom): readonly [string, SeededRandom] {
  const [value, newRng] = nextInt(rng, 0, 9);
  return [String(value), newRng];
}

function nextUpperLetter(rng: SeededRandom): readonly [string, SeededRandom] {
  const [value, newRng] = nextInt(rng, 0, 25);
  return [String.fromCharCode(65 + value), newRng]; // A-Z
}

function nextLowerLetter(rng: SeededRandom): readonly [string, SeededRandom] {
  const [value, newRng] = nextInt(rng, 0, 25);
  return [String.fromCharCode(97 + value), newRng]; // a-z
}

/**
 * Generate a string matching common regex patterns
 */
function generatePatternString(pattern: string, rngState: { rng: SeededRandom }): string {
  // Helper to get next digit and update state
  const getDigit = (): string => {
    const [digit, newRng] = nextDigit(rngState.rng);
    rngState.rng = newRng;
    return digit;
  };

  const getUpperLetter = (): string => {
    const [letter, newRng] = nextUpperLetter(rngState.rng);
    rngState.rng = newRng;
    return letter;
  };

  // Handle common patterns
  if (pattern === "^\\d{5}$") {
    // US ZIP code
    return Array.from({ length: 5 }, getDigit).join("");
  }
  if (pattern === "^\\d{5}-\\d{4}$") {
    // US ZIP+4 code
    return `${Array.from({ length: 5 }, getDigit).join("")}-${
      Array.from({ length: 4 }, getDigit).join("")
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
    return getUpperLetter() + getUpperLetter();
  }
  if (pattern.match(/^\^\\d\{(\d+)\}\$$/)) {
    // Exactly N digits
    const match = pattern.match(/^\^\\d\{(\d+)\}\$$/);
    if (match) {
      const length = parseInt(match[1]);
      return Array.from({ length }, getDigit).join("");
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
  // Use mutable state holder for functional RNG
  const rngState = { rng: createSeededRandom(opts.seed) };
  let counter = 0;

  return generate(schema);

  function generate(currentSchema: TypeObject): unknown {
    const info = introspect(currentSchema);

    switch (info.kind) {
      case "primitive":
        return generatePrimitive(info, rngState);

      case "literal":
        return info.value;

      case "array": {
        const [length, newRng] = nextInt(rngState.rng, opts.minArrayLength, opts.maxArrayLength);
        rngState.rng = newRng;
        return Array.from({ length }, () => generate(info.element));
      }

      case "tuple":
        return info.elements.map((el) => generate(el));

      case "object": {
        const result: Record<string, unknown> = {};
        for (const prop of info.properties) {
          const [randomValue, newRng] = next(rngState.rng);
          rngState.rng = newRng;
          if (!prop.optional || randomValue < opts.optionalProbability) {
            result[prop.name] = generate(prop.type);
          }
        }
        return result;
      }

      case "union": {
        // Pick a random alternative
        const [alt, newRng] = choose(rngState.rng, info.alternatives);
        rngState.rng = newRng;
        return generate(alt);
      }

      case "dunion": {
        // Pick a random variant
        const [variant, newRng] = choose(rngState.rng, info.variants);
        rngState.rng = newRng;
        return generate(variant.schema);
      }

      case "brand":
        // Brands are transparent at runtime
        return generate(info.inner);

      case "readonly":
        // Readonly is transparent at runtime
        return generate(info.inner);

      case "refinement":
        return generateRefinement(info, rngState);

      case "metadata":
        // Metadata is transparent
        return generate(info.inner);

      case "result":
        // Generate a success result
        if (info.valueType) {
          return { ok: true, value: generate(info.valueType) };
        }
        return { ok: true, value: null };

      case "option": {
        // 50% chance of Some vs None
        const [shouldGenerate, newRng] = nextBoolean(rngState.rng);
        rngState.rng = newRng;
        if (shouldGenerate && info.valueType) {
          return generate(info.valueType);
        }
        return null;
      }

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
    rngState: { rng: SeededRandom },
  ): unknown {
    switch (info.type) {
      case "string":
        return `mock-string-${counter++}`;
      case "number": {
        const [value, newRng] = nextInt(rngState.rng, 0, 100);
        rngState.rng = newRng;
        return value;
      }
      case "boolean": {
        const [value, newRng] = nextBoolean(rngState.rng);
        rngState.rng = newRng;
        return value;
      }
      case "null":
        return null;
      case "undefined":
        return undefined;
    }
  }

  function generateRefinement(
    info: Extract<SchemaInfo, { kind: "refinement" }>,
    rngState: { rng: SeededRandom },
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
            value = generatePatternString(ref.pattern, rngState);
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

        const [value, newRng] = nextInt(rngState.rng, min, max);
        rngState.rng = newRng;

        // Apply integer constraint
        for (const ref of info.refinements) {
          if (ref.kind === "integer") {
            return Math.floor(value);
          }
        }

        return value;
      }
    }

    // Fallback: just generate the inner type
    return generate(info.inner);
  }
}
