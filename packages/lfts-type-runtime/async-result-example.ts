// packages/lfts-type-runtime/async-result-example.ts
//
// AsyncResult Examples: Direct-Style Effect Handling with Ports
//
// This file demonstrates how to use AsyncResult helpers for composing
// effectful operations with ports/capabilities following LFTS patterns.

import { AsyncResult, Result } from "./mod.ts";

// ============================================================================
// Example Types
// ============================================================================

type User = {
  readonly id: number;
  readonly name: string;
  readonly email: string;
  readonly role: "admin" | "user";
};

type Post = {
  readonly id: number;
  readonly userId: number;
  readonly title: string;
  readonly content: string;
};

type Comment = {
  readonly id: number;
  readonly postId: number;
  readonly userId: number;
  readonly text: string;
};

// Error types for different operations
type LoadError = "not_found" | "network_error" | "permission_denied";
type ValidationError = "invalid_email" | "empty_name" | "unauthorized";
type SaveError = "database_error" | "disk_full" | "permission_denied";

// ============================================================================
// Example Port Interfaces
// ============================================================================

/** @port */
interface DatabasePort {
  loadUser(id: number): Promise<Result<User, LoadError>>;
  saveUser(user: User): Promise<Result<void, SaveError>>;
  loadPosts(userId: number): Promise<Result<readonly Post[], LoadError>>;
  loadComments(postId: number): Promise<Result<readonly Comment[], LoadError>>;
}

/** @port */
interface ValidationPort {
  validateEmail(email: string): Promise<Result<boolean, ValidationError>>;
  validatePermission(
    user: User,
    action: string,
  ): Promise<Result<boolean, ValidationError>>;
}

/** @port */
interface NotificationPort {
  sendEmail(to: string, subject: string): Promise<Result<void, "send_failed">>;
}

// ============================================================================
// Mock Implementations (for demonstration)
// ============================================================================

const mockDatabase: DatabasePort = {
  async loadUser(id: number): Promise<Result<User, LoadError>> {
    // Simulate async operation
    if (id === 999) return Result.err("not_found");
    if (id === 500) return Result.err("network_error");
    return Result.ok({
      id,
      name: `User${id}`,
      email: `user${id}@example.com`,
      role: id === 1 ? "admin" : "user",
    });
  },

  async saveUser(user: User): Promise<Result<void, SaveError>> {
    if (user.id === 666) return Result.err("database_error");
    return Result.ok(undefined);
  },

  async loadPosts(userId: number): Promise<Result<readonly Post[], LoadError>> {
    if (userId === 999) return Result.err("not_found");
    return Result.ok([
      { id: 1, userId, title: "First Post", content: "Hello world" },
      { id: 2, userId, title: "Second Post", content: "More content" },
    ]);
  },

  async loadComments(
    postId: number,
  ): Promise<Result<readonly Comment[], LoadError>> {
    return Result.ok([
      { id: 1, postId, userId: 2, text: "Great post!" },
      { id: 2, postId, userId: 3, text: "Thanks for sharing" },
    ]);
  },
};

const mockValidation: ValidationPort = {
  async validateEmail(email: string): Promise<Result<boolean, ValidationError>> {
    return email.includes("@")
      ? Result.ok(true)
      : Result.err("invalid_email");
  },

  async validatePermission(
    user: User,
    action: string,
  ): Promise<Result<boolean, ValidationError>> {
    if (action === "admin-only" && user.role !== "admin") {
      return Result.err("unauthorized");
    }
    return Result.ok(true);
  },
};

const mockNotification: NotificationPort = {
  async sendEmail(
    to: string,
    _subject: string,
  ): Promise<Result<void, "send_failed">> {
    return to.includes("@") ? Result.ok(undefined) : Result.err("send_failed");
  },
};

// ============================================================================
// Example 1: Basic AsyncResult.try for Exception Handling
// ============================================================================

