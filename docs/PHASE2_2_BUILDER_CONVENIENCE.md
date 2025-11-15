# Phase 2.2: Builder API Convenience Methods (v0.12.0)

**Status**: ✅ Complete
**Version**: 0.12.0
**Date**: 2025

## Overview

Added 11 convenience methods to the builder API (`t`) to simplify common validation patterns. These methods provide ergonomic shortcuts for frequently-used type combinations, reducing boilerplate and improving code readability.

## Problem

Before this update, common validation patterns required verbose constructions:

```typescript
// Email validation - verbose
const emailSchema = t.string().email();

// Positive integer - impossible due to chaining limitation
const countSchema = t.number(); // Can't chain .positive().integer()

// String enum - verbose
const statusSchema = t.union(
  t.literal("active"),
  t.literal("inactive"),
  t.literal("pending")
);

// UUID validation - manual pattern
const idSchema = t.string().pattern("^[0-9a-f]{8}-...");
```

## Solution

Added 11 convenience methods to the `t` builder object:

### String Methods
1. **`t.email()`** - Email validation
2. **`t.url()`** - URL validation
3. **`t.uuid()`** - UUID format validation

### Number Methods
4. **`t.positiveNumber()`** - Positive numbers
5. **`t.positiveInteger()`** - Positive integers (combines two refinements)
6. **`t.integer()`** - Integer validation

### Array Methods
7. **`t.nonEmptyArray(element)`** - Non-empty arrays

### Enum Methods
8. **`t.stringEnum(values)`** - Union of string literals
9. **`t.numberEnum(values)`** - Union of number literals
10. **`t.booleanEnum(values)`** - Union of boolean literals

### Literal Aliases
11. **`t.constString(value)`** - Alias for `t.literal()` with clear semantics
12. **`t.constNumber(value)`** - Alias for `t.literal()` with clear semantics

## Implementation Details

### Files Modified

1. **`packages/lfts-type-runtime/builders.ts`** (~200 lines added)
   - Added 11 convenience methods
   - Imported `Op` and `createTypeObject` for direct bytecode construction
   - Special handling for `positiveInteger()` to work around chaining limitation

2. **`packages/lfts-type-runtime/builders-convenience.test.ts`** (NEW, 280 lines)
   - 16 comprehensive tests
   - Individual tests for each convenience method
   - 3 real-world usage examples
   - Integration tests

3. **`deno.json`** - Bumped to v0.12.0

### Key Design Decisions

#### 1. Handling Chaining Limitations

TypeScript refinement types don't preserve the fluent API. For example:

```typescript
// Doesn't work - positive() returns RefinePositiveType, not NumberType
t.number().positive().integer();
```

**Solution**: `positiveInteger()` constructs nested bytecode directly:

```typescript
positiveInteger(): Type {
  // Create nested refinements: integer(positive(number))
  const base = new NumberType().bc;
  const withPositive = [Op.REFINE_POSITIVE, base];
  const withInteger = [Op.REFINE_INTEGER, withPositive];
  return createTypeObject(withInteger);
}
```

This workaround is documented in [TYPE_OBJECTS.md](TYPE_OBJECTS.md) as a known limitation.

#### 2. UUID Pattern

Initially targeted UUID v4 only, but changed to accept any UUID version for broader compatibility:

```typescript
// UUID pattern (any version)
"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"
```

#### 3. Enum Builders

String/number/boolean enum builders use `const T` type parameters for precise type inference:

```typescript
stringEnum<const T extends readonly string[]>(
  values: T
): UnionType<T[number]> {
  const alternatives = values.map((v) => new LiteralType(v));
  return new UnionType(alternatives);
}
```

This preserves exact literal types at compile time.

## Examples

### Basic Usage

```typescript
import { t } from "lfts-type-runtime";

// Email
const emailSchema = t.email();
emailSchema.validate("user@example.com"); // ✅

// URL
const urlSchema = t.url();
urlSchema.validate("https://example.com"); // ✅

// UUID
const uuidSchema = t.uuid();
uuidSchema.validate("550e8400-e29b-41d4-a716-446655440000"); // ✅

// Positive integer
const countSchema = t.positiveInteger();
countSchema.validate(42); // ✅
countSchema.validate(0); // ❌ not positive
countSchema.validate(3.14); // ❌ not integer

// String enum
const statusSchema = t.stringEnum(["active", "inactive", "pending"]);
statusSchema.validate("active"); // ✅
statusSchema.validate("unknown"); // ❌

// Non-empty array
const tagsSchema = t.nonEmptyArray(t.string());
tagsSchema.validate(["tag1", "tag2"]); // ✅
tagsSchema.validate([]); // ❌ empty
```

### Real-World: User Registration

```typescript
const UserRegistration$ = t.object({
  email: t.email(),
  password: t.string().minLength(8),
  age: t.positiveInteger(),
  role: t.stringEnum(["user", "admin", "guest"]),
});

// Valid registration
UserRegistration$.validate({
  email: "alice@example.com",
  password: "password123",
  age: 25,
  role: "user",
}); // ✅
```

