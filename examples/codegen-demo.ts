// examples/codegen-demo.ts
// Comprehensive demonstration of all LFTS code generators

import { enc } from "../packages/lfts-type-spec/src/mod.ts";
import { validate } from "../packages/lfts-type-runtime/mod.ts";
import {
  generateJsonSchema,
  generateTypeScript,
  generateFormConfig,
  generateMockData,
} from "../packages/lfts-codegen/mod.ts";

// ============================================================================
// 1. Define a complex schema using the encoder API
// ============================================================================

const UserIdSchema = enc.brand(enc.str(), "UserId");
const EmailSchema = enc.refine.email(enc.str());
const AgeSchema = enc.refine.max(enc.refine.min(enc.num(), 0), 150);

const AddressSchema = enc.obj([
  { name: "street", type: enc.str(), optional: false },
  { name: "city", type: enc.str(), optional: false },
  { name: "state", type: enc.refine.maxLength(enc.str(), 2), optional: false },
  {
    name: "zipCode",
    type: enc.refine.pattern(enc.str(), "^\\d{5}$"),
    optional: false,
  },
]);

const RoleSchema = enc.union(
  enc.lit("admin"),
  enc.lit("user"),
  enc.lit("guest"),
);

const UserSchema = enc.obj([
  { name: "id", type: UserIdSchema, optional: false },
  { name: "name", type: enc.refine.minLength(enc.str(), 1), optional: false },
  { name: "email", type: EmailSchema, optional: false },
  { name: "age", type: AgeSchema, optional: true },
  { name: "role", type: RoleSchema, optional: false },
  { name: "address", type: AddressSchema, optional: true },
  { name: "tags", type: enc.arr(enc.str()), optional: false },
  { name: "isActive", type: enc.bool(), optional: false },
]);

// ============================================================================
// 2. Generate JSON Schema
// ============================================================================

console.log("=".repeat(80));
console.log("1. JSON Schema (Draft 2020-12)");
console.log("=".repeat(80));

const jsonSchema = generateJsonSchema(UserSchema, {
  includeSchema: true,
  strict: true,
  includeTitle: true,
});

console.log(JSON.stringify(jsonSchema, null, 2));

// ============================================================================
// 3. Generate TypeScript Type Definition
// ============================================================================

console.log("\n" + "=".repeat(80));
console.log("2. TypeScript Type Definition");
console.log("=".repeat(80));

const typeScriptCode = generateTypeScript("User", UserSchema, {
  exportTypes: true,
  readonly: false,
});

console.log(typeScriptCode);

// Also generate a readonly version
const readonlyTypeScriptCode = generateTypeScript("ReadonlyUser", UserSchema, {
  exportTypes: true,
  readonly: true,
});

console.log("\n" + readonlyTypeScriptCode);

// ============================================================================
// 4. Generate Form Configuration
// ============================================================================

console.log("\n" + "=".repeat(80));
console.log("3. Form Configuration (for UI frameworks)");
console.log("=".repeat(80));

const formConfig = generateFormConfig(UserSchema, {
  title: "User Registration",
  description: "Create a new user account",
});

console.log(JSON.stringify(formConfig, null, 2));

// ============================================================================
// 5. Generate Mock Data (Deterministic)
// ============================================================================

console.log("\n" + "=".repeat(80));
console.log("4. Mock Data Generation");
console.log("=".repeat(80));

// Generate 3 mock users with the same seed for reproducibility
const mockUsers = Array.from({ length: 3 }, (_, i) =>
  generateMockData(UserSchema, {
    seed: 12345 + i,
    optionalProbability: 0.7, // 70% chance of including optional fields
    maxArrayLength: 3,
    minArrayLength: 1,
  })
);

console.log("Generated mock users:");
mockUsers.forEach((user, i) => {
  console.log(`\nMock User ${i + 1}:`);
  console.log(JSON.stringify(user, null, 2));
});

// ============================================================================
// 6. Validate Mock Data Against Original Schema
// ============================================================================

console.log("\n" + "=".repeat(80));
console.log("5. Validate Mock Data Against Schema");
console.log("=".repeat(80));

