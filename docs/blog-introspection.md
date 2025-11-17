---
title: Rich Introspection - Schemas That Know Themselves
date: 2025-01-16
tags: [TypeScript, Runtime Validation, Introspection, Type Systems, Code Generation]
excerpt: Most schema libraries treat schemas as black boxes - you validate data and that's it. LFTS schemas expose their full structure at runtime with zero overhead. Direct property access, no parsing, perfect for code generation.
---

I spent the last few months building a TypeScript type system that compiles to bytecode, and stumbled into something unexpectedly useful: schemas that can explain themselves at runtime.

Here's the cool part - you can ask a schema about its structure without any parsing overhead:

```typescript
const User$ = t.object({
  id: t.string().pattern("^usr_[a-z0-9]+$"),
  email: t.string().email(),
  age: t.number().min(0),
  role: t.union(t.literal("admin"), t.literal("user"))
});

// Direct property access - no parsing needed
console.log(User$.properties.length);        // 4
console.log(User$.properties[0].name);       // "id"
console.log(User$.properties[0].optional);   // false

// Discriminated union? Same story
const Action$ = t.dunion("type", {
  create: t.object({ type: t.literal("create"), data: User$ }),
  delete: t.object({ type: t.literal("delete"), id: t.string() })
});

console.log(Action$.discriminant);           // "type"
console.log(Action$.variants[0].tag);        // "create"
console.log(Action$.variants[1].tag);        // "delete"
```

No reflection. No decorators. No magic. Just bytecode with a thin wrapper that exposes structure on demand.

## Why This Matters

Most schema libraries give you validation and that's it. Zod, Joi, Yup - they're black boxes. You throw data at them, they tell you if it's valid. Want to generate JSON Schema from a Zod schema? You're parsing internal AST nodes or maintaining parallel definitions.

LFTS flips this around. Every schema carries its own structural metadata:

```typescript
// Generate OpenAPI schema? Trivial.
function toOpenAPISchema(schema: Type): object {
  const info = schema.inspect();

  switch (info.kind) {
    case "object":
      return {
        type: "object",
        properties: Object.fromEntries(
          info.properties.map(p => [p.name, toOpenAPISchema(p.type)])
        ),
        required: info.properties
          .filter(p => !p.optional)
          .map(p => p.name)
      };

    case "dunion":
      return {
        discriminator: { propertyName: info.discriminant },
        oneOf: info.variants.map(v => ({
          title: v.tag,
          ...toOpenAPISchema(v.schema)
        }))
      };

    case "refinement":
      const base = toOpenAPISchema(info.inner);
      for (const r of info.refinements) {
        if (r.kind === "min") base.minimum = r.value;
        if (r.kind === "email") base.format = "email";
      }
      return base;

    // ... other cases
  }
}
```

Fifteen lines. No parsing. To me is interesting that this pattern works because bytecode is just nested arrays - the structure is already there, we're just exposing it.

## Direct Access vs Parsing

The difference shows up when you're building tools. I needed to generate form configurations from schemas for a client project. With Zod, I'd be digging through internal `_def` properties or maintaining a parallel schema definition. With LFTS:

```typescript
function generateFormConfig(schema: Type): FormConfig {
  return {
    fields: schema.properties.map(prop => {
      const refinements = getRefinements(prop.type);
      const base = unwrapAll(prop.type);

      return {
        name: prop.name,
        required: !prop.optional,
        type: mapToFormFieldType(base.kind),
        validation: refinements.map(r => ({
          rule: r.kind,
          value: "value" in r ? r.value : undefined
        }))
      };
    })
  };
}
```

`schema.properties` is just an array. Cached on first access, zero overhead after that. No parsing, no traversal, no internal APIs.

## The Architecture

LFTS uses a bytecode format - schemas are nested arrays with opcodes:

```typescript
// This schema:
type User = {
  id: string;
  email: string & Email;
  age: number & Min<0>;
};

// Compiles to:
[
  Op.OBJECT, 3, 0,  // Object with 3 properties, non-strict
  Op.PROPERTY, "id", 0, [Op.STRING],
  Op.PROPERTY, "email", 0, [Op.REFINE_EMAIL, [Op.STRING]],
  Op.PROPERTY, "age", 0, [Op.REFINE_MIN, 0, [Op.NUMBER]]
]
```

The Type Object wrapper sits on top and provides lazy property access:

```typescript
abstract class Type<T> {
  readonly bc: Bytecode;  // Raw bytecode

  get properties(): PropertyInfo[] {
    if (!this._properties) {
      this._properties = parseProperties(this.bc);
    }
    return this._properties;
  }

  // Validation delegates to bytecode interpreter
  validate(value: unknown): T {
    return validateWithResult(this.bc, value, [], 0);
  }
}
```

Fast path (validation) goes straight to the bytecode interpreter - 8-16M operations/sec for primitives, 50-200K ops/sec for unions. Slow path (introspection) uses lazy evaluation and caches results. Zero overhead until you actually need it.

## Real-World Use Cases

**1. Mock Data Generation**

Generate test fixtures from schemas automatically:

