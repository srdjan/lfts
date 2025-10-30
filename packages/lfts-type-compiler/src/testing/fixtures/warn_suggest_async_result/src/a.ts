// Test LFP1030: Should suggest AsyncResult helpers for Promise<Result> patterns

import { Result } from "../../../../../../lfts-type-runtime/mod.ts";

type User = { id: number; name: string };
type LoadError = "not_found" | "network_error";

// BAD: Manual try/catch with Result.err - should suggest AsyncResult.try()
export async function loadUserBad1(id: number): Promise<Result<User, LoadError>> {
  try {
    const response = await fetch(`/api/users/${id}`);
    const data = await response.json();
    return Result.ok(data);
  } catch (err) {
    return Result.err("network_error");
  }
}

// BAD: Manual .then() chaining with Result checks - should suggest AsyncResult helpers
export async function loadUserBad2(id: number): Promise<Result<User, LoadError>> {
  return fetch(`/api/users/${id}`)
    .then(r => r.json())
    .then(data => {
      if (data.ok) {
        return Result.ok(data.value);
      } else {
        return Result.err("not_found");
      }
    });
}

// BAD: Function returning Promise<Result> with manual promise handling
export async function processUserBad(id: number): Promise<Result<string, LoadError>> {
  try {
    const userResult = await loadUserBad1(id);
    if (!userResult.ok) {
      return userResult;
    }

    return Result.ok(userResult.value.name);
  } catch (err) {
    return Result.err("network_error");
  }
}

// OK: Using AsyncResult helpers (no warning expected)
// Note: These would require AsyncResult to be imported in real code
// For the test, we're just checking that the compiler doesn't warn on clean code
export async function loadUserGood(id: number): Promise<Result<User, LoadError>> {
  // In real code: return AsyncResult.try(async () => await fetch(...), err => "network_error");
  const response = await fetch(`/api/users/${id}`);
  return Result.ok(await response.json());
}