async function example1_basicTry() {
  console.log("\n=== Example 1: AsyncResult.try ===");

  // Wrap an operation that might throw
  const result = await AsyncResult.try(
    async () => {
      // Simulate a risky operation
      const data = JSON.parse('{"name": "Alice"}');
      return data;
    },
    (err) => `Parse error: ${err}`,
  );

  if (result.ok) {
    console.log("Parsed:", result.value);
  } else {
    console.log("Error:", result.error);
  }

  // With an actual error
  const failResult = await AsyncResult.try(
    async () => {
      throw new Error("Network timeout");
    },
    (err) => `Operation failed: ${(err as Error).message}`,
  );

  if (!failResult.ok) {
    console.log("Caught error:", failResult.error);
  }
}

// ============================================================================
// Example 2: AsyncResult.andThen for Chaining Operations
// ============================================================================

async function example2_chainOperations(db: DatabasePort) {
  console.log("\n=== Example 2: AsyncResult.andThen ===");

  // Chain: load user → load their posts
  const result = await AsyncResult.andThen(
    db.loadUser(1),
    (user) => db.loadPosts(user.id),
  );

  if (result.ok) {
    console.log(`Loaded ${result.value.length} posts`);
  } else {
    console.log("Failed to load:", result.error);
  }

  // Short-circuit example: first operation fails
  const failResult = await AsyncResult.andThen(
    db.loadUser(999), // Will fail with "not_found"
    (user) => db.loadPosts(user.id),
  );

  console.log("Short-circuit error:", failResult.ok ? "unexpected" : failResult.error);
}

// ============================================================================
// Example 3: AsyncResult.map for Transforming Success Values
// ============================================================================

async function example3_transformValues(db: DatabasePort) {
  console.log("\n=== Example 3: AsyncResult.map ===");

  // Load user and extract just their name
  const nameResult = await AsyncResult.map(
    db.loadUser(1),
    (user) => user.name,
  );

  if (nameResult.ok) {
    console.log("User name:", nameResult.value);
  }

  // Load posts and extract titles
  const titlesResult = await AsyncResult.map(
    db.loadPosts(1),
    (posts) => posts.map((p) => p.title),
  );

  if (titlesResult.ok) {
    console.log("Post titles:", titlesResult.value);
  }
}

// ============================================================================
// Example 4: AsyncResult.mapErr for Error Transformation
// ============================================================================

async function example4_transformErrors(db: DatabasePort) {
  console.log("\n=== Example 4: AsyncResult.mapErr ===");

  // Transform technical errors into user-friendly messages
  const result = await AsyncResult.mapErr(
    db.loadUser(999), // Will fail
    (err) => {
      switch (err) {
        case "not_found":
          return "User not found. Please check the ID.";
        case "network_error":
          return "Network connection failed. Please try again.";
        case "permission_denied":
          return "You don't have permission to view this user.";
      }
    },
  );

  if (!result.ok) {
    console.log("User-friendly error:", result.error);
  }
}

// ============================================================================
// Example 5: AsyncResult.all for Parallel Operations
// ============================================================================

async function example5_parallelOperations(db: DatabasePort) {
  console.log("\n=== Example 5: AsyncResult.all ===");

  // Load multiple users in parallel
  const userIds = [1, 2, 3, 4, 5];
  const result = await AsyncResult.all(
    userIds.map((id) => db.loadUser(id)),
  );

  if (result.ok) {
    console.log(`Loaded ${result.value.length} users in parallel`);
    console.log("Names:", result.value.map((u) => u.name));
  }

  // Fail-fast example: one user doesn't exist
  const failResult = await AsyncResult.all([
    db.loadUser(1),
    db.loadUser(999), // This will fail
    db.loadUser(3),
  ]);

  console.log("Parallel fail-fast:", failResult.ok ? "unexpected" : failResult.error);
}

// ============================================================================
// Example 6: AsyncResult.allSettled for Best-Effort Operations
// ============================================================================

async function example6_bestEffort(db: DatabasePort) {
  console.log("\n=== Example 6: AsyncResult.allSettled ===");

  // Try to load multiple users, collect what succeeds
  const result = await AsyncResult.allSettled([
    db.loadUser(1),
    db.loadUser(999), // Will fail
    db.loadUser(2),
    db.loadUser(500), // Will fail
    db.loadUser(3),
  ]);

  console.log(`Successes: ${result.successes.length}`);
  console.log(`Failures: ${result.failures.length}`);
  console.log("Successfully loaded:", result.successes.map((u) => u.name));
  console.log("Failed with errors:", result.failures);
}

