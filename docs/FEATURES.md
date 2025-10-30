# LFTS Implemented Features

This document describes all features that have been implemented in the LFTS runtime and compiler. For future planned features, see [FUTURE_DIRECTION.md](FUTURE_DIRECTION.md).

---

## Core Runtime Features (v0.4.0)

### 1. Result/Option Combinators (v0.3.0)

**Status:** ✅ Fully implemented

Functional error handling without exceptions, using Result and Option types with full combinator APIs.

**Result API:**
- `Result.ok(value)` - Create successful Result
- `Result.err(error)` - Create failed Result
- `Result.map(result, fn)` - Transform success value
- `Result.andThen(result, fn)` - Chain Result-returning functions
- `Result.mapErr(result, fn)` - Transform error value
- `Result.ensure(predicate, error)` - Validate with predicate
- `Result.unwrapOr(result, defaultValue)` - Get value or default
- `Result.isOk()`, `Result.isErr()` - Type guards

**Option API:**
- `Option.some(value)` - Create Option with value
- `Option.none()` - Create empty Option
- `Option.from(nullable)` - Convert nullable to Option
- `Option.first(array)` - Safely get first element
- `Option.map(option, fn)` - Transform Some value
- `Option.andThen(option, fn)` - Chain Option-returning functions
- `Option.okOr(option, error)` - Convert to Result
- `Option.unwrapOr(option, defaultValue)` - Get value or default
- `Option.isSome()`, `Option.isNone()` - Type guards
- `Option.zip(...options)` - Combine multiple Options

**Example:**
```ts
import { Result, Option } from "lfts-runtime";

// Result combinators
const result = Result.andThen(
  parseUser(data),
  user => validateEmail(user)
);

// Option combinators
const firstItem = Option.map(
  Option.first(items),
  item => item.name
);
```

**Testing:** 40 comprehensive tests in `packages/lfts-type-runtime/combinators.test.ts`

---

### 2. Runtime Introspection Hooks (v0.4.0)

**Status:** ✅ Fully implemented

Observability hooks for validation events without mutating data, providing schema metadata and success/failure callbacks.

**APIs:**
- `withMetadata(schema, metadata)` - Attach schema name and source location
- `inspect(schema, configure)` - Wrap schema with observability hooks

**InspectionContext:**
- `onSuccess(callback)` - Hook triggered on successful validation
- `onFailure(callback)` - Hook triggered on validation errors
- `schemaName` - Access to schema metadata
- `schemaSource` - Access to source file location

**Example:**
```ts
import { inspect, withMetadata } from "lfts-runtime";

// Attach metadata to schema
const OrderSchema = withMetadata(orderBytecode, {
  name: "Order",
  source: "src/types/order.schema.ts",
});

// Create inspectable wrapper with hooks
const InspectedOrderSchema = inspect<Order>(OrderSchema, (ctx) => {
  ctx.onFailure((error) => {
    logger.warn('Order validation failed', {
      schema: ctx.schemaName,
      source: ctx.schemaSource,
      error,
    });
  });

  ctx.onSuccess((value) => {
    metrics.recordValidation(ctx.schemaName, "success");
  });
});

// Use the inspectable schema
const result = InspectedOrderSchema.validate(payload);
// Hooks fire automatically based on validation outcome
```

**Features:**
- Zero runtime cost when not used (opt-in wrapper pattern)
- Multiple hooks can be registered per event
- Hook errors are caught and logged to prevent breaking validation
- Works with all validation methods: `validate()`, `validateUnsafe()`, `validateAll()`
- Metadata transparently passes through validation
- Added `Op.METADATA` bytecode opcode for schema metadata

**Testing:**
- 9 comprehensive tests in `packages/lfts-type-runtime/introspection.test.ts`
- Example usage in `packages/lfts-type-runtime/introspection-example.ts`

---

### 3. Prebuilt Type Annotations (v0.4.0)

**Status:** ✅ Fully implemented

Clean nominal typing and runtime refinements using imported type annotations that compile to validation bytecode.

**Available Annotations:**

**Nominal typing (compile-time only):**
```ts
import type { Nominal } from "lfts-runtime";
type UserId = string & Nominal;
```

**String refinements:**
```ts
import type { Email, Url, Pattern, MinLength, MaxLength } from "lfts-runtime";

type UserEmail = string & Email;
type WebsiteUrl = string & Url;
type ZipCode = string & Pattern<"^\\d{5}$">;
type Username = string & MinLength<3> & MaxLength<20>;
```

**Numeric refinements:**
```ts
import type { Min, Max, Range, Integer } from "lfts-runtime";

type Age = number & Min<0> & Max<120>;
type Score = number & Range<0, 100>;
type Count = number & Integer & Min<0>;
```

**Array refinements:**
```ts
import type { MinItems, MaxItems } from "lfts-runtime";

type NonEmptyArray<T> = T[] & MinItems<1>;
type ShortList<T> = T[] & MaxItems<10>;
```

**Composable refinements:**
```ts
type SafeEmail = string & MinLength<5> & MaxLength<100> & Email;
type PositiveInteger = number & Integer & Min<1>;
```

