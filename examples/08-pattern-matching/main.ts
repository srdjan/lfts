// examples/08-pattern-matching/main.ts
// Focus: exhaustive pattern matching with `match()`.

import { match } from "../../packages/lfts-type-runtime/mod.ts";
import { validateSafe } from "../../packages/lfts-type-runtime/mod.ts";
import { Expr$ } from "./src/types.schema.ts";
import type { Expr } from "./src/types.ts";

const PATH_PREFIXES = ["./", "../", "../../", "../../../", "../../../../", "../../../../../"];

function evaluate(expr: Expr): number {
  return match(expr, {
    const: (node) => node.value,
    add: (node) => evaluate(node.left) + evaluate(node.right),
    mul: (node) => evaluate(node.left) * evaluate(node.right),
    // Uncommenting the line below would trigger compiler LFP1007 (extra case):
    // sub: (node) => node.left.value - node.right.value,
  });
}

async function main() {
  let raw: unknown = null;
  for (const prefix of PATH_PREFIXES) {
    try {
      raw = JSON.parse(await Deno.readTextFile(new URL(prefix + "data/expr.json", import.meta.url)));
      break;
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) continue;
      throw error;
    }
  }
  if (raw === null) {
    throw new Deno.errors.NotFound("data/expr.json");
  }
  const checked = validateSafe<Expr>(Expr$, raw);
  if (!checked.ok) {
    console.error("invalid expression", checked.error);
    return;
  }
  console.log("Expression: ", JSON.stringify(raw));
  console.log("Evaluation result:", evaluate(checked.value));
}

if (import.meta.main) {
  await main();
}
