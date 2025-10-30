// packages/lfts-type-compiler/src/policy/rules/suggest-async-result.ts
import ts from "npm:typescript";
import { Rule } from "../context.ts";

/**
 * LFP1030: Suggest AsyncResult helpers for Promise<Result<T, E>> patterns.
 *
 * This rule detects manual Promise<Result> composition and suggests using
 * AsyncResult helpers for cleaner, more composable code.
 *
 * Patterns detected:
 *   - Functions returning Promise<Result<T, E>>
 *   - Manual .then() chaining on Promise<Result>
 *   - try/catch wrapping async Result operations
 *
 * Suggests:
 *   - AsyncResult.try() for exception handling
 *   - AsyncResult.andThen() for chaining
 *   - AsyncResult.map() for transformations
 *   - AsyncResult.all() for parallel operations
 */
export const suggestAsyncResultRule: Rule = {
  meta: {
    id: "LFP1030",
    name: "suggest-async-result",
    defaultSeverity: "warning",
    defaultOptions: {},
    description:
      "Suggest AsyncResult helpers for composing Promise<Result<T, E>> operations.",
  },

  analyzeUsage(node, ctx) {
    // Check for try/catch blocks that wrap async operations returning Result
    if (ts.isTryStatement(node)) {
      analyzeTryCatch(node, ctx);
      return;
    }

    // Check for manual .then() chaining on Promise<Result>
    if (ts.isCallExpression(node)) {
      analyzePromiseChaining(node, ctx);
      return;
    }

    // Check for functions returning Promise<Result<T, E>>
    if (
      ts.isFunctionDeclaration(node) ||
      ts.isMethodDeclaration(node) ||
      ts.isArrowFunction(node) ||
      ts.isFunctionExpression(node)
    ) {
      analyzeFunctionSignature(node as ts.FunctionLikeDeclaration, ctx);
      return;
    }
  },
};

/**
 * Analyze try/catch blocks for async Result operations
 */
function analyzeTryCatch(node: ts.TryStatement, ctx: any): void {
  // Check if try block contains await expressions
  let hasAwait = false;
  function visitTryBlock(n: ts.Node): void {
    if (ts.isAwaitExpression(n)) {
      hasAwait = true;
    }
    ts.forEachChild(n, visitTryBlock);
  }
  visitTryBlock(node.tryBlock);

  if (!hasAwait) return;

  // Check if catch block creates a Result.err
  if (node.catchClause) {
    const catchBlock = node.catchClause.block;
    let createsResultErr = false;

    function visitCatchBlock(n: ts.Node): void {
      // Look for Result.err() calls
      if (
        ts.isCallExpression(n) &&
        ts.isPropertyAccessExpression(n.expression)
      ) {
        const expr = n.expression;
        if (
          ts.isIdentifier(expr.expression) &&
          expr.expression.text === "Result" &&
          expr.name.text === "err"
        ) {
          createsResultErr = true;
        }
      }
      ts.forEachChild(n, visitCatchBlock);
    }
    visitCatchBlock(catchBlock);

    if (createsResultErr) {
      ctx.report(
        node,
        `LFP1030: Consider using AsyncResult.try() instead of try/catch for async Result operations. Example: AsyncResult.try(async () => await operation(), (err) => errorValue)`,
        "warning",
      );
    }
  }
}

/**
 * Analyze .then() chaining on promises
 */
function analyzePromiseChaining(node: ts.CallExpression, ctx: any): void {
  // Check if this is a .then() call
  if (!ts.isPropertyAccessExpression(node.expression)) return;

  const propAccess = node.expression;
  if (!ts.isIdentifier(propAccess.name)) return;
  if (propAccess.name.text !== "then") return;

  // Check if the callback in .then() handles Result types
  if (node.arguments.length === 0) return;

  const callback = node.arguments[0];
  if (
    !ts.isArrowFunction(callback) &&
    !ts.isFunctionExpression(callback)
  ) {
    return;
  }

  // Look for Result.ok checks inside the callback
  let checksResultOk = false;
  function visitCallback(n: ts.Node): void {
    if (
      ts.isPropertyAccessExpression(n) &&
      ts.isIdentifier(n.name) &&
      n.name.text === "ok"
    ) {
      checksResultOk = true;
    }
    ts.forEachChild(n, visitCallback);
  }
  visitCallback(callback);

  if (checksResultOk) {
    ctx.report(
      node,
      `LFP1030: Consider using AsyncResult.andThen() or AsyncResult.map() instead of manual .then() chaining for Promise<Result> operations.`,
      "warning",
    );
  }
}

/**
 * Analyze function signatures returning Promise<Result<T, E>>
 * Provide helpful hints about AsyncResult helpers in function documentation
 */
function analyzeFunctionSignature(
  node: ts.FunctionLikeDeclaration,
  ctx: any,
): void {
  if (!node.type) return;

  // Check if return type is Promise<Result<T, E>>
  const isPromiseResult = isPromiseOfResult(node.type, ctx);
  if (!isPromiseResult) return;

  // This is informational - we don't warn on every Promise<Result> function
  // Only warn if there's manual promise handling inside that could use helpers

  // Check if function body manually handles promises without AsyncResult
  if (!node.body) return;

  let hasManualPromiseHandling = false;

  function visitBody(n: ts.Node): void {
    // Look for .then() calls
    if (
      ts.isCallExpression(n) &&
      ts.isPropertyAccessExpression(n.expression) &&
      ts.isIdentifier(n.expression.name) &&
      n.expression.name.text === "then"
    ) {
      hasManualPromiseHandling = true;
    }

    // Look for try/catch with await
    if (ts.isTryStatement(n)) {
      let hasTryAwait = false;
      function checkAwait(inner: ts.Node): void {
        if (ts.isAwaitExpression(inner)) hasTryAwait = true;
        ts.forEachChild(inner, checkAwait);
      }
      checkAwait(n.tryBlock);
      if (hasTryAwait) hasManualPromiseHandling = true;
    }

    ts.forEachChild(n, visitBody);
  }
  visitBody(node.body);

  if (hasManualPromiseHandling) {
    const funcName = node.name
      ? (ts.isIdentifier(node.name) ? node.name.text : "<function>")
      : "<anonymous>";

    ctx.report(
      node.name || node,
      `LFP1030: Function '${funcName}' returns Promise<Result> and uses manual promise handling. Consider using AsyncResult helpers (try, andThen, map, all) for cleaner composition.`,
      "warning",
    );
  }
}

/**
 * Check if a type node represents Promise<Result<T, E>>
 */
function isPromiseOfResult(typeNode: ts.TypeNode, ctx: any): boolean {
  // Check for TypeReference with Promise
  if (!ts.isTypeReferenceNode(typeNode)) return false;

  const typeName = typeNode.typeName;
  if (!ts.isIdentifier(typeName)) return false;
  if (typeName.text !== "Promise") return false;

  // Check type arguments
  if (!typeNode.typeArguments || typeNode.typeArguments.length !== 1) {
    return false;
  }

  const resultType = typeNode.typeArguments[0];

  // Check if inner type is Result<T, E>
  if (!ts.isTypeReferenceNode(resultType)) return false;
  const resultTypeName = resultType.typeName;
  if (!ts.isIdentifier(resultTypeName)) return false;

  return resultTypeName.text === "Result";
}