mockUsers.forEach((user, i) => {
  try {
    validate(UserSchema, user);
    console.log(`Mock User ${i + 1}: ✓ VALID`);
  } catch (err) {
    console.log(`Mock User ${i + 1}: ✗ INVALID`);
    console.log(`  Error: ${err.message}`);
  }
});

// ============================================================================
// 7. Demonstrate Refinement Constraints in Mock Data
// ============================================================================

console.log("\n" + "=".repeat(80));
console.log("6. Verify Refinement Constraints");
console.log("=".repeat(80));

mockUsers.forEach((user: any, i) => {
  console.log(`\nMock User ${i + 1} Constraints:`);
  console.log(`  Name length: ${user.name?.length} (min: 1)`);
  console.log(`  Email format: ${user.email} (valid email)`);
  if (user.age !== undefined) {
    console.log(`  Age: ${user.age} (0-150)`);
  }
  console.log(`  Role: ${user.role} (admin|user|guest)`);
  if (user.address) {
    console.log(
      `  State code: ${user.address.state} (max 2 chars, got ${user.address.state.length})`,
    );
    console.log(
      `  Zip code: ${user.address.zipCode} (pattern ^\\d{5}$)`,
    );
  }
  console.log(`  Tags array length: ${user.tags.length} (1-3)`);
});

// ============================================================================
// 8. Use Case: API Documentation + Validation + Testing
// ============================================================================

console.log("\n" + "=".repeat(80));
console.log("7. Complete Workflow Example");
console.log("=".repeat(80));

console.log(`
Complete Code Generation Workflow:

1. Define Schema (Once):
   - Use enc.obj(), enc.refine.*, etc.
   - Add all validation constraints

2. Generate JSON Schema:
   - For OpenAPI/Swagger documentation
   - For client SDK generation
   - For API contract validation

3. Generate TypeScript Types:
   - For frontend type safety
   - For backend DTOs
   - For shared type libraries

4. Generate Form Configuration:
   - For React/Vue/Angular forms
   - For validation rules
   - For field metadata

5. Generate Mock Data:
   - For unit tests
   - For integration tests
   - For development/preview environments
   - For load testing

6. Runtime Validation:
   - Validate API requests/responses
   - All mock data is guaranteed valid
   - Single source of truth for all artifacts

Benefits:
✓ No code duplication
✓ Single source of truth
✓ Type-safe across stack
✓ Automatic test data generation
✓ API documentation in sync with implementation
`);

// ============================================================================
// 9. Advanced: Nested Objects and Discriminated Unions
// ============================================================================

console.log("\n" + "=".repeat(80));
console.log("8. Advanced: Discriminated Union Example");
console.log("=".repeat(80));

const SuccessResponseSchema = enc.obj([
  { name: "type", type: enc.lit("success"), optional: false },
  { name: "data", type: UserSchema, optional: false },
  { name: "timestamp", type: enc.num(), optional: false },
]);

const ErrorResponseSchema = enc.obj([
  { name: "type", type: enc.lit("error"), optional: false },
  { name: "message", type: enc.str(), optional: false },
  { name: "code", type: enc.num(), optional: false },
]);

const ApiResponseSchema = enc.dunion("type", [
  { tag: "success", schema: SuccessResponseSchema },
  { tag: "error", schema: ErrorResponseSchema },
]);

console.log("TypeScript for discriminated union API response:");
const apiResponseTS = generateTypeScript("ApiResponse", ApiResponseSchema, {
  exportTypes: true,
});
console.log(apiResponseTS);

console.log("\nJSON Schema for discriminated union:");
const apiResponseJson = generateJsonSchema(ApiResponseSchema);
console.log(JSON.stringify(apiResponseJson, null, 2));

console.log("\nMock success response:");
const mockSuccess = generateMockData(ApiResponseSchema, { seed: 99999 });
console.log(JSON.stringify(mockSuccess, null, 2));

console.log("\n" + "=".repeat(80));
console.log("Demo Complete!");
console.log("=".repeat(80));