```typescript
function generateMock(schema: Type): unknown {
  const info = schema.inspect();

  switch (info.kind) {
    case "object":
      return Object.fromEntries(
        info.properties
          .filter(p => !p.optional || Math.random() > 0.5)
          .map(p => [p.name, generateMock(p.type)])
      );

    case "array":
      return Array.from({ length: 3 }, () => generateMock(info.element));

    case "primitive":
      if (info.type === "string") return "test-string";
      if (info.type === "number") return 42;
      // ... etc
  }
}

// Usage
const mockUser = generateMock(User$);
// { id: "test-string", email: "test-string", age: 42, role: "test-string" }
```

**2. TypeScript Type Generation**

This means you can generate TypeScript definitions from runtime schemas:

```typescript
function generateType(name: string, schema: Type): string {
  const info = schema.inspect();

  if (info.kind === "object") {
    const props = info.properties.map(p => {
      const optional = p.optional ? "?" : "";
      const propType = generateType("", p.type);
      return `  ${p.name}${optional}: ${propType};`;
    }).join("\n");
    return `export type ${name} = {\n${props}\n};`;
  }

  if (info.kind === "dunion") {
    const variants = info.variants.map(v =>
      `  | ${generateType("", v.schema)}`
    ).join("\n");
    return `export type ${name} =\n${variants};`;
  }

  // ... handle other cases
}
```

Perfect for keeping runtime and compile-time types in sync when you're generating code.

**3. Schema Documentation**

Human-readable docs from schemas:

```typescript
function documentSchema(name: string, schema: Type): string {
  let doc = `## ${name}\n\n`;
  const info = schema.inspect();

  if (info.kind === "object") {
    doc += "**Properties:**\n\n";
    for (const prop of info.properties) {
      const optional = prop.optional ? " (optional)" : " (required)";
      doc += `- \`${prop.name}\`${optional}\n`;

      const refinements = getRefinements(prop.type);
      if (refinements.length > 0) {
        const constraints = refinements.map(r =>
          r.kind === "min" ? `min: ${r.value}` :
          r.kind === "email" ? "email format" :
          r.kind
        ).join(", ");
        doc += `  - Constraints: ${constraints}\n`;
      }
    }
  }

  return doc;
}
```

## Performance Characteristics

The introspection API is completely separate from the validation hot path:

| Operation | Throughput | Notes |
|-----------|------------|-------|
| Validation (baseline) | 8-16M ops/sec | ADTs with tag caching |
| `introspect()` | <0.1% overhead | One-time parse of bytecode |
| `schema.properties` | <0.01% overhead | Just array access after first call |
| `getKind()` | <0.01% overhead | Reads first opcode, that's it |

Bundle size: +5-10KB when imported. Tree-shakeable - if you don't import introspection functions, they don't ship.

This works because introspection is opt-in. Validation never touches it. You only pay for what you use.

## The Visitor Pattern

For deep tree traversal, LFTS provides a visitor API:

```typescript
// Count total properties across nested objects
let propertyCount = 0;

traverse(schema, {
  object: (properties, strict) => {
    propertyCount += properties.length;
    properties.forEach(prop => traverse(prop.type, visitor));
    return null;
  },
  array: (element) => {
    traverse(element, visitor);
    return null;
  },
  // ... other visitors
});
```

Useful for schema transformations, migrations, or deep analysis. Same pattern you'd use for AST traversal, but cleaner because schemas are just data.

## Real Talk: Tradeoffs

**Where it shines:**
- Code generation tools - OpenAPI, GraphQL, form configs
- Runtime schema analysis - documentation, debugging
- Mock data generation - tests, fixtures, seeding
- Schema migrations - version compatibility checks

**Where it doesn't:**
- If you just need validation, it's overkill - use the raw bytecode API
- Bundle size matters more than developer ergonomics - raw arrays are smaller
- You're working with megabyte-sized schemas - lazy evaluation helps but won't save you

The Type Object wrapper adds ~10% overhead vs raw bytecode for validation (unwrapping cost). For most applications this is negligible, but if you're validating millions of objects per second in a tight loop, use the raw bytecode API directly.

## What's Next

I'm working on schema composition helpers - `makePartial()`, `pick()`, `omit()`, `extend()`. These already work for objects:

```typescript
// Make all properties optional
const PartialUser$ = User$.makePartial();

// Pick specific properties
const PublicUser$ = User$.pick(["id", "role"]);

// Extend with new properties
const UserWithTimestamps$ = User$.extend({
  createdAt: t.number(),
  updatedAt: t.number()
});
```

Also exploring schema diffing - detect breaking changes between schema versions automatically. The introspection API makes this surprisingly straightforward.

---

The full introspection API is in [INTROSPECTION_API.md](INTROSPECTION_API.md). Builder API docs in [TYPE_OBJECTS.md](TYPE_OBJECTS.md). Project lives at github.com/srdjan/lfts - MIT licensed, zero dependencies.

If you're building code generators, form builders, or anything that needs to reason about types at runtime, give it a look. Works beautifully with Deno and Node.

_Currently hacking on distributed execution primitives while listening to late-period Miles Davis. Perfect coding music - complex, but always in control._
