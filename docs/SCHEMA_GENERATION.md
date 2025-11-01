# Schema Generation Architecture

**Purpose**: This document explains LFTS's schema generation strategy, why explicit compile-time transformation was chosen over runtime reflection, and how this aligns with Light-FP principles.

**Target Audience**: LFTS contributors, advanced users, and anyone comparing LFTS with alternatives like Deepkit, Zod, or TypeBox.

---

## Table of Contents

1. [Overview](#overview)
2. [Design Philosophy](#design-philosophy)
3. [How LFTS Schema Generation Works](#how-lfts-schema-generation-works)
4. [Alternative: Runtime Reflection (Deepkit-style)](#alternative-runtime-reflection-deepkit-style)
5. [Technical Comparison](#technical-comparison)
6. [Why Explicit Compile-Time Wins for Light-FP](#why-explicit-compile-time-wins-for-light-fp)
7. [Bundle Size Analysis](#bundle-size-analysis)
8. [Usage Patterns](#usage-patterns)
9. [Future Enhancements](#future-enhancements)
10. [FAQ](#faq)

---

## Overview

LFTS uses **explicit, compile-time schema generation** rather than automatic runtime reflection. This means:

- ✅ **You explicitly mark** which types need runtime validation
- ✅ **Compiler generates** bytecode schemas at build time
- ✅ **Only validated types** ship to production
- ✅ **No hidden magic** or compiler patching

This contrasts with tools like Deepkit that use **pervasive runtime reflection** where all types automatically get runtime information.

---

## Design Philosophy

### Core Principle: Explicit Over Magic

Light-FP values **explicitness, minimalism, and predictability**. The schema generation strategy must align with these values:

1. **Explicit Opt-In**: Developers explicitly choose what needs runtime validation
2. **Clear Boundaries**: Type = compile-time, Schema = runtime artifact
3. **No Hidden Costs**: Production bundle only includes schemas you use
4. **Subset Enforcement**: Can reject disallowed constructs before transformation
5. **Direct-Style**: No decorators, no magic, no compiler patching

### Why Not Automatic Reflection?

Automatic reflection (generating schemas for ALL types) conflicts with Light-FP:

- ❌ **Hidden Magic**: `reflection: true` does too much automatically
- ❌ **Bundle Bloat**: Ships reflection for types you never validate
- ❌ **Can't Enforce Subset**: Must reflect ALL TypeScript features (OOP, decorators, etc.)
- ❌ **Breaks Ports Discipline**: Can't prevent ports in data schemas
- ❌ **Requires Decorators**: Incompatible with Light-FP's no-decorator rule

---

## How LFTS Schema Generation Works

### Three-Pass Compiler Architecture

LFTS uses a three-pass compilation pipeline:

```typescript
// 1. Gate Pass - Syntax Restrictions
// Rejects: OOP, decorators, mapped types, conditional types
const gateDiags = runGate(program, srcDir);

// 2. Policy Pass - Semantic Rules
// Enforces: Ports discipline, canonical forms, data purity
const policyDiags = runPolicy(program, checker, srcDir);

// 3. Transform Pass - Bytecode Generation
// Rewrites: typeOf<T>() → bytecode, *Schema → Name$ constant
const transformers = {
  before: [
    schemaRootRewriter(program, checker),  // Must run first
    typeOfRewriter(program, checker),
  ],
};
```

**Key insight:** Gate and Policy passes run **before** transformation. This ensures Light-FP subset compliance before any schema generation.

### Two Usage Patterns

#### Pattern 1: Schema-Root (Recommended, v0.2.0+)

**Most concise and idiomatic:**

```typescript
// types.ts
export type User = {
  id: string;
  name: string;
  email: string;
};

// types.schema.ts
import type { User } from "./types.ts";

// Compiler generates User$ constant automatically
export type UserSchema = User;
```

**Compiled output:**
```javascript
// types.schema.js
export const User$ = [14, 3, 0, 4, "id", 0, [0], 4, "name", 0, [0], 4, "email", 0, [0]];
```

**Benefits:**
- ✅ Minimal ceremony (no `typeOf` import)
- ✅ Type stays visible for IDE
- ✅ Zero runtime overhead
- ✅ Clear naming convention

#### Pattern 2: Explicit `typeOf<T>()` (Pre-v0.2.0)

**More explicit control:**

```typescript
// types.schema.ts
import { typeOf } from "lfts-type-runtime";
import type { User } from "./types.ts";

export const User$ = typeOf<User>();
```

**Compiled output:**
```javascript
// types.schema.js (same bytecode)
export const User$ = [14, 3, 0, 4, "id", 0, [0], 4, "name", 0, [0], 4, "email", 0, [0]];
```

**Benefits:**
- ✅ Explicit transformation visible in source
- ✅ Works for complex scenarios
- ✅ More obvious what's happening

**When to use each:**
- **Schema-Root**: Default choice, less ceremony
- **typeOf<T>()**: When you want explicit control or dynamic schema composition

### Type Encoding Process

The **type-encoder** (packages/lfts-type-compiler/src/transform/type-encoder.ts) walks the TypeScript AST and encodes types to bytecode:

```typescript
// Input: TypeScript AST node
ts.TypeNode
  ↓
// Pattern matching
if (ts.isStringKeyword(node)) → [Op.STRING]
if (ts.isArrayTypeNode(node)) → [Op.ARRAY, encodeElement(node.elementType)]
if (ts.isTypeLiteralNode(node)) → [Op.OBJECT, ...properties]
  ↓
// Output: Bytecode array
[Op.OBJECT, 2, 0, Op.PROPERTY, "id", 0, [Op.STRING], ...]
```

**Smart features:**
- **Discriminated Union Detection**: Automatically converts to `Op.DUNION` (40x-1,600x faster)
- **Brand Type Recognition**: `T & { readonly __brand: "Tag" }` → `[Op.BRAND, "Tag", innerType]`
- **Annotation Support**: Recognizes `Email`, `Url`, `Min<N>`, `Max<N>` prebuilt types
- **Recursive Resolution**: Follows type aliases and interfaces

### Bytecode Format

LFTS uses a **simple, array-based bytecode format** (see packages/lfts-type-spec/src/mod.ts):

```typescript
// Primitives
[Op.STRING]                    // string
[Op.NUMBER]                    // number
[Op.BOOLEAN]                   // boolean

// Literals
[Op.LITERAL, "admin"]          // "admin"
[Op.LITERAL, 42]               // 42

// Arrays
[Op.ARRAY, [Op.STRING]]        // string[]

// Objects
[Op.OBJECT, propCount, strict,
  Op.PROPERTY, "name", optional, type,
  Op.PROPERTY, "age", optional, type,
  ...]

// Discriminated Unions (optimized)
[Op.DUNION, "type", variantCount,
  "success", [successSchema],
  "error", [errorSchema],
  ...]

// Refinements
[Op.REFINE_EMAIL, [Op.STRING]]       // Email validation
[Op.REFINE_MIN, value, [Op.NUMBER]]  // min constraint
```

**Design goals:**
- **Compact**: Nested arrays, not verbose JSON
- **Fast to validate**: Direct opcode interpretation
- **Cacheable**: WeakMap caching for performance
- **Tree-shakeable**: Dead code elimination removes unused schemas

### Runtime Validation

The runtime validator (packages/lfts-type-runtime/mod.ts) interprets bytecode:

```typescript
function validateWith(schema: TypeObject, value: unknown, path: Path): VResult {
  const op = schema[0];

  switch (op) {
    case Op.STRING:
      return typeof value === "string" ? ok() : err("expected string");

    case Op.OBJECT:
      const [_, propCount, strict, ...props] = schema;
      // Validate each property...

    case Op.DUNION:
      const [_, tagKey, count, ...variants] = schema;
      const tag = value[tagKey];
      // O(1) lookup via WeakMap cache
      return validateVariant(cachedSchema, value);

    // ... handle all opcodes
  }
}
```

**Optimizations:**
- **DUNION Caching**: WeakMap for O(1) tag lookup (40x-1,600x speedup)
- **Lazy Paths**: Only build error paths on failure (5-15% speedup)
- **Result-Based**: No try/catch overhead (2-5x speedup)

---

## Alternative: Runtime Reflection (Deepkit-style)

### How Deepkit Works

Deepkit uses **automatic, pervasive runtime reflection**:

#### 1. Configuration

```json
{
  "compilerOptions": {
    "experimentalDecorators": true
  },
  "reflection": true  // Magic flag
}
```

#### 2. Compiler Plugin

Deepkit **patches `node_modules/typescript`** via npm install hooks:

```javascript
// postinstall script
const fs = require('fs');
const tscPath = 'node_modules/typescript/lib/tsc.js';
const original = fs.readFileSync(tscPath, 'utf8');
const patched = original.replace(/.../, '...reflection code...');
fs.writeFileSync(tscPath, patched);
```

#### 3. Automatic Bytecode Generation

**Every type automatically gets runtime information:**

```typescript
// Source
type User = { id: string; name: string };
function createUser(input: User): User { ... }

// Compiled output (automatic)
function createUser(input) { ... }
createUser.__type = ['P&2!$/"'];  // Compact bytecode string

// At runtime
import { typeOf } from '@deepkit/type';
const userType = typeOf<User>();  // Works for ANY type
```

#### 4. Pervasive Reflection

**ALL types get reflected:**
- Function parameters
- Return types
- Class properties
- Type aliases
- Interfaces
- Everything

### Example: Validation-Heavy API

```typescript
// Deepkit - Zero ceremony
import { typeOf, validate } from '@deepkit/type';

type CreateUserInput = { email: string; name: string };
type User = CreateUserInput & { id: string };

app.post('/users', (req) => {
  // Works immediately - no schema files
  const input = validate(typeOf<CreateUserInput>(), req.body);
  const user = createUser(input);
  return user;
});

// ANY type works - automatic reflection
type InternalHelper = { ... };
const helperType = typeOf<InternalHelper>();  // Also works!
```

**Pros:**
- ✅ Zero ceremony - no schema files
- ✅ Works for ANY type immediately
- ✅ Great DX for validation-heavy apps

**Cons:**
- ❌ Ships reflection for ALL types (even InternalHelper)
- ❌ Can't tree-shake unused type info
- ❌ Requires decorators
- ❌ Patches TypeScript (fragile)
- ❌ Can't enforce subset (must support all TS features)

---

## Technical Comparison

### Performance

| Metric | LFTS (Compile-time) | Deepkit (Runtime Reflection) |
|--------|---------------------|----------------------------|
| **Validation speed** | 8-16M ops/sec (DUNION) | 8-16M ops/sec (same VM) |
| **Startup time** | Fast (pre-compiled) | Slower (decode all types) |
| **Bundle size** | Small (tree-shakeable) | Large (all types included) |
| **Memory footprint** | Low (separate constants) | High (`__type` everywhere) |
| **Tree-shaking** | ✅ Full support | ❌ Impossible |

**Note**: Validation speed is similar because both use bytecode VMs. The difference is **what ships to production**.

### Developer Experience

| Aspect | LFTS | Deepkit |
|--------|------|---------|
| **Ceremony** | ⚠️ Schema files needed | ✅ Zero - works immediately |
| **Explicitness** | ✅ Clear what's validated | ❌ Hidden reflection |
| **Type safety** | ✅ Perfect | ✅ Perfect |
| **IDE support** | ✅ Standard TypeScript | ✅ Standard TypeScript |
| **Debugging** | ✅ Explicit schemas | ❌ Hidden `__type` props |
| **Discovery** | ⚠️ Must know schema exists | ✅ Any type works |

### Build Complexity

| Aspect | LFTS | Deepkit |
|--------|------|---------|
| **Tooling** | Standard transformer | Patches TypeScript |
| **Stability** | ✅ Stable | ⚠️ Fragile (TS versions) |
| **Build tools** | ✅ Works everywhere | ⚠️ May break with some tools |
| **Setup** | Transformer config | npm install hooks |

### Type System Support

| Feature | LFTS | Deepkit |
|---------|------|---------|
| **Primitives** | ✅ | ✅ |
| **Objects** | ✅ | ✅ |
| **Unions** | ✅ | ✅ |
| **Discriminated Unions** | ✅ (optimized) | ✅ |
| **Generics** | ⚠️ Limited | ✅ Full |
| **Mapped Types** | ❌ Rejected | ✅ Supported |
| **Conditional Types** | ❌ Rejected | ✅ Supported |
| **OOP (classes)** | ❌ Rejected | ✅ Supported |
| **Decorators** | ❌ Rejected | ✅ Required |

**Why limitations?** LFTS enforces a **Light-FP subset**. Mapped types, conditional types, OOP, and decorators are intentionally rejected by the Gate pass.

---

## Why Explicit Compile-Time Wins for Light-FP

### 1. Subset Enforcement is Impossible with Pervasive Reflection

**LFTS approach:**
```typescript
// Gate pass runs FIRST, before transformation
class User { ... }  // ❌ REJECTED: LFG1001 - Classes not allowed

// Only after validation passes:
type User = { id: string };  // ✅ Accepted
export type UserSchema = User;  // ✅ Generate schema
```

**Deepkit approach:**
```typescript
// Must reflect ALL TypeScript features
class User {
  @IsEmail()  // Requires decorators
  email!: string;
}
// ✅ Works - but can't enforce Light-FP subset
```

**Conclusion**: Pervasive reflection **requires** supporting all TypeScript features. You can't reject OOP/decorators if your reflection mechanism needs them.

### 2. Ports Discipline Requires Explicit Schemas

**LFTS approach:**
```typescript
// Policy pass enforces LFP1002: Ports not in data schemas

interface StoragePort {  // Port interface
  load(): Promise<Data>;
}

type User = {
  storage: StoragePort  // ❌ REJECTED: LFP1002
};
```

**Deepkit approach:**
```typescript
// Automatic reflection - can't prevent this
interface StoragePort {
  load(): Promise<Data>;
}

type User = {
  storage: StoragePort  // ✅ Reflected automatically
};
```

**Conclusion**: Port discipline (keeping effects separate from data) requires **explicit control** over what gets reflected. Automatic reflection breaks this boundary.

### 3. Bundle Size Matters for Production

**Example: E-commerce API with 50 domain types, validates 10**

**LFTS:**
```
Domain types (*.ts): 50 types, 0KB runtime overhead
Schemas (*.schema.ts): 10 explicit schemas
Compiled bundle: ~6KB (only validated types)
After tree-shaking: ~6KB (unused schemas removed)
```

**Deepkit:**
```
Domain types: 50 types, all reflected automatically
Compiled bundle: ~30KB (all 50 types included)
After tree-shaking: ~30KB (can't remove, all referenced by __type)
```

**Savings: 80% bundle size reduction**

For larger apps (200 types, validate 30):
- LFTS: ~20KB
- Deepkit: ~120KB
- **Savings: 83% reduction**

### 4. Explicitness Matches Light-FP Values

**Light-FP principle: "What you see is what you get"**

**LFTS:**
```typescript
// What you see:
type User = { id: string };
export type UserSchema = User;

// What you get (clear):
export const User$ = [14, 1, 0, ...];  // In compiled .js
```

**Deepkit:**
```typescript
// What you see:
type User = { id: string };

// What you get (hidden):
User.__type = ['P&2!$/"'];  // Where? How? When?
// + Compiler patching
// + Automatic decorator injection
// + Magic everywhere
```

**Conclusion**: Explicit schemas make the transformation **visible and predictable**, aligning with Light-FP's "no magic" philosophy.

### 5. No Decorator Requirement

**LFTS:**
```typescript
// Pure data types - no decorators
type User = {
  id: string;
  email: string;  // Validation via refinements
};

// Validation in schema, not on type
import { enc } from "lfts-type-spec";
const UserSchema = enc.obj([
  { name: "email", type: enc.refine.email(enc.str()), optional: false }
]);
```

**Deepkit:**
```typescript
// Often requires decorators for constraints
class User {
  id!: string;

  @IsEmail()  // Decorator for validation
  email!: string;
}
```

**Conclusion**: Light-FP rejects decorators as hidden magic. LFTS keeps validation separate from types.

---

## Bundle Size Analysis

### Real-World Scenario: REST API

**Setup:**
- **Domain model**: 100 TypeScript types (User, Order, Product, Payment, etc.)
- **API endpoints**: 20 endpoints
- **Validated types**: 25 types (input DTOs, output DTOs)

### LFTS (Explicit Compile-time)

```typescript
// 100 domain types in types.ts (0KB runtime overhead)
export type User = { ... };
export type Order = { ... };
// ... 98 more types

// 25 explicit schemas in types.schema.ts
export type UserSchema = User;
export type OrderSchema = Order;
// ... 23 more schemas

// Compiled bundle
User$: [14, 5, 0, ...] // ~250 bytes
Order$: [14, 8, 0, ...] // ~400 bytes
// ... 23 more schemas

// Total: ~12KB for 25 validated schemas
// Unused schemas tree-shaken away
```

**Production bundle:**
- Schemas: 12KB
- Validator runtime: 8KB
- **Total: 20KB**

### Deepkit (Pervasive Reflection)

```typescript
// 100 domain types - ALL reflected automatically
type User = { ... };  // → __type: ['...']
type Order = { ... }; // → __type: ['...']
// ... 98 more types, ALL with __type

// Compiled bundle
User.__type = ['P&5!$/"'];  // ~200 bytes
Order.__type = ['P&8!$/"']; // ~350 bytes
// ... 98 more, ALL included

// Total: ~50KB for 100 reflected types
// Can't tree-shake (all referenced by __type props)
```

**Production bundle:**
- Reflection: 50KB
- Reflection runtime: 15KB
- **Total: 65KB**

### Comparison

| Metric | LFTS | Deepkit | Difference |
|--------|------|---------|------------|
| **Schema/Reflection** | 12KB (25 types) | 50KB (100 types) | **-76%** |
| **Runtime** | 8KB | 15KB | **-47%** |
| **Total** | **20KB** | **65KB** | **-69%** |
| **Tree-shaking** | ✅ Full | ❌ None | - |

**For mobile/edge deployments**, this difference compounds:
- Slower network → longer load times
- Gzip doesn't help much (bytecode is already compact)
- Every KB counts for initial load

---

## Usage Patterns

### Pattern 1: Schema-Root (Recommended)

**Best for: Most use cases, minimal ceremony**

```typescript
// Step 1: Define your domain types
// src/domain/user.ts
export type User = {
  id: string;
  name: string;
  email: string;
};

// Step 2: Create schema file with schema-root pattern
// src/domain/user.schema.ts
import type { User } from "./user.ts";

export type UserSchema = User;
// Compiler generates: export const User$ = [bytecode];

// Step 3: Use in validation
// src/api/users.ts
import { User$ } from "../domain/user.schema.ts";
import { validate } from "lfts-type-runtime";

app.post("/users", (req) => {
  const user = validate(User$, req.body);
  // user is type-safe and validated
  return createUser(user);
});
```

**Benefits:**
- ✅ Minimal ceremony
- ✅ Type stays visible in schema file
- ✅ Clear naming convention (`*Schema` → `*$`)
- ✅ IDE support for both type and constant

### Pattern 2: Explicit `typeOf<T>()`

**Best for: Complex scenarios, dynamic schemas**

```typescript
// When you need explicit control
import { typeOf } from "lfts-type-runtime";
import type { User, Admin } from "./types.ts";

// Explicit transformation visible in source
export const User$ = typeOf<User>();
export const Admin$ = typeOf<Admin>();

// Can compose dynamically (advanced)
import { enc } from "lfts-type-spec";
export const UserOrAdmin$ = enc.union(User$, Admin$);
```

**Benefits:**
- ✅ Explicit transformation visible
- ✅ Works for complex compositions
- ✅ More obvious what's happening

### Pattern 3: Mixed (Both)

**Best for: Large projects with different needs**

```typescript
// Simple schemas: Use schema-root
// types.schema.ts
export type UserSchema = User;
export type OrderSchema = Order;

// Complex schemas: Use explicit typeOf
import { typeOf } from "lfts-type-runtime";
import { enc } from "lfts-type-spec";

// Explicit for complex composition
export const ApiResponse$ = enc.dunion("type", [
  { tag: "success", schema: typeOf<SuccessData>() },
  { tag: "error", schema: typeOf<ErrorData>() },
]);
```

**Benefits:**
- ✅ Flexibility
- ✅ Choose based on complexity
- ✅ Both patterns supported

### Anti-Pattern: Schema per File

**Don't do this** (too verbose):

```typescript
// ❌ Bad: Separate file for each schema
// user.schema.ts
export type UserSchema = User;

// order.schema.ts
export type OrderSchema = Order;

// product.schema.ts
export type ProductSchema = Product;
```

**Do this instead** (group related schemas):

```typescript
// ✅ Good: Group related schemas
// domain/index.schema.ts
export type UserSchema = User;
export type OrderSchema = Order;
export type ProductSchema = Product;
```

---

## Future Enhancements

### Option 1: Convention-Based Auto-Generation (Hybrid)

**Not currently implemented, but under consideration**

**Idea:** Opt-in convention for directories

```json
// lfts.config.json
{
  "autoSchema": {
    "enabled": true,
    "include": ["src/domain/**/*.ts"],
    "exclude": ["**/*.test.ts"],
    "exportedOnly": true
  }
}
```

**Behavior:**
```typescript
// src/domain/user.ts (matched by config)
export type User = { id: string };
export type Admin = User & { role: "admin" };

// Compiler auto-generates: src/domain/user.schema.ts
export const User$ = [14, 1, 0, ...];
export const Admin$ = [14, 2, 0, ...];

// Usage (explicit import)
import { User$ } from "./domain/user.schema.ts";
```

**Benefits:**
- Less ceremony than pure explicit
- More control than pervasive reflection
- Still enforces Light-FP subset (Gate/Policy run first)
- Tree-shakeable at file level
- Clear convention (config documents behavior)

**Why not implemented yet:**
- Current explicit approach works well
- Want to validate demand first
- Adds complexity to compiler
- Need to ensure ports discipline maintained

**When to consider:**
- Multiple users request it
- Large codebases find ceremony burdensome
- Can maintain all Light-FP guarantees

### Option 2: Schema Discovery Tooling

**CLI for finding schemas:**

```bash
$ lfts list-schemas
src/domain/user.schema.ts: User$, Admin$
src/domain/order.schema.ts: Order$, OrderItem$
src/api/dto.schema.ts: CreateUserInput$, UpdateUserInput$

$ lfts find-schema User
Found: User$ in src/domain/user.schema.ts
```

**Benefits:**
- Easier discovery
- Documentation aid
- IDE integration potential

### Option 3: Generated Index Files

**Auto-generate barrel exports:**

```typescript
// src/domain/index.schema.ts (auto-generated)
export { User$, Admin$ } from "./user.schema.ts";
export { Order$, OrderItem$ } from "./order.schema.ts";

// Enables:
import { User$, Order$ } from "./domain/index.schema.ts";
```

**Benefits:**
- Single import point
- Easier to discover available schemas
- Standard JavaScript pattern

---

## FAQ

### Q: Why not just use Deepkit if it's more convenient?

**A:** Deepkit's pervasive reflection is **incompatible with Light-FP principles**:

1. **Can't enforce subset**: Must reflect ALL TypeScript (OOP, decorators, etc.)
2. **Breaks ports discipline**: Can't prevent ports in data schemas
3. **Bundle bloat**: Ships reflection for types you never validate (60-80% larger)
4. **Hidden magic**: `reflection: true` patches compiler, not explicit
5. **Requires decorators**: Conflicts with Light-FP's no-decorator rule

LFTS trades **some ceremony** for **guarantees** (subset enforcement, minimal bundles, explicit behavior).

### Q: Can I use LFTS schemas without the compiler?

**A:** Yes! You can manually write bytecode using the encoder API:

```typescript
import { enc } from "lfts-type-spec";

// Instead of typeOf<User>(), manually encode:
export const User$ = enc.obj([
  { name: "id", type: enc.str(), optional: false },
  { name: "name", type: enc.str(), optional: false },
]);
```

This works for simple schemas but becomes verbose for complex types. The compiler is recommended for real projects.

### Q: Does LFTS support generics?

**A:** Limited support:

**Works:**
```typescript
// Generic type with concrete usage
type Result<T> = { ok: true; value: T } | { ok: false; error: string };
export type UserResultSchema = Result<User>;  // ✅ Works
```

**Doesn't work:**
```typescript
// Generic schema (can't encode abstract T)
export type ResultSchema<T> = Result<T>;  // ❌ Can't encode
```

**Workaround:** Generate schemas for concrete instantiations:
```typescript
export type UserResultSchema = Result<User>;
export type OrderResultSchema = Result<Order>;
```

### Q: Can I validate function parameters automatically?

**A:** No, you must create schemas explicitly:

```typescript
// Type for compile-time safety
type CreateUserInput = { email: string; name: string };

// Schema for runtime validation
export type CreateUserInputSchema = CreateUserInput;

// Validate explicitly
function createUser(input: unknown): User {
  const validated = validate(CreateUserInput$, input);
  // Now type-safe
  return { id: uuid(), ...validated };
}
```

This is intentional - explicit validation points align with Light-FP values.

### Q: What about tree-shaking?

**A:** LFTS schemas are fully tree-shakeable:

```typescript
// If you define 100 schemas but only import 10
import { User$, Order$ } from "./schemas.ts";

// Only User$ and Order$ ship to production
// 90 unused schemas are removed by dead code elimination
```

Deepkit's pervasive reflection is **not tree-shakeable** because all types are referenced by `__type` properties.

### Q: Can I mix LFTS with Zod/Yup/Joi?

**A:** Yes, but you lose benefits:

```typescript
// Possible but defeats the purpose
import { z } from "zod";
import { User$ } from "./user.schema.ts";

// Using both adds overhead
const zodSchema = z.object({ ... });
const lftsSchema = User$;

// Pick one for consistency
```

LFTS is designed as a complete solution. Mixing validation libraries adds bundle size and complexity.

### Q: How do I debug compilation issues?

**A:** Compiler provides detailed diagnostics:

```typescript
// Source with error
type User = { storage: StoragePort };  // Port in data
export type UserSchema = User;

// Compiler output
Error: LFP1002 - Port interface 'StoragePort' cannot be used in data schemas
  at user.ts:1:15
  Port interfaces must only be used for dependency injection
```

Use `--diagnostics` flag for more details:
```bash
deno task build --diagnostics
```

### Q: What's the performance difference between patterns?

**A:** Both patterns compile to identical bytecode:

```typescript
// Pattern 1: Schema-root
export type UserSchema = User;

// Pattern 2: Explicit typeOf
export const User$ = typeOf<User>();

// Both produce identical bytecode:
[14, 2, 0, 4, "id", 0, [0], 4, "name", 0, [0]]

// Runtime performance: Identical
```

Choose based on preference, not performance.

---

## Conclusion

LFTS's **explicit, compile-time schema generation** is a deliberate design choice that aligns with Light-FP principles:

1. ✅ **Explicitness Over Magic**: Clear what's validated, no hidden reflection
2. ✅ **Subset Enforcement**: Can reject disallowed constructs before transformation
3. ✅ **Minimal Bundles**: Only validated types ship to production (60-80% smaller)
4. ✅ **Ports Discipline**: Can enforce separation of effects and data
5. ✅ **No Decorators**: Pure functional approach, no magic annotations

While this requires **more ceremony** than automatic reflection (Deepkit-style), it provides **essential guarantees** for Light-FP's goals.

**Recommended pattern**: Use **schema-root** (`export type NameSchema = T`) for most schemas, and explicit `typeOf<T>()` when you need fine-grained control.

Future enhancements (convention-based auto-generation, discovery tooling) may reduce ceremony while maintaining Light-FP guarantees.

---

**Further Reading:**
- [LANG-SPEC.md](./LANG-SPEC.md) - Light-FP language specification
- [BYTECODE_REFERENCE.md](./BYTECODE_REFERENCE.md) - Bytecode format and opcodes
- [FEATURES.md](./FEATURES.md) - Currently implemented features
- [Phase 2 Summary](./PHASE2_SUMMARY.md) - Code generation libraries built on introspection