### Real-World: Product Schema

```typescript
const Product$ = t.object({
  id: t.uuid(),
  name: t.string(),
  price: t.positiveNumber(),
  quantity: t.positiveInteger(),
  category: t.stringEnum(["electronics", "clothing", "food"]),
  tags: t.nonEmptyArray(t.string()),
  website: t.url(),
});

// Valid product
Product$.validate({
  id: "550e8400-e29b-41d4-a716-446655440000",
  name: "Laptop",
  price: 999.99,
  quantity: 5,
  category: "electronics",
  tags: ["computer", "portable"],
  website: "https://example.com/laptop",
}); // ✅
```

### Real-World: API Pagination

```typescript
const Pagination$ = t.object({
  page: t.positiveInteger(),
  limit: t.positiveInteger(),
  sort: t.stringEnum(["asc", "desc"]),
});

Pagination$.validate({ page: 1, limit: 10, sort: "asc" }); // ✅
Pagination$.validate({ page: 0, limit: 10, sort: "asc" }); // ❌ page must be positive
```

## Test Results

All tests passing:

- ✅ 16/16 builder convenience tests (new)
- ✅ 28/28 compiler golden tests (existing, unchanged)
- ✅ 3/3 performance regression tests (no degradation)
- ✅ 8/8 union diagnostics tests (Phase 2.1, unchanged)

## API Reference

### String Convenience Methods

#### `t.email(): StringType`
Validates email format using built-in email refinement.

#### `t.url(): StringType`
Validates URL format using built-in URL refinement.

#### `t.uuid(): StringType`
Validates UUID format (8-4-4-4-12 hex digits, any version).

### Number Convenience Methods

#### `t.positiveNumber(): NumberType`
Validates positive numbers (> 0).

#### `t.positiveInteger(): Type`
Validates positive integers. Uses direct bytecode construction to work around chaining limitations.

#### `t.integer(): NumberType`
Validates integers (any sign).

### Array Convenience Methods

#### `t.nonEmptyArray<T>(element: Type<T>): Type`
Validates non-empty arrays of the given element type.

### Enum Convenience Methods

#### `t.stringEnum<const T extends readonly string[]>(values: T): UnionType<T[number]>`
Creates a union of string literals from an array.

**Example**:
```typescript
const Status$ = t.stringEnum(["active", "inactive", "pending"]);
// Type: UnionType<"active" | "inactive" | "pending">
```

#### `t.numberEnum<const T extends readonly number[]>(values: T): UnionType<T[number]>`
Creates a union of number literals from an array.

#### `t.booleanEnum<const T extends readonly boolean[]>(values: T): UnionType<T[number]>`
Creates a union of boolean literals from an array.

### Literal Convenience Methods

#### `t.constString<const T extends string>(value: T): LiteralType<T>`
Alias for `t.literal()` with better semantics for const strings.

#### `t.constNumber<const T extends number>(value: T): LiteralType<T>`
Alias for `t.literal()` with better semantics for const numbers.

## Performance Impact

- **Zero overhead** - Convenience methods delegate to existing primitives
- **Compile-time optimization** - No additional runtime cost
- **Same bytecode** - Generates identical bytecode as manual construction

## Limitations

### Chaining Not Supported

Due to refinement type limitations, you cannot chain methods on convenience method results:

```typescript
// ❌ Doesn't work
t.email().maxLength(255);

// ✅ Works
t.string().email(); // Can chain on primitives
```

**Workaround**: Use the schema-root pattern for complex refinements:

```typescript
// types.ts
type Email = string & Email & MaxLength<255>;

// types.schema.ts
export type EmailSchema = Email;  // Compiler generates refined bytecode
```

See [TYPE_OBJECTS.md](TYPE_OBJECTS.md) for details.

## Future Enhancements

Potential improvements for future versions:

1. **More string formats**:
   - `t.ipAddress()` - IP address validation
   - `t.phoneNumber()` - Phone number format
   - `t.creditCard()` - Credit card number (with Luhn check)

2. **Date/time helpers**:
   - `t.isoDate()` - ISO 8601 date string
   - `t.timestamp()` - Unix timestamp

3. **Numeric ranges**:
   - `t.percentage()` - 0-100 range
   - `t.port()` - Valid port number (1-65535)

4. **Custom enum builder**:
   - `t.enum(MyEnum)` - Direct TypeScript enum support

## Benefits

1. **Better DX**: Less boilerplate for common patterns
2. **Self-documenting**: Method names clearly express intent
3. **Type-safe**: Full TypeScript type inference
4. **Consistent**: Follows existing builder API patterns
5. **Tested**: Comprehensive test coverage

## Conclusion

Phase 2.2 successfully adds 11 convenience methods to the builder API, significantly improving developer experience for common validation patterns. The implementation handles refinement chaining limitations elegantly and provides a solid foundation for future additions.
