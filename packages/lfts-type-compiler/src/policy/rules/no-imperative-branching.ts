// packages/lfts-type-compiler/src/policy/rules/no-imperative-branching.ts
import ts from "npm:typescript";
import { Rule } from "../context.ts";

/**
 * LFP1020: Prevent imperative if/else branching when using Result/Option combinators.
 * Encourages declarative combinator usage (map, andThen, etc.) over manual branching.
 *
 * This rule detects patterns like:
 *   if (result.ok) { ... } else { ... }
 *   if (!result.ok) return result;
 *
 * And suggests using combinators instead:
 *   Result.map(result, fn)
 *   Result.andThen(result, fn)
 */
export const noImperativeBranchingRule: Rule = {
  meta: {
    id: "LFP1020",
    name: "no-imperative-branching",
    defaultSeverity: "warning", // Warning not error - this is a style guideline
    defaultOptions: {},
    description:
      "Prefer Result/Option combinators over imperative if/else branching for functional composition.",
  },

  analyzeUsage(node, ctx) {
    // Only analyze if statements
    if (!ts.isIfStatement(node)) return;

    const ifStmt = node as ts.IfStatement;

    // Check if the condition is checking result.ok or option.some
    const isResultCheck = isResultOrOptionCheck(ifStmt.expression, ctx);

    if (!isResultCheck) return;

    // Check if this is a simple early return pattern (allowed)
    const isEarlyReturn = ts.isReturnStatement(ifStmt.thenStatement) ||
      (ts.isBlock(ifStmt.thenStatement) &&
        ifStmt.thenStatement.statements.length === 1 &&
        ts.isReturnStatement(ifStmt.thenStatement.statements[0]));

    // Early returns are OK - they're a common pattern for error handling
    if (isEarlyReturn && !ifStmt.elseStatement) {
      return;
    }

    // If there's both then and else branches, suggest combinators
    if (ifStmt.elseStatement) {
      ctx.report(
        node,
        `LFP1020: Consider using Result/Option combinators (map, andThen, mapErr) instead of if/else branching for more declarative error handling.`,
        "warning",
      );
    }
  },
};

/**
 * Check if an expression is testing result.ok, !result.ok, option.some, or !option.some
 */
function isResultOrOptionCheck(expr: ts.Expression, ctx: any): boolean {
  // Handle: result.ok, option.some
  if (ts.isPropertyAccessExpression(expr)) {
    const propName = expr.name.text;
    if (propName === "ok" || propName === "some") {
      return true;
    }
  }

  // Handle: !result.ok, !option.some
  if (
    ts.isPrefixUnaryExpression(expr) &&
    expr.operator === ts.SyntaxKind.ExclamationToken
  ) {
    return isResultOrOptionCheck(expr.operand, ctx);
  }

  // Handle: result.ok === true, result.ok === false, etc.
  if (ts.isBinaryExpression(expr)) {
    const leftCheck = isResultOrOptionCheck(expr.left, ctx);
    const rightCheck = isResultOrOptionCheck(expr.right, ctx);
    return leftCheck || rightCheck;
  }

  return false;
}
