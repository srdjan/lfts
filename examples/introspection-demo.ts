// examples/introspection-demo.ts
// Demonstration of the LFTS Introspection API

import { enc } from "../packages/lfts-type-spec/src/mod.ts";
import {
  getKind,
  getProperties,
  getVariants,
  hashSchema,
  introspect,
  schemasEqual,
  traverse,
  unwrapAll,
} from "../packages/lfts-type-runtime/mod.ts";

console.log("=".repeat(60));
console.log("LFTS Introspection API Demo");
console.log("=".repeat(60));

// ============================================================================
// Example 1: Basic Schema Inspection
// ============================================================================

console.log("\n1. Basic Schema Inspection");
console.log("-".repeat(60));

const UserSchema = enc.obj([
  { name: "id", type: enc.brand(enc.str(), "UserId"), optional: false },
  { name: "name", type: enc.str(), optional: false },
  { name: "email", type: enc.refine.email(enc.str()), optional: false },
  { name: "age", type: enc.refine.min(enc.refine.max(enc.num(), 120), 0), optional: true },
]);

const info = introspect(UserSchema);
console.log(`Schema kind: ${info.kind}`);

if (info.kind === "object") {
  console.log(`Properties: ${info.properties.length}`);
  info.properties.forEach((prop) => {
    console.log(`  - ${prop.name}: ${prop.optional ? "optional" : "required"}`);
  });
}

// ============================================================================
// Example 2: Convenience Helpers
// ============================================================================

console.log("\n2. Convenience Helpers");
console.log("-".repeat(60));

const properties = getProperties(UserSchema);
console.log(`getProperties() returned ${properties.length} properties`);

const kind = getKind(UserSchema);
console.log(`getKind() returned: "${kind}"`);

// ============================================================================
// Example 3: Unwrapping Wrappers
// ============================================================================

console.log("\n3. Unwrapping Wrappers");
console.log("-".repeat(60));

const ComplexSchema = enc.ro(
  enc.brand(
    enc.refine.min(enc.refine.max(enc.num(), 100), 0),
    "Age",
  ),
);

console.log("Complex schema: Readonly<Brand<Refinements<number>>>");
const baseSchema = unwrapAll(ComplexSchema);
const baseInfo = introspect(baseSchema);
console.log(`unwrapAll() result: ${baseInfo.kind === "primitive" ? baseInfo.type : baseInfo.kind}`);

// ============================================================================
// Example 4: Discriminated Union (ADT) Inspection
// ============================================================================

console.log("\n4. Discriminated Union (ADT) Inspection");
console.log("-".repeat(60));

const ActionSchema = enc.dunion("type", [
  {
    tag: "add",
    schema: enc.obj([
      { name: "type", type: enc.lit("add"), optional: false },
      { name: "value", type: enc.num(), optional: false },
    ]),
  },
  {
    tag: "remove",
    schema: enc.obj([
      { name: "type", type: enc.lit("remove"), optional: false },
      { name: "id", type: enc.str(), optional: false },
    ]),
  },
  {
    tag: "update",
    schema: enc.obj([
      { name: "type", type: enc.lit("update"), optional: false },
      { name: "id", type: enc.str(), optional: false },
      { name: "value", type: enc.num(), optional: false },
    ]),
  },
]);

const variants = getVariants(ActionSchema);
console.log(`ADT has ${variants.length} variants:`);
variants.forEach((v) => console.log(`  - ${v.tag}`));

// ============================================================================
// Example 5: Schema Traversal
// ============================================================================

console.log("\n5. Schema Traversal (Count Properties)");
console.log("-".repeat(60));

let propertyCount = 0;

