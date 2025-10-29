// Test Option combinators compile successfully
import { Option } from "../../../../../../lfts-type-runtime/mod.ts";

export const getFirst = (arr: readonly number[]): Option<number> => {
  return Option.first(arr);
};

export const mapExample = (opt: Option<number>): Option<string> => {
  return Option.map(opt, (n) => `Number: ${n}`);
};

export const zipExample = (
  a: Option<number>,
  b: Option<string>,
): Option<readonly [number, string]> => {
  return Option.zip(a, b);
};
