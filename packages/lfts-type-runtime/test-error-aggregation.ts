// Test error aggregation feature
import { enc } from "../lfts-type-spec/src/mod.ts";
import { validateAll, type ValidationResult } from "./mod.ts";

console.log("=== Error Aggregation Tests ===\n");

// Test 1: Object with multiple missing required properties
console.log("Test 1: Multiple missing properties");
const userSchema = enc.obj([
  { name: "name", type: enc.str() },
  { name: "age", type: enc.num() },
  { name: "email", type: enc.str() },
]);

const incompleteUser = { name: "Alice" }; // missing age and email

const result1 = validateAll(userSchema, incompleteUser);
if (!result1.ok) {
  console.log(`  ✓ Found ${result1.errors.length} errors:`);
  result1.errors.forEach((err) =>
    console.log(`    - ${err.path}: ${err.message}`)
  );
} else {
  console.log("  ✗ FAILED: Should have found errors");
}

// Test 2: Nested object with multiple errors
console.log("\nTest 2: Nested object errors");
const nestedSchema = enc.obj([
  {
    name: "user",
    type: enc.obj([
      { name: "name", type: enc.str() },
      { name: "age", type: enc.num() },
    ]),
  },
  { name: "active", type: enc.bool() },
]);

const badNested = {
  user: { name: 123, age: "not a number" }, // two type errors
  active: "yes", // type error
};

const result2 = validateAll(nestedSchema, badNested);
if (!result2.ok) {
  console.log(`  ✓ Found ${result2.errors.length} errors:`);
  result2.errors.forEach((err) =>
    console.log(`    - ${err.path}: ${err.message}`)
  );
} else {
  console.log("  ✗ FAILED: Should have found errors");
}

// Test 3: Array with multiple invalid elements
console.log("\nTest 3: Array with invalid elements");
const numberArraySchema = enc.arr(enc.num());
const mixedArray = [1, "two", 3, "four", 5, "six"];

const result3 = validateAll(numberArraySchema, mixedArray);
if (!result3.ok) {
  console.log(`  ✓ Found ${result3.errors.length} errors:`);
  result3.errors.forEach((err) =>
    console.log(`    - ${err.path}: ${err.message}`)
  );
} else {
  console.log("  ✗ FAILED: Should have found errors");
}

// Test 4: Array of objects with multiple errors per object
console.log("\nTest 4: Array of objects with errors");
const personSchema = enc.obj([
  { name: "name", type: enc.str() },
  { name: "age", type: enc.num() },
]);
const peopleSchema = enc.arr(personSchema);

const badPeople = [
  { name: "Alice", age: 30 }, // valid
  { name: 123, age: "twenty" }, // 2 errors
  { name: "Charlie" }, // 1 error (missing age)
];

const result4 = validateAll(peopleSchema, badPeople);
if (!result4.ok) {
  console.log(`  ✓ Found ${result4.errors.length} errors:`);
  result4.errors.forEach((err) =>
    console.log(`    - ${err.path}: ${err.message}`)
  );
} else {
  console.log("  ✗ FAILED: Should have found errors");
}

// Test 5: Tuple with multiple errors
console.log("\nTest 5: Tuple with errors");
const tupleSchema = enc.tup(enc.str(), enc.num(), enc.bool());
const badTuple = [123, "not a number", "not a boolean"];

const result5 = validateAll(tupleSchema, badTuple);
if (!result5.ok) {
  console.log(`  ✓ Found ${result5.errors.length} errors:`);
  result5.errors.forEach((err) =>
    console.log(`    - ${err.path}: ${err.message}`)
  );
} else {
  console.log("  ✗ FAILED: Should have found errors");
}

// Test 6: Strict mode with excess properties
console.log("\nTest 6: Strict mode with excess properties");
const strictSchema = enc.obj([
  { name: "name", type: enc.str() },
  { name: "age", type: enc.num() },
], true); // strict mode

const dataWithExtras = {
  name: 123, // type error
  age: 25,
  extra1: "bad", // excess property
  extra2: "bad", // excess property
};

const result6 = validateAll(strictSchema, dataWithExtras);
if (!result6.ok) {
  console.log(`  ✓ Found ${result6.errors.length} errors:`);
  result6.errors.forEach((err) =>
    console.log(`    - ${err.path}: ${err.message}`)
  );
} else {
  console.log("  ✗ FAILED: Should have found errors");
}

// Test 7: maxErrors limit
console.log("\nTest 7: maxErrors limit (should stop at 3)");
const arraySchema = enc.arr(enc.str());
const manyBadValues = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]; // 10 errors

const result7 = validateAll(arraySchema, manyBadValues, 3); // limit to 3 errors
if (!result7.ok) {
  console.log(`  ✓ Found ${result7.errors.length} errors (limited to 3):`);
  result7.errors.forEach((err) =>
    console.log(`    - ${err.path}: ${err.message}`)
  );
} else {
  console.log("  ✗ FAILED: Should have found errors");
}

// Test 8: Valid data should pass
console.log("\nTest 8: Valid data (should pass)");
const validUser = { name: "Bob", age: 25, email: "bob@example.com" };
const result8 = validateAll(userSchema, validUser);
if (result8.ok) {
  console.log("  ✓ Valid data passed");
} else {
  console.log("  ✗ FAILED: Should have passed");
  result8.errors.forEach((err) =>
    console.log(`    - ${err.path}: ${err.message}`)
  );
}

// Test 9: Complex nested structure
console.log("\nTest 9: Complex nested structure");
const complexSchema = enc.obj([
  {
    name: "users",
    type: enc.arr(enc.obj([
      { name: "id", type: enc.num() },
      {
        name: "profile",
        type: enc.obj([
          { name: "name", type: enc.str() },
          { name: "tags", type: enc.arr(enc.str()) },
        ]),
      },
    ])),
  },
  { name: "count", type: enc.num() },
]);

const complexData = {
  users: [
    { id: 1, profile: { name: "Alice", tags: ["admin", 123] } }, // tag 123 is wrong type
    { id: "two", profile: { name: 456, tags: ["user"] } }, // id and name wrong type
    { id: 3 }, // missing profile
  ],
  count: "not a number", // wrong type
};

const result9 = validateAll(complexSchema, complexData);
if (!result9.ok) {
  console.log(`  ✓ Found ${result9.errors.length} errors:`);
  result9.errors.forEach((err) =>
    console.log(`    - ${err.path}: ${err.message}`)
  );
} else {
  console.log("  ✗ FAILED: Should have found errors");
}

console.log("\n=== All Tests Complete ===");
