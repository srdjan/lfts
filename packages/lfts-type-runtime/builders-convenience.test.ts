// Test for Phase 2.2: Builder API convenience methods (v0.12.0)
// Verifies that all convenience methods work correctly

import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { t } from "./builders.ts";

Deno.test("t.email() - validates email format", () => {
  const schema = t.email();

  // Valid emails
  assertEquals(schema.validateSafe("user@example.com").ok, true);
  assertEquals(schema.validateSafe("test.user+tag@sub.example.co.uk").ok, true);

  // Invalid emails
  assertEquals(schema.validateSafe("not-an-email").ok, false);
  assertEquals(schema.validateSafe("missing@domain").ok, false);
  assertEquals(schema.validateSafe(123).ok, false);
});

Deno.test("t.url() - validates URL format", () => {
  const schema = t.url();

  // Valid URLs
  assertEquals(schema.validateSafe("https://example.com").ok, true);
  assertEquals(schema.validateSafe("http://localhost:3000/path?query=1").ok, true);

  // Invalid URLs
  assertEquals(schema.validateSafe("not a url").ok, false);
  assertEquals(schema.validateSafe(123).ok, false);
});

Deno.test("t.uuid() - validates UUID format", () => {
  const schema = t.uuid();

  // Valid UUIDs
  assertEquals(schema.validateSafe("550e8400-e29b-41d4-a716-446655440000").ok, true);
  assertEquals(schema.validateSafe("6ba7b810-9dad-11d1-80b4-00c04fd430c8").ok, true);

  // Invalid UUIDs
  assertEquals(schema.validateSafe("not-a-uuid").ok, false);
  assertEquals(schema.validateSafe("550e8400-e29b-41d4-a716").ok, false); // Too short
  assertEquals(schema.validateSafe("550e8400-e29b-41d4-a716-446655440000-extra").ok, false); // Too long
  assertEquals(schema.validateSafe(123).ok, false);
});

Deno.test("t.positiveNumber() - validates positive numbers", () => {
  const schema = t.positiveNumber();

  // Valid positive numbers
  assertEquals(schema.validateSafe(1).ok, true);
  assertEquals(schema.validateSafe(0.1).ok, true);
  assertEquals(schema.validateSafe(999.99).ok, true);

  // Invalid (zero, negative, non-numbers)
  assertEquals(schema.validateSafe(0).ok, false);
  assertEquals(schema.validateSafe(-1).ok, false);
  assertEquals(schema.validateSafe(-0.1).ok, false);
  assertEquals(schema.validateSafe("123").ok, false);
});

Deno.test("t.positiveInteger() - validates positive integers", () => {
  const schema = t.positiveInteger();

  // Valid positive integers
  assertEquals(schema.validateSafe(1).ok, true);
  assertEquals(schema.validateSafe(42).ok, true);
  assertEquals(schema.validateSafe(1000).ok, true);

  // Invalid (zero, negative, decimals, non-numbers)
  assertEquals(schema.validateSafe(0).ok, false);
  assertEquals(schema.validateSafe(-1).ok, false);
  assertEquals(schema.validateSafe(1.5).ok, false);
  assertEquals(schema.validateSafe("123").ok, false);
});

Deno.test("t.integer() - validates integers", () => {
  const schema = t.integer();

  // Valid integers
  assertEquals(schema.validateSafe(0).ok, true);
  assertEquals(schema.validateSafe(42).ok, true);
  assertEquals(schema.validateSafe(-10).ok, true);

  // Invalid (decimals, non-numbers)
  assertEquals(schema.validateSafe(1.5).ok, false);
  assertEquals(schema.validateSafe(-3.14).ok, false);
  assertEquals(schema.validateSafe("123").ok, false);
});

Deno.test("t.nonEmptyArray() - validates non-empty arrays", () => {
  const schema = t.nonEmptyArray(t.string());

  // Valid non-empty arrays
  assertEquals(schema.validateSafe(["a"]).ok, true);
  assertEquals(schema.validateSafe(["a", "b", "c"]).ok, true);

  // Invalid (empty array, non-arrays)
  assertEquals(schema.validateSafe([]).ok, false);
  assertEquals(schema.validateSafe("not an array").ok, false);
  assertEquals(schema.validateSafe(123).ok, false);
});

Deno.test("t.stringEnum() - creates string literal unions", () => {
  const schema = t.stringEnum(["active", "inactive", "pending"]);

  // Valid literals
  assertEquals(schema.validateSafe("active").ok, true);
  assertEquals(schema.validateSafe("inactive").ok, true);
  assertEquals(schema.validateSafe("pending").ok, true);

  // Invalid (not in enum)
  assertEquals(schema.validateSafe("unknown").ok, false);
  assertEquals(schema.validateSafe("").ok, false);
  assertEquals(schema.validateSafe(123).ok, false);
});