**Features:**
- Replaces verbose `{ readonly __brand: "Tag" }` pattern
- Runtime validation for refinements (Email, Url, Min, Max, etc.)
- Compile-time branding with Nominal (zero runtime cost)
- Composable via intersection types
- Clean, discoverable syntax
- Full type safety with TypeScript inference

**Bytecode opcodes:**
- `Op.REFINE_EMAIL`, `Op.REFINE_URL`, `Op.REFINE_PATTERN`
- `Op.REFINE_MIN`, `Op.REFINE_MAX`, `Op.REFINE_INTEGER`
- `Op.REFINE_MIN_LENGTH`, `Op.REFINE_MAX_LENGTH`
- `Op.REFINE_MIN_ITEMS`, `Op.REFINE_MAX_ITEMS`

**Related:** Addresses VALIDATOR_GAPS.md "No refinements" limitation

---

### 4. Error Aggregation (v0.4.0)

**Status:** ✅ Fully implemented

Collect multiple validation errors instead of failing fast, providing better UX for form validation and debugging.

**API:**
```ts
validateAll(schema, value, maxErrors?)
```

**Example:**
```ts
import { validateAll } from "lfts-runtime";

// Collect all errors (default max: 100)
const result = validateAll(User$, data);

if (!result.ok) {
  console.log(`Found ${result.errors.length} validation errors:`);
  result.errors.forEach(err => {
    console.log(`  ${err.path}: ${err.message}`);
  });
}

// Output:
// Found 3 validation errors:
//   email: expected valid email format
//   age: expected >= 0, got -5
//   address.zip: required property missing
```

**Features:**
- Configurable error limit prevents runaway validation
- Returns `ValidationResult<T>` with error array
- Suitable for form validation and debugging
- Better UX - see all issues in one pass

**Related:** Addresses VALIDATOR_GAPS.md #1 "First-failure only"

---

## Performance Optimizations

### 5. DUNION Tag Caching (v0.2.0)

**Status:** ✅ Fully implemented

**Performance gain:** 40x-1,600x speedup for ADT validation

WeakMap-based O(1) discriminant tag lookup for discriminated unions, enabling high-performance ADT validation.

**Features:**
- Automatic for all discriminated unions
- Example: 20-variant ADT validates at 15.9M ops/sec vs 10K ops/sec with UNION
- Zero configuration required
- Uses `Op.DUNION` bytecode opcode

---

### 6. Lazy Path Construction (v0.2.0)

**Status:** ✅ Fully implemented

**Performance gain:** 5-15% overall speedup

Build error paths only when validation fails, eliminating overhead on the success path (80%+ of validations).

---

### 7. Union Result-Based Validation (v0.3.0)

**Status:** ✅ Fully implemented

**Performance gain:** 2-5x speedup

Eliminates exception-based backtracking in union validation by using explicit error returns instead of try/catch.

**Example:** 5-variant union validates at 50,990 ops/sec

---

### 8. Excess-Property Policy (v0.3.0)

**Status:** ✅ Fully implemented

Optional strict mode to reject unknown object properties.

**Usage:**
```ts
import { enc } from "lfts-type-spec";

// Strict mode: reject excess properties
const schema = enc.obj([
  { name: "id", type: enc.str() },
  { name: "name", type: enc.str() }
], true); // strict = true
```

**Features:**
- Minimal overhead (<5%) when enabled
- Optional and disabled by default
- Useful for API validation

---

## Compiler Features

### 9. LFP1020 Policy Rule (v0.3.0)

**Status:** ✅ Fully implemented

Detects and warns about imperative branching patterns (if/else, switch) in domain logic, encouraging functional composition.

**Example warning:**
```
LFP1020: Imperative branching detected. Consider using match() for ADTs
```

---

## Performance Characteristics

Current runtime validation performance:

- **ADT validation**: 8-16M ops/sec (DUNION with caching)
- **Union validation**: 50-200K ops/sec (Result-based, no exceptions)
- **Deep validation**: Optimized path construction
- **Batch validation**: Suitable for high-throughput APIs

See [BYTECODE_REFERENCE.md](BYTECODE_REFERENCE.md) for detailed performance analysis.

---

## Version History

### v0.4.0 (Current)
- ✅ Runtime Introspection Hooks
- ✅ Prebuilt Type Annotations (Nominal, Email, Url, Min, Max, refinements)
- ✅ Error Aggregation (validateAll)

### v0.3.0
- ✅ Result/Option combinators with full API
- ✅ LFP1020 policy rule for imperative branching detection
- ✅ Union result-based validation
- ✅ Excess-property checking

### v0.2.0
- ✅ DUNION tag caching for ADT validation
- ✅ Lazy path construction optimization
- ✅ Zero-exposure schema roots

### v0.1.0
- ✅ Core compiler with Gate/Policy/Transform passes
- ✅ Bytecode-based runtime validator
- ✅ Light-FP subset enforcement
- ✅ Ports discipline
- ✅ ADT validation with match()

---

## See Also

- [FUTURE_DIRECTION.md](FUTURE_DIRECTION.md) - Planned features and roadmap
- [BYTECODE_REFERENCE.md](BYTECODE_REFERENCE.md) - Bytecode format and opcodes
- [VALIDATOR_GAPS.md](VALIDATOR_GAPS.md) - Known limitations
- [LANG-SPEC.md](LANG-SPEC.md) - Light-FP language specification