// ============================================================================
// Example 7: AsyncResult.race for Fallback Strategies
// ============================================================================

async function example7_raceOperations(db: DatabasePort) {
  console.log("\n=== Example 7: AsyncResult.race ===");

  // Try multiple data sources, use whichever responds first
  // (In a real app, these might be cache vs database vs API)
  const result = await AsyncResult.race([
    db.loadUser(1),
    db.loadUser(1), // Simulate different sources
  ]);

  if (result.ok) {
    console.log("First response:", result.value.name);
  }
}

// ============================================================================
// Example 8: Complex Composition - Load User with Validation
// ============================================================================

async function example8_complexComposition(
  db: DatabasePort,
  validation: ValidationPort,
) {
  console.log("\n=== Example 8: Complex Composition ===");

  // Load user, validate their email, check permissions
  const result = await AsyncResult.andThen(
    db.loadUser(1),
    (user) =>
      AsyncResult.andThen(
        validation.validateEmail(user.email),
        (_isValid) =>
          AsyncResult.map(
            validation.validatePermission(user, "admin-only"),
            (hasPermission) => ({ user, hasPermission }),
          ),
      ),
  );

  if (result.ok) {
    console.log("User:", result.value.user.name);
    console.log("Has admin permission:", result.value.hasPermission);
  }
}

// ============================================================================
// Example 9: Real-World Use Case - Update User Profile
// ============================================================================

async function example9_updateUserProfile(
  db: DatabasePort,
  validation: ValidationPort,
  notification: NotificationPort,
) {
  console.log("\n=== Example 9: Update User Profile ===");

  const userId = 1;
  const newEmail = "newemail@example.com";

  // Multi-step operation: load, validate, update, notify
  const result = await AsyncResult.andThen(
    db.loadUser(userId),
    (user) =>
      AsyncResult.andThen(
        validation.validateEmail(newEmail),
        (_isValid) => {
          const updatedUser: User = { ...user, email: newEmail };
          return AsyncResult.andThen(
            db.saveUser(updatedUser),
            () =>
              AsyncResult.map(
                notification.sendEmail(
                  newEmail,
                  "Email Updated",
                ),
                () => updatedUser,
              ),
          );
        },
      ),
  );

  if (result.ok) {
    console.log("Successfully updated profile:", result.value.email);
  } else {
    console.log("Profile update failed:", result.error);
  }
}

// ============================================================================
// Example 10: Batch Processing with Error Aggregation
// ============================================================================

async function example10_batchProcessing(
  db: DatabasePort,
) {
  console.log("\n=== Example 10: Batch Processing ===");

  // Process multiple users, collect all successes and failures
  const userIds = [1, 2, 999, 3, 500, 4];

  const results = await AsyncResult.allSettled(
    userIds.map((id) =>
      AsyncResult.andThen(
        db.loadUser(id),
        (user) => db.loadPosts(user.id),
      )
    ),
  );

  console.log(`Processed ${userIds.length} users`);
  console.log(`✓ ${results.successes.length} succeeded`);
  console.log(`✗ ${results.failures.length} failed`);

  // Show successful results
  const totalPosts = results.successes.reduce((sum, posts) => sum + posts.length, 0);
  console.log(`Total posts loaded: ${totalPosts}`);

  // Show failure details
  if (results.failures.length > 0) {
    console.log("Failures:", results.failures);
  }
}

// ============================================================================
// Run All Examples
// ============================================================================

if (import.meta.main) {
  console.log("AsyncResult Examples - Direct-Style Effect Handling\n");

  await example1_basicTry();
  await example2_chainOperations(mockDatabase);
  await example3_transformValues(mockDatabase);
  await example4_transformErrors(mockDatabase);
  await example5_parallelOperations(mockDatabase);
  await example6_bestEffort(mockDatabase);
  await example7_raceOperations(mockDatabase);
  await example8_complexComposition(mockDatabase, mockValidation);
  await example9_updateUserProfile(
    mockDatabase,
    mockValidation,
    mockNotification,
  );
  await example10_batchProcessing(mockDatabase);

  console.log("\n✅ All examples completed!");
}
