// Test LFP1020: Should warn about imperative if/else branching with Result/Option

import { Option, Result } from "../../../../../../lfts-type-runtime/mod.ts";

type User = { name: string; age: number };

// BAD: Imperative if/else branching - should trigger LFP1020
export const processUserBad = (result: Result<User, string>): string => {
  if (result.ok) {
    return `User: ${result.value.name}`;
  } else {
    return `Error: ${result.error}`;
  }
};

// BAD: Another if/else pattern
export const getAgeBad = (result: Result<User, string>): number | undefined => {
  if (result.ok) {
    const user = result.value;
    return user.age;
  } else {
    return undefined;
  }
};

// BAD: Option if/else
export const getFirstBad = (option: Option<string>): string => {
  if (option.some) {
    return option.value;
  } else {
    return "default";
  }
};

// OK: Early return pattern (allowed)
export const validateUser = (
  result: Result<User, string>,
): Result<User, string> => {
  if (!result.ok) return result;
  // Continue processing...
  return result;
};

// OK: Using combinators (no if/else)
export const processUserGood = (result: Result<User, string>): string => {
  return Result.unwrapOr(
    Result.map(result, (u) => `User: ${u.name}`),
    `Error: ${result.ok ? "" : result.error}`,
  );
};