Deno.test("t.numberEnum() - creates number literal unions", () => {
  const schema = t.numberEnum([1, 2, 3, 4, 5]);

  // Valid literals
  assertEquals(schema.validateSafe(1).ok, true);
  assertEquals(schema.validateSafe(3).ok, true);
  assertEquals(schema.validateSafe(5).ok, true);

  // Invalid (not in enum)
  assertEquals(schema.validateSafe(0).ok, false);
  assertEquals(schema.validateSafe(6).ok, false);
  assertEquals(schema.validateSafe("1").ok, false);
});

Deno.test("t.booleanEnum() - creates boolean literal unions", () => {
  const trueOnly = t.booleanEnum([true]);
  const falseOnly = t.booleanEnum([false]);
  const both = t.booleanEnum([true, false]);

  // True only
  assertEquals(trueOnly.validateSafe(true).ok, true);
  assertEquals(trueOnly.validateSafe(false).ok, false);

  // False only
  assertEquals(falseOnly.validateSafe(false).ok, true);
  assertEquals(falseOnly.validateSafe(true).ok, false);

  // Both (same as t.boolean())
  assertEquals(both.validateSafe(true).ok, true);
  assertEquals(both.validateSafe(false).ok, true);
  assertEquals(both.validateSafe("true").ok, false);
});

Deno.test("t.constString() - creates string literal type", () => {
  const schema = t.constString("user");

  // Valid literal
  assertEquals(schema.validateSafe("user").ok, true);

  // Invalid
  assertEquals(schema.validateSafe("admin").ok, false);
  assertEquals(schema.validateSafe("").ok, false);
  assertEquals(schema.validateSafe(123).ok, false);
});

Deno.test("t.constNumber() - creates number literal type", () => {
  const schema = t.constNumber(42);

  // Valid literal
  assertEquals(schema.validateSafe(42).ok, true);

  // Invalid
  assertEquals(schema.validateSafe(43).ok, false);
  assertEquals(schema.validateSafe("42").ok, false);
  assertEquals(schema.validateSafe(0).ok, false);
});

// Real-world usage examples

Deno.test("real-world: user registration schema", () => {
  const UserRegistration$ = t.object({
    email: t.email(),
    password: t.string().minLength(8),
    age: t.positiveInteger(),
    role: t.stringEnum(["user", "admin", "guest"]),
  });

  // Valid user
  const validUser = {
    email: "alice@example.com",
    password: "password123",
    age: 25,
    role: "user",
  };
  assertEquals(UserRegistration$.validateSafe(validUser).ok, true);

  // Invalid email
  const invalidEmail = { ...validUser, email: "not-an-email" };
  assertEquals(UserRegistration$.validateSafe(invalidEmail).ok, false);

  // Invalid age (not positive)
  const invalidAge = { ...validUser, age: 0 };
  assertEquals(UserRegistration$.validateSafe(invalidAge).ok, false);

  // Invalid role (not in enum)
  const invalidRole = { ...validUser, role: "superuser" };
  assertEquals(UserRegistration$.validateSafe(invalidRole).ok, false);
});

Deno.test("real-world: product schema with convenience methods", () => {
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
  const validProduct = {
    id: "550e8400-e29b-41d4-a716-446655440000",
    name: "Laptop",
    price: 999.99,
    quantity: 5,
    category: "electronics",
    tags: ["computer", "portable"],
    website: "https://example.com/laptop",
  };
  assertEquals(Product$.validateSafe(validProduct).ok, true);

  // Invalid UUID
  const invalidId = { ...validProduct, id: "not-a-uuid" };
  assertEquals(Product$.validateSafe(invalidId).ok, false);

  // Invalid price (negative)
  const invalidPrice = { ...validProduct, price: -10 };
  assertEquals(Product$.validateSafe(invalidPrice).ok, false);

  // Empty tags array
  const emptyTags = { ...validProduct, tags: [] };
  assertEquals(Product$.validateSafe(emptyTags).ok, false);
});

Deno.test("real-world: API pagination schema", () => {
  const Pagination$ = t.object({
    page: t.positiveInteger(),
    limit: t.positiveInteger(),
    sort: t.stringEnum(["asc", "desc"]),
  });

  // Valid pagination
  assertEquals(Pagination$.validateSafe({ page: 1, limit: 10, sort: "asc" }).ok, true);

  // Invalid page (zero)
  assertEquals(Pagination$.validateSafe({ page: 0, limit: 10, sort: "asc" }).ok, false);

  // Invalid sort
  assertEquals(Pagination$.validateSafe({ page: 1, limit: 10, sort: "random" }).ok, false);
});

Deno.test("convenience methods work in object schemas", () => {
  // Demonstrates using multiple convenience methods together
  const Schema$ = t.object({
    email: t.email(),
    url: t.url(),
    count: t.positiveInteger(),
  });

  assertEquals(Schema$.validateSafe({
    email: "test@example.com",
    url: "https://example.com",
    count: 42,
  }).ok, true);

  // Invalid email
  assertEquals(Schema$.validateSafe({
    email: "not-an-email",
    url: "https://example.com",
    count: 42,
  }).ok, false);
});