traverse(UserSchema, {
  object: (properties) => {
    propertyCount += properties.length;
    // Recursively traverse property types
    properties.forEach((prop) => {
      try {
        traverse(prop.type, {
          object: (props) => {
            propertyCount += props.length;
            return null;
          },
          primitive: () => null,
          literal: () => null,
          array: () => null,
          tuple: () => null,
          union: () => null,
          dunion: () => null,
          brand: () => null,
          readonly: () => null,
          refinement: () => null,
          result: () => null,
          option: () => null,
          metadata: () => null,
          port: () => null,
          effect: () => null,
        });
      } catch {
        // Ignore errors from inner traversals
      }
    });
    return null;
  },
});

console.log(`Total properties in schema tree: ${propertyCount}`);

// ============================================================================
// Example 6: Schema Identity
// ============================================================================

console.log("\n6. Schema Identity (Hashing & Equality)");
console.log("-".repeat(60));

const Schema1 = enc.obj([
  { name: "id", type: enc.num(), optional: false },
  { name: "name", type: enc.str(), optional: false },
]);

const Schema2 = enc.obj([
  { name: "id", type: enc.num(), optional: false },
  { name: "name", type: enc.str(), optional: false },
]);

const Schema3 = enc.obj([
  { name: "id", type: enc.str(), optional: false }, // Different type!
  { name: "name", type: enc.str(), optional: false },
]);

console.log(`Schema1 hash: ${hashSchema(Schema1).substring(0, 40)}...`);
console.log(`Schema2 hash: ${hashSchema(Schema2).substring(0, 40)}...`);
console.log(`Schema3 hash: ${hashSchema(Schema3).substring(0, 40)}...`);

console.log(`\nSchema1 === Schema2? ${schemasEqual(Schema1, Schema2)}`);
console.log(`Schema1 === Schema3? ${schemasEqual(Schema1, Schema3)}`);

// ============================================================================
// Example 7: Generate JSON Schema
// ============================================================================

console.log("\n7. Generate JSON Schema (Simplified)");
console.log("-".repeat(60));

function toJsonSchema(schema: any): any {
  const info = introspect(schema);

  switch (info.kind) {
    case "primitive":
      return { type: info.type === "null" ? "null" : info.type };
    case "literal":
      return { enum: [info.value] };
    case "object":
      return {
        type: "object",
        properties: Object.fromEntries(
          info.properties.map((p) => [p.name, toJsonSchema(p.type)]),
        ),
        required: info.properties.filter((p) => !p.optional).map((p) => p.name),
      };
    case "array":
      return {
        type: "array",
        items: toJsonSchema(info.element),
      };
    case "brand":
      // Brands are transparent in JSON Schema
      return toJsonSchema(info.inner);
    case "refinement":
      // Simplified: just return inner type for this demo
      return toJsonSchema(info.inner);
    default:
      return { type: "object" };
  }
}

const SimpleSchema = enc.obj([
  { name: "id", type: enc.num(), optional: false },
  { name: "tags", type: enc.arr(enc.str()), optional: false },
]);

const jsonSchema = toJsonSchema(SimpleSchema);
console.log("Generated JSON Schema:");
console.log(JSON.stringify(jsonSchema, null, 2));

// ============================================================================
// Example 8: Schema Documentation Generator
// ============================================================================

console.log("\n8. Schema Documentation Generator");
console.log("-".repeat(60));

function documentSchema(name: string, schema: any): string {
  const info = introspect(schema);
  let doc = `### ${name}\n\n`;

  if (info.kind === "object") {
    doc += "**Properties:**\n\n";
    for (const prop of info.properties) {
      const optional = prop.optional ? " (optional)" : " (required)";
      doc += `- \`${prop.name}\`${optional}\n`;
    }
  } else if (info.kind === "dunion") {
    doc += `**Discriminated by:** \`${info.discriminant}\`\n\n`;
    doc += "**Variants:**\n\n";
    for (const variant of info.variants) {
      doc += `- \`${variant.tag}\`\n`;
    }
  }

  return doc;
}

console.log(documentSchema("User", UserSchema));
console.log(documentSchema("Action", ActionSchema));

console.log("\n" + "=".repeat(60));
console.log("Demo Complete!");
console.log("=".repeat(60));
