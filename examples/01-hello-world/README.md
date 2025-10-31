# 01: Hello World

Your first LFTS program! This example demonstrates the absolute basics of LFTS: defining a type, creating a schema, and validating data at runtime.

## What You'll Learn

- How the LFTS compilation workflow works
- The schema-root rewriter pattern (`export type FooSchema = Foo`)
- Basic validation with `validate()`
- How to read validation error messages
- The relationship between types and runtime bytecode

## Prerequisites

None! This is the starting point for learning LFTS.

## Quick Start

```bash
cd examples/01-hello-world

# Compile TypeScript to JavaScript with bytecode
deno task build

# Run the compiled program
deno task start
```

## What This Example Does

1. Defines a `User` type in TypeScript
2. Creates a schema using the schema-root pattern
3. Loads sample JSON data
4. Validates the data against the schema
5. Prints the validated result

## Code Walkthrough

### 1. Define Your Types (`src/types.ts`)

```typescript
// A simple User type
export type UserId = string & { readonly __brand: "UserId" };

export type User = Readonly<{
  id: UserId;
  name: string;
  email: string;
  age?: number;  // Optional field
}>;
```

**Key points:**
- `UserId` is a **brand type** - it's a string at runtime but distinct at compile time
- `User` is **readonly** - functional programming style, no mutations
- `age?` is **optional** - the field may or may not exist

### 2. Create the Schema (`src/types.schema.ts`)

```typescript
import type { User } from "./types.ts";

// Schema-root pattern: compiler generates User$ bytecode constant
export type UserSchema = User;
```

**What happens at compile time:**
The LFTS compiler transforms this into:
```javascript
export const User$ = [/* bytecode array */];
```

This bytecode is used by the runtime validator.

### 3. Use the Schema (`src/main.ts`)

```typescript
import { validate } from "../../../packages/lfts-type-runtime/mod.ts";
import type { User } from "./types.ts";
import "./types.schema.ts";

// The compiler generates this constant from UserSchema
declare const User$: any[];

// Load and validate JSON
const json = await Deno.readTextFile("sample.json");
const data = JSON.parse(json);

// Validate returns the typed value or throws
const user: User = validate(User$, data);
console.log("✓ Valid user:", user);
```

### 4. Sample Data (`sample.json`)

```json
{
  "id": "user_001",
  "name": "Ada Lovelace",
  "email": "ada@example.com",
  "age": 36
}
```

## Try It Yourself

### 1. Valid Data
Run the example as-is:
```bash
deno task start
```

You should see:
```
✓ Valid user: { id: "user_001", name: "Ada Lovelace", ... }
```

### 2. Invalid Data
Edit `sample.json` to break validation:

**Missing required field:**
```json
{
  "id": "user_001",
  "name": "Ada Lovelace"
  // missing email!
}
```

**Wrong type:**
```json
{
  "id": "user_001",
  "name": "Ada Lovelace",
  "email": 12345  // should be string!
}
```

Run again:
```bash
deno task build && deno task start
```

See the error messages LFTS provides!

### 3. Add a Field
Try adding a new required field:

1. Add `role: string` to the `User` type in `src/types.ts`
2. Rebuild: `deno task build`
3. Run: `deno task start` - it will fail!
4. Add `"role": "admin"` to `sample.json`
5. Run again - it works!

## Understanding the Compilation Process

When you run `deno task build`, LFTS:

1. **Gate Pass**: Checks that you're not using forbidden syntax (classes, decorators, etc.)
2. **Policy Pass**: Enforces Light-FP rules (canonical syntax, ports discipline, etc.)
3. **Transform Pass**:
   - Finds `export type UserSchema = User`
   - Generates `export const User$ = [bytecode]`
   - The bytecode encodes the type structure

When you run `deno task start`:
- The `validate()` function walks the bytecode
- It checks the data against each rule
- It returns typed data or throws with a detailed error path

## Key Concepts

### Schema-Root Pattern
Instead of writing `typeOf<User>()` everywhere, you write:
```typescript
export type UserSchema = User;
```

The compiler automatically generates the schema constant. This is the **preferred pattern** in LFTS.

### Bytecode
LFTS compiles your types to a compact bytecode format:
```javascript
// Example bytecode (simplified)
[
  Op.OBJECT,    // This is an object
  3,            // with 3 properties
  Op.PROPERTY, "id", false, [Op.STRING],  // id: string
  Op.PROPERTY, "name", false, [Op.STRING], // name: string
  Op.PROPERTY, "email", false, [Op.STRING] // email: string
]
```

This bytecode:
- Is **compact** (no type information shipped to runtime)
- Is **fast** to validate
- Provides **precise error messages**

### Validation vs Type Checking
- **TypeScript** checks types at compile time
- **LFTS** validates data at runtime
- Together: compile-time safety + runtime safety

## Common Questions

**Q: Why do I need both types.ts and types.schema.ts?**
A: Separation of concerns:
- `types.ts` = TypeScript types (compile-time)
- `types.schema.ts` = Runtime schemas (generate bytecode)

**Q: What if I don't want to validate something?**
A: Don't create a schema for it! Only types with schemas are validated.

**Q: Can I validate external data (APIs, files, etc.)?**
A: Yes! That's the main use case. Validate all data at your program's boundaries.

## Next Steps

Now that you understand the basics:

1. **Next Example**: [02-basic-validation](../02-basic-validation/) - Learn more validation patterns
2. **Read**: [docs/TUTORIAL.md](../../docs/TUTORIAL.md) - Comprehensive guide
3. **Reference**: [LANG-SPEC.md](../../LANG-SPEC.md) - Complete syntax rules

## Files in This Example

```
01-hello-world/
├── README.md              # This file
├── deno.json              # Task definitions
├── lfts.config.json       # Compiler configuration
├── src/
│   ├── types.ts           # User type definition
│   ├── types.schema.ts    # Schema definition
│   └── main.ts            # Main program
└── sample.json            # Sample data
```

---

**Happy coding!** 🎉 You've taken your first step into Light Functional TypeScript.
