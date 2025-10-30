import ts from "npm:typescript";
import { Rule } from "../context.ts";

export const noBitwiseExceptPipelineRule: Rule = {
  meta: {
    id: "LFP1030",
    name: "no-bitwise-except-pipeline",
    defaultSeverity: "error",
    defaultOptions: {},
    description:
      "Disallow bitwise `|` unless used with the runtime pipeline helpers (`pipe` / `asPipe`).",
  },

  analyzeUsage(node, ctx) {
    if (!ts.isBinaryExpression(node)) return;
    if (node.operatorToken.kind !== ts.SyntaxKind.BarToken) return;

    if (isPipelineExpression(node, ctx)) {
      return;
    }

    ctx.report(
      node,
      "LFP1030: Bitwise `|` is reserved for the LFTS pipeline shim. Use logical `||`/ `??` or ensure the left operand is a PipelineToken produced by `pipe()`.",
    );
  },
};

function isPipelineExpression(
  node: ts.BinaryExpression,
  ctx: RuleContext,
): boolean {
  return isPipelineLeft(node.left, ctx) && isPipelineStage(node.right, ctx);
}

type RuleContext = Parameters<NonNullable<Rule["analyzeUsage"]>>[1];

function isPipelineLeft(expr: ts.Expression, ctx: RuleContext): boolean {
  const unwrapped = unwrap(expr);

  if (
    ts.isBinaryExpression(unwrapped) &&
    unwrapped.operatorToken.kind === ts.SyntaxKind.BarToken
  ) {
    return isPipelineLeft(unwrapped.left, ctx) &&
      isPipelineStage(unwrapped.right, ctx);
  }

  if (looksLikePipeCall(unwrapped)) return true;
  if (isPipelineTokenIdentifier(unwrapped, ctx)) return true;

  return hasNamedType(unwrapped, ctx, ["PipelineToken"]);
}

function isPipelineStage(expr: ts.Expression, ctx: RuleContext): boolean {
  const unwrapped = unwrap(expr);

  if (
    ts.isBinaryExpression(unwrapped) &&
    unwrapped.operatorToken.kind === ts.SyntaxKind.BarToken
  ) {
    return isPipelineLeft(unwrapped.left, ctx) &&
      isPipelineStage(unwrapped.right, ctx);
  }

  if (hasNamedType(unwrapped, ctx, ["PipeStage", "PipeStageMarker"])) {
    return true;
  }

  if (ts.isCallExpression(unwrapped)) {
    if (isPipelineStageReference(unwrapped.expression, ctx)) return true;
    if (hasNamedType(unwrapped, ctx, ["PipeStage", "PipeStageMarker"])) {
      return true;
    }
    return hasNamedType(unwrapped.expression, ctx, [
      "PipeStage",
      "PipeStageMarker",
    ]);
  }

  if (isPipelineStageReference(unwrapped, ctx)) return true;

  return false;
}

function unwrap(expr: ts.Expression): ts.Expression {
  let node: ts.Expression = expr;
  while (true) {
    if (ts.isParenthesizedExpression(node)) {
      node = node.expression;
      continue;
    }
    if (ts.isAsExpression(node)) {
      node = node.expression;
      continue;
    }
    if (ts.isTypeAssertionExpression(node)) {
      node = node.expression;
      continue;
    }
    if (ts.isNonNullExpression(node)) {
      node = node.expression;
      continue;
    }
    break;
  }
  return node;
}

function looksLikePipeCall(expr: ts.Expression): boolean {
  if (!ts.isCallExpression(expr)) return false;
  const callee = unwrap(expr.expression);
  if (ts.isIdentifier(callee) && callee.text === "pipe") return true;
  if (
    ts.isPropertyAccessExpression(callee) &&
    callee.name.text === "pipe"
  ) {
    return true;
  }
  return false;
}

function isPipelineTokenIdentifier(
  expr: ts.Expression,
  ctx: RuleContext,
): boolean {
  if (!ts.isIdentifier(expr)) return false;
  const sym = ctx.checker.getSymbolAtLocation(expr);
  if (!sym || !sym.valueDeclaration) return false;
  const decl = sym.valueDeclaration;
  if (ts.isVariableDeclaration(decl) && decl.initializer) {
    const initExpr = unwrap(decl.initializer as ts.Expression);
    if (looksLikePipeCall(initExpr)) return true;
    if (isPipelineLeft(initExpr, ctx)) return true;
  }
  return hasNamedType(expr, ctx, ["PipelineToken"]);
}

function isPipelineStageReference(
  expr: ts.Expression,
  ctx: RuleContext,
): boolean {
  if (ts.isIdentifier(expr)) {
    const sym = ctx.checker.getSymbolAtLocation(expr);
    if (sym && sym.valueDeclaration) {
      const decl = sym.valueDeclaration;
      if (ts.isVariableDeclaration(decl) && decl.initializer) {
        const initExpr = unwrap(decl.initializer as ts.Expression);
        if (isAsPipeCall(initExpr)) return true;
        if (isPipelineStage(initExpr, ctx)) return true;
      }
    }
  }

  if (isAsPipeCall(expr)) return true;

  return false;
}

function isAsPipeCall(expr: ts.Expression): boolean {
  if (!ts.isCallExpression(expr)) return false;
  const callee = unwrap(expr.expression);
  if (ts.isIdentifier(callee) && callee.text === "asPipe") return true;
  if (
    ts.isPropertyAccessExpression(callee) &&
    callee.name.text === "asPipe"
  ) {
    return true;
  }
  return false;
}

function hasNamedType(
  node: ts.Expression,
  ctx: RuleContext,
  names: readonly string[],
): boolean {
  const type = ctx.checker.getTypeAtLocation(node);
  return type ? typeHasName(type, ctx, names, new Set()) : false;
}

function typeHasName(
  type: ts.Type,
  ctx: RuleContext,
  names: readonly string[],
  seen: Set<ts.Type>,
): boolean {
  if (seen.has(type)) return false;
  seen.add(type);

  if (type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) {
    return false;
  }

  const symbol = type.getSymbol();
  if (symbol && names.includes(symbol.getName())) {
    return true;
  }

  const alias = (type as ts.Type & { aliasSymbol?: ts.Symbol }).aliasSymbol;
  if (alias && names.includes(alias.getName())) {
    return true;
  }

  if (isTypeReference(type) && type.target && type.target !== type) {
    if (typeHasName(type.target, ctx, names, seen)) return true;
  }

  if (isInterfaceType(type)) {
    const bases = type.getBaseTypes?.() ?? [];
    for (const base of bases) {
      if (typeHasName(base, ctx, names, seen)) return true;
    }
  }

  if (type.isUnion()) {
    return type.types.some((t) => typeHasName(t, ctx, names, seen));
  }

  if (type.isIntersection()) {
    return type.types.some((t) => typeHasName(t, ctx, names, seen));
  }

  const text = ctx.checker.typeToString(type);
  if (names.some((name) => text === name || text.startsWith(`${name}<`))) {
    return true;
  }

  return false;
}

function isTypeReference(type: ts.Type): type is ts.TypeReference {
  return "target" in type;
}

function isInterfaceType(type: ts.Type): type is ts.InterfaceType {
  return (type.flags & ts.TypeFlags.Object) !== 0 &&
    ((type as ts.ObjectType).objectFlags & ts.ObjectFlags.ClassOrInterface) !==
      0;
}
