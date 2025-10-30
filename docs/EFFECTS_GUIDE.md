# Effect Handling in LFTS

**Direct-Style Effect Handling with Ports and AsyncResult**

This guide explains how to handle effectful operations (I/O, async, errors) in LFTS using the ports/capabilities pattern and AsyncResult helpers.

## Table of Contents

- [Philosophy](#philosophy)
- [Core Concepts](#core-concepts)
- [AsyncResult API](#asyncresult-api)
- [Port Validation](#port-validation)
- [Patterns and Examples](#patterns-and-examples)
- [Compiler Guidance](#compiler-guidance)
- [Migration Guide](#migration-guide)

---

## Philosophy

### Effects Are Just Async Functions That Can Fail

LFTS takes a **direct style** approach to effect handling:

```typescript
// ✅ LFTS approach: Direct style with async/await
async function loadUser(id: number): Promise<Result<User, LoadError>> {
  return AsyncResult.try(
    async () => await db.query("SELECT * FROM users WHERE id = ?", [id]),
    (err) => "database_error"
  );
}

// ❌ Not needed: Monadic Effect types
type Effect<R, E, A> = (r: R) => Promise<Either<E, A>>; // Too complex!
```

**Key principles:**

1. **Use JavaScript's native `Promise` and `async/await`** - No custom Effect monad
2. **Combine with `Result<T, E>` for error handling** - Explicit, type-safe errors
3. **Ports define effectful capabilities** - Dependency injection, testability
4. **AsyncResult helpers for composition** - Clean, functional style

---

## Core Concepts

### Result Type

The foundation of error handling in LFTS:

```typescript
type Result<T, E> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };
```

**Usage:**

```typescript
// Success
const success: Result<number, string> = Result.ok(42);

// Failure
const failure: Result<number, string> = Result.err("not found");

// Pattern matching
if (result.ok) {
  console.log(result.value); // Type: number
} else {
  console.log(result.error); // Type: string
}
```

### Promise<Result<T, E>>

Effectful operations return `Promise<Result<T, E>>`:

```typescript
interface DatabasePort {
  query(sql: string, params: any[]): Promise<Result<Row[], DbError>>;
  execute(sql: string, params: any[]): Promise<Result<number, DbError>>;
}
```

This combination provides:
- **Asynchrony** via `Promise`
- **Error handling** via `Result`
- **Type safety** for both success and error cases

### Ports/Capabilities

Ports are **interfaces** that define effectful capabilities:

```typescript
/** @port */
interface StoragePort {
  load(key: string): Promise<Result<Data, LoadError>>;
  save(key: string, data: Data): Promise<Result<void, SaveError>>;
}
```

**Benefits:**
- Dependency injection
- Easy testing (mock implementations)
- Clear boundaries between pure and effectful code
- Runtime contract validation (optional)

---

## AsyncResult API

The `AsyncResult` namespace provides helpers for composing `Promise<Result<T, E>>` operations.

### AsyncResult.try()

Wrap async operations that may throw into `Promise<Result<T, E>>`:

```typescript
const result = await AsyncResult.try(
  async () => await fetch(url).then(r => r.json()),
  (err) => `Network error: ${err}`
);

if (result.ok) {
  console.log("Data:", result.value);
} else {
  console.log("Error:", result.error);
}
```

**Before (manual try/catch):**
```typescript
async function loadData(): Promise<Result<Data, string>> {
  try {
    const response = await fetch(url);
    const data = await response.json();
    return Result.ok(data);
  } catch (err) {
    return Result.err(`Network error: ${err}`);
  }
}
```

**After (AsyncResult.try):**
```typescript
async function loadData(): Promise<Result<Data, string>> {
  return AsyncResult.try(
    async () => await fetch(url).then(r => r.json()),
    (err) => `Network error: ${err}`
  );
}
```

### AsyncResult.andThen()

Chain async Result-returning functions together:

```typescript
const result = await AsyncResult.andThen(
  loadUser(userId),
  (user) => loadPosts(user.id)
);
// result: Result<Post[], LoadError>
```

**Example - Multi-step operation:**
```typescript
async function updateUserEmail(
  userId: number,
  newEmail: string
): Promise<Result<void, UpdateError>> {
  return AsyncResult.andThen(
    loadUser(userId),
    (user) => AsyncResult.andThen(
      validateEmail(newEmail),
      () => AsyncResult.andThen(
        saveUser({ ...user, email: newEmail }),
        () => sendConfirmationEmail(newEmail)
      )
    )
  );
}
```

### AsyncResult.map()

Transform the success value inside an async Result:

```typescript
const nameResult = await AsyncResult.map(
  loadUser(userId),
  (user) => user.name
);
// nameResult: Result<string, LoadError>
```

**Example - Extract specific fields:**
```typescript
const postTitles = await AsyncResult.map(
  loadPosts(userId),
  (posts) => posts.map(p => p.title)
);
// postTitles: Result<string[], LoadError>
```

### AsyncResult.mapErr()

Transform the error value inside an async Result:

```typescript
const result = await AsyncResult.mapErr(
  loadUser(userId),
  (err) => {
    switch (err) {
      case "not_found": return "User not found";
      case "network_error": return "Network connection failed";
      default: return "Unknown error";
    }
  }
);
```

### AsyncResult.all()

Run multiple async Results in parallel. Fail-fast on first error:

```typescript
const results = await AsyncResult.all([
  loadUser(1),
  loadUser(2),
  loadUser(3),
]);

if (results.ok) {
  console.log("All users loaded:", results.value);
  // Type: [User, User, User]
} else {
  console.log("Failed to load user:", results.error);
}
```

**Example - Parallel data loading:**
```typescript
async function loadDashboard(userId: number) {
  return AsyncResult.all([
    loadUser(userId),
    loadPosts(userId),
    loadComments(userId),
  ]).then(result => {
    if (!result.ok) return result;

    const [user, posts, comments] = result.value;
    return Result.ok({ user, posts, comments });
  });
}
```

### AsyncResult.allSettled()

Run all async Results in parallel. Collect all successes and failures:

```typescript
const result = await AsyncResult.allSettled([
  loadUser(1),
  loadUser(999), // Will fail
  loadUser(3),
]);

console.log(`Loaded ${result.successes.length} users`);
console.log(`Failed ${result.failures.length} operations`);
// successes: [User, User]
// failures: ["not_found"]
```

**Example - Best-effort batch processing:**
```typescript
async function loadMultipleUsers(ids: number[]) {
  const result = await AsyncResult.allSettled(
    ids.map(id => loadUser(id))
  );

  return {
    users: result.successes,
    errors: result.failures,
  };
}
```

### AsyncResult.race()

Race multiple async Results. Return the first one that completes:

```typescript
const result = await AsyncResult.race([
  loadFromCache(key),
  loadFromDatabase(key),
  loadFromAPI(key),
]);
```

---

## Port Validation

### Defining Ports

Ports are TypeScript interfaces with the `@port` JSDoc tag:

```typescript
/** @port */
interface StoragePort {
  load(key: string): Promise<Result<Data, LoadError>>;
  save(key: string, data: Data): Promise<Result<void, SaveError>>;
}
```

**Port naming convention:**
- Use `Port` or `Capability` suffix
- Defined in `src/ports/` directory
- Only method signatures (no properties)

### Port Schemas (Optional)

For runtime validation, create port schemas using `enc.port()`:

```typescript
import { enc } from "@lfts/type-spec";

const StoragePort$ = enc.port("StoragePort", [
  {
    name: "load",
    params: [enc.str()],
    returnType: enc.obj([])
  },
  {
    name: "save",
    params: [enc.str(), enc.obj([])],
    returnType: enc.obj([])
  },
]);
```

### Runtime Validation

Use `validatePort()` to verify implementations at runtime:

```typescript
import { validatePort } from "@lfts/type-runtime";

// Create implementation
const memoryStorage: StoragePort = {
  async load(key) {
    const data = cache.get(key);
    return data ? Result.ok(data) : Result.err("not_found");
  },
  async save(key, data) {
    cache.set(key, data);
    return Result.ok(undefined);
  },
};

// Validate
const validation = validatePort<StoragePort>(StoragePort$, memoryStorage);

if (validation.ok) {
  const storage = validation.value; // Type-safe!
  // Use storage...
} else {
  console.error("Invalid implementation:", validation.error.message);
}
```

**Validation checks:**
- ✅ Implementation is an object
- ✅ All required methods exist
- ✅ Methods are functions
- ✅ Methods have correct arity (parameter count)
- ❌ Does NOT validate parameter types (impractical at runtime)
- ❌ Does NOT validate return types (would require calling functions)

### Use Cases for Port Validation

1. **Dependency Injection Containers**
   ```typescript
   class Container {
     register<T>(portSchema: any, impl: unknown) {
       const validation = validatePort<T>(portSchema, impl);
       if (!validation.ok) {
         throw new Error(validation.error.message);
       }
       this.ports.set(getPortName(portSchema)!, validation.value);
     }
   }
   ```

2. **Plugin Systems**
   ```typescript
   async function loadPlugin(plugin: unknown) {
     const validation = validatePort<PluginPort>(PluginPort$, plugin);
     if (!validation.ok) {
       return Result.err(`Invalid plugin: ${validation.error.message}`);
     }
     return Result.ok(validation.value);
   }
   ```

3. **Testing**
   ```typescript
   test("storage implementation", () => {
     const mockStorage = createMockStorage();
     const validation = validatePort<StoragePort>(StoragePort$, mockStorage);
     assert(validation.ok, "Mock should match port contract");
   });
   ```

---

## Patterns and Examples

### Pattern 1: Simple Effect Operation

**Scenario:** Load data from an external source.

```typescript
async function loadUser(id: number): Promise<Result<User, LoadError>> {
  return AsyncResult.try(
    async () => {
      const response = await fetch(`/api/users/${id}`);
      if (!response.ok) throw new Error("Not found");
      return await response.json();
    },
    (err): LoadError => "network_error"
  );
}
```

### Pattern 2: Sequential Composition

**Scenario:** Load user, then load their posts.

```typescript
async function loadUserWithPosts(
  userId: number
): Promise<Result<UserWithPosts, LoadError>> {
  return AsyncResult.andThen(
    loadUser(userId),
    (user) => AsyncResult.map(
      loadPosts(user.id),
      (posts) => ({ user, posts })
    )
  );
}
```

### Pattern 3: Parallel Loading

**Scenario:** Load multiple resources in parallel.

```typescript
async function loadDashboard(
  userId: number
): Promise<Result<Dashboard, LoadError>> {
  const results = await AsyncResult.all([
    loadUser(userId),
    loadPosts(userId),
    loadComments(userId),
  ]);

  return Result.map(results, ([user, posts, comments]) => ({
    user,
    posts,
    comments,
  }));
}
```

### Pattern 4: Error Transformation

**Scenario:** Convert technical errors to user-friendly messages.

```typescript
async function loadUserFriendly(
  userId: number
): Promise<Result<User, string>> {
  return AsyncResult.mapErr(
    loadUser(userId),
    (err) => {
      switch (err) {
        case "not_found":
          return "User not found. Please check the ID.";
        case "network_error":
          return "Network connection failed. Please try again.";
        case "permission_denied":
          return "You don't have permission to view this user.";
      }
    }
  );
}
```

### Pattern 5: Best-Effort Batch Processing

**Scenario:** Process multiple items, collect successes and failures.

```typescript
async function batchProcessUsers(
  userIds: number[]
): Promise<{ processed: User[]; failed: LoadError[] }> {
  const result = await AsyncResult.allSettled(
    userIds.map(id => loadUser(id))
  );

  return {
    processed: result.successes,
    failed: result.failures,
  };
}
```

### Pattern 6: Fallback Strategies

**Scenario:** Try multiple data sources, use first successful.

```typescript
async function loadUserWithFallback(
  userId: number
): Promise<Result<User, LoadError>> {
  // Try cache, then database, then API
  return AsyncResult.race([
    loadUserFromCache(userId),
    loadUserFromDatabase(userId),
    loadUserFromAPI(userId),
  ]);
}
```

### Pattern 7: Dependency Injection

**Scenario:** Application with testable dependencies.

```typescript
type AppPorts = {
  storage: StoragePort;
  logger: LoggerPort;
  notification: NotificationPort;
};

function createApp(ports: AppPorts) {
  return {
    async processData(key: string, data: Data) {
      ports.logger.log(`Processing ${key}`);

      const result = await AsyncResult.andThen(
        ports.storage.save(key, data),
        () => ports.notification.send("Data saved", key)
      );

      if (result.ok) {
        ports.logger.log("Processing complete");
      } else {
        ports.logger.error(`Processing failed: ${result.error}`);
      }

      return result;
    },
  };
}

// Production
const app = createApp({
  storage: fileStorage("./data"),
  logger: consoleLogger,
  notification: emailNotifier,
});

// Testing
const testApp = createApp({
  storage: mockStorage(),
  logger: silentLogger,
  notification: mockNotifier(),
});
```

---

## Compiler Guidance

The LFTS compiler provides helpful warnings (LFP1030) when it detects manual Promise<Result> handling that could be simplified with AsyncResult helpers.

### Warning: Manual try/catch

```typescript
// ⚠️ LFP1030: Consider using AsyncResult.try()
async function loadData(): Promise<Result<Data, string>> {
  try {
    const data = await fetchData();
    return Result.ok(data);
  } catch (err) {
    return Result.err("error");
  }
}

// ✅ Better
async function loadData(): Promise<Result<Data, string>> {
  return AsyncResult.try(
    async () => await fetchData(),
    (err) => "error"
  );
}
```

### Warning: Manual .then() chaining

```typescript
// ⚠️ LFP1030: Consider using AsyncResult.andThen() or AsyncResult.map()
async function processData(): Promise<Result<Output, Error>> {
  return loadData().then(result => {
    if (result.ok) {
      return Result.ok(transform(result.value));
    }
    return result;
  });
}

// ✅ Better
async function processData(): Promise<Result<Output, Error>> {
  return AsyncResult.map(loadData(), transform);
}
```

### Disabling Warnings

If you prefer manual handling, you can disable LFP1030 in `lfts.config.json`:

```json
{
  "rules": {
    "suggest-async-result": {
      "enabled": false
    }
  }
}
```

---

## Migration Guide

### From Manual Promise Handling

**Before:**
```typescript
async function loadUser(id: number): Promise<Result<User, Error>> {
  try {
    const user = await db.findUser(id);
    if (!user) {
      return Result.err("not_found");
    }
    return Result.ok(user);
  } catch (err) {
    return Result.err("database_error");
  }
}
```

**After:**
```typescript
async function loadUser(id: number): Promise<Result<User, Error>> {
  return AsyncResult.try(
    async () => {
      const user = await db.findUser(id);
      if (!user) throw new Error("not_found");
      return user;
    },
    (err) => err.message === "not_found" ? "not_found" : "database_error"
  );
}
```

### From Callback Hell

**Before:**
```typescript
function processUser(id: number, callback: (err: Error | null, result?: Data) => void) {
  loadUser(id, (err1, user) => {
    if (err1) return callback(err1);
    loadPosts(user.id, (err2, posts) => {
      if (err2) return callback(err2);
      enrichData(posts, (err3, data) => {
        if (err3) return callback(err3);
        callback(null, data);
      });
    });
  });
}
```

**After:**
```typescript
async function processUser(id: number): Promise<Result<Data, Error>> {
  return AsyncResult.andThen(
    loadUser(id),
    (user) => AsyncResult.andThen(
      loadPosts(user.id),
      (posts) => enrichData(posts)
    )
  );
}
```

### From Promise.all()

**Before:**
```typescript
async function loadAll(ids: number[]): Promise<User[]> {
  try {
    return await Promise.all(ids.map(id => loadUser(id)));
  } catch (err) {
    throw new Error(`Failed to load users: ${err}`);
  }
}
```

**After:**
```typescript
async function loadAll(ids: number[]): Promise<Result<User[], LoadError>> {
  return AsyncResult.all(ids.map(id => loadUser(id)));
}
```

---

## Best Practices

### 1. Return Promise<Result<T, E>>, Not Promise<T>

```typescript
// ❌ Bad: Throws exceptions
async function loadUser(id: number): Promise<User> {
  const user = await db.findUser(id);
  if (!user) throw new Error("Not found");
  return user;
}

// ✅ Good: Returns Result
async function loadUser(id: number): Promise<Result<User, LoadError>> {
  return AsyncResult.try(
    async () => {
      const user = await db.findUser(id);
      if (!user) throw new Error("Not found");
      return user;
    },
    () => "not_found"
  );
}
```

### 2. Use Specific Error Types

```typescript
// ❌ Bad: String error
type LoadError = string;

// ✅ Good: Discriminated union
type LoadError =
  | "not_found"
  | "network_error"
  | "permission_denied";

// ✅ Even better: ADT
type LoadError =
  | { type: "not_found"; id: number }
  | { type: "network_error"; message: string }
  | { type: "permission_denied"; userId: number };
```

### 3. Keep Error Types Cohesive

```typescript
// ❌ Bad: Generic error for everything
type AppError =
  | "user_not_found"
  | "post_not_found"
  | "network_error"
  | "validation_error"
  // ... 50 more cases

// ✅ Good: Specific error types per operation
type UserLoadError = "not_found" | "permission_denied";
type PostLoadError = "not_found" | "user_not_author";
type SaveError = "database_error" | "validation_error";
```

### 4. Use Ports for All Effects

```typescript
// ❌ Bad: Direct dependencies
import { readFile } from "fs/promises";

async function loadConfig() {
  const data = await readFile("config.json", "utf-8");
  return JSON.parse(data);
}

// ✅ Good: Port abstraction
interface FileSystemPort {
  readFile(path: string): Promise<Result<string, ReadError>>;
}

async function loadConfig(fs: FileSystemPort) {
  return AsyncResult.map(
    fs.readFile("config.json"),
    (data) => JSON.parse(data)
  );
}
```

### 5. Compose with AsyncResult Helpers

```typescript
// ❌ Bad: Manual composition
async function complex(id: number) {
  const result1 = await step1(id);
  if (!result1.ok) return result1;

  const result2 = await step2(result1.value);
  if (!result2.ok) return result2;

  const result3 = await step3(result2.value);
  return result3;
}

// ✅ Good: Use helpers
async function complex(id: number) {
  return AsyncResult.andThen(
    step1(id),
    (v1) => AsyncResult.andThen(
      step2(v1),
      (v2) => step3(v2)
    )
  );
}
```

---

## Summary

**Effect handling in LFTS is simple:**

1. **Use `Promise<Result<T, E>>`** for async operations that can fail
2. **Define ports (interfaces)** for all effectful capabilities
3. **Compose with AsyncResult helpers** for clean, functional code
4. **Validate ports at runtime** (optional) for DI/plugin systems
5. **Follow compiler warnings** for best practices

**Key takeaway:** Effects are just async functions that can fail. No monads needed!

For complete API reference and examples, see:
- [AsyncResult examples](../packages/lfts-type-runtime/async-result-example.ts)
- [Port validation examples](../packages/lfts-type-runtime/port-validation-example.ts)
- [Runtime API docs](../packages/lfts-type-runtime/mod.ts)
