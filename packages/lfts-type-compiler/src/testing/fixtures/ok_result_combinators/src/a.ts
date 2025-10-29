// Test Result combinators compile successfully
import { Result } from "../../../../../../lfts-type-runtime/mod.ts";

export const divideExample = (a: number, b: number): Result<number, string> => {
  if (b === 0) return Result.err("Division by zero");
  return Result.ok(a / b);
};

export const mapExample = (
  r: Result<number, string>,
): Result<string, string> => {
  return Result.map(r, (n) => `Result: ${n}`);
};

export const andThenExample = (
  r: Result<number, string>,
): Result<number, string> => {
  return Result.andThen(r, (n) => {
    if (n > 0) return Result.ok(n);
    return Result.err("Must be positive");
  });
};
