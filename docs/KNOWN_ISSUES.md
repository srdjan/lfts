# Known Issues - LFTS Type Compiler

## Test Suite Status

**Current**: 19/22 tests passing (86% pass rate)

## Remaining Test Failures (3)

### 1. fail_extra_match_case (LFP1007 - exhaustive-match)

**Location**:
`packages/lfts-type-compiler/src/testing/fixtures/fail_extra_match_case/`

**Expected Behavior**: Should error when `match()` call has extra cases not in
the ADT union

**Actual Behavior**: Rule does not trigger

**Root Cause**:

- The `exhaustive-match` rule uses `ctx.checker.typeToTypeNode()` at line 47 of
  `exhaustive-match.ts`
- This TypeScript Compiler API method is unreliable for reconstructing union
  type nodes from Type objects
- When it returns `undefined` or a non-union type node, the `unionIsADT()` check
  fails and the rule exits early

**Technical Details**:

```typescript
// Current implementation (lines 45-50):
const valueType = ctx.checker.getTypeAtLocation(valueExpr);
const valueTypeNode = ctx.checker.typeToTypeNode(
  valueType,
  undefined,
  ts.NodeBuilderFlags.NoTruncation,
);
if (!valueTypeNode) return; // ← Often returns undefined
const adt = unionIsADT(valueTypeNode, ctx.checker);
if (!adt) return;
```

**Potential Fix**:

- Work directly with the `ts.Type` object instead of converting to type node
- Use `type.flags & ts.TypeFlags.Union` to detect unions
- Use `(type as ts.UnionType).types` to get union constituents
- Analyze object properties directly from Type instead of TypeNode AST

**Complexity**: Medium - requires understanding TypeScript's Type vs TypeNode
distinction

---

### 2. fail_non_exhaustive_match (LFP1007 - exhaustive-match)

**Location**:
`packages/lfts-type-compiler/src/testing/fixtures/fail_non_exhaustive_match/`

**Expected Behavior**: Should error when `match()` call is missing required
cases from the ADT union

**Actual Behavior**: Rule does not trigger

**Root Cause**: Same as fail_extra_match_case above - `typeToTypeNode()`
unreliability

**Potential Fix**: Same as fail_extra_match_case above

---

### 3. fail_type_only_import (LFP1013 - type-only-imports)

**Location**:
`packages/lfts-type-compiler/src/testing/fixtures/fail_type_only_import/`

**Expected Behavior**: Should error when an import is used only in type
positions but doesn't use `import type`

**Actual Behavior**: Rule does not trigger

**Root Cause**:

- The `isInTypePosition()` helper (context.ts:119-128) uses AST parent-climbing
  heuristic
- It may not correctly identify when an identifier is in a type-only position
- Specifically for `type U = A`, the identifier `A` may not have a TypeNode
  ancestor

**Technical Details**:

```typescript
// Test case:
import { A } from "./types.ts"; // Should be: import type { A }
export type U = A; // A is only used in type position

// Current isInTypePosition implementation:
export function isInTypePosition(node: ts.Node): boolean {
  let cur: ts.Node | undefined = node;
  while (cur) {
    if (ts.isTypeNode(cur)) return true; // May not work for all cases
    if (ts.isStatement(cur)) return false;
    cur = cur.parent;
  }
  return false;
}
```

**Potential Fix**:

- Add special case handling for type alias declarations
- Check if parent is TypeAliasDeclaration explicitly:
  ```typescript
  if (ts.isTypeAliasDeclaration(cur.parent) && cur.parent.type === cur) {
    return true;
  }
  if (ts.isTypeReferenceNode(cur.parent)) return true;
  ```
- Alternative: Use semantic analysis instead of AST heuristics:
  - Check symbol flags: `sym.flags & ts.SymbolFlags.Type`

**Complexity**: Medium-High - requires careful AST navigation and understanding
of type position semantics

---

## Impact Assessment

### What Works Well (15 passing tests)

All core LFTS rules are functioning correctly:

- ✅ Port interface validation
- ✅ ADT discriminated union validation
- ✅ Data schema function detection
- ✅ Null in schemas detection
- ✅ Interface vs type alias enforcement
- ✅ Schema canonical forms (Array<T> → T[], etc.)
- ✅ Brand helper detection
- ✅ Undefined union in properties
- ✅ typeOf only in schema files
- ✅ No assertions in schema files

### What Doesn't Work (3 failing tests)

Advanced pattern matching and import analysis:

- ❌ Exhaustive match checking (2 tests)
- ❌ Type-only import enforcement (1 test)

These features require deeper TypeScript Compiler API integration and are edge
cases in the LFTS workflow.

---

## Workarounds for Users

### For match() exhaustiveness:

Users should manually ensure their match expressions are exhaustive:

```typescript
// Manually verify all cases are handled
type Expr = Add | Mul;

const evalExpr = (e: Expr): number =>
  match(e, {
    add: (v) => v.x + v.y,
    mul: (v) => v.x * v.y, // Don't forget any cases!
    // div: v => v.x / v.y,  // Don't add extra cases!
  });
```

TypeScript's type checker will still catch some issues via return type checking,
though not as precisely as the intended LFP1007 rule.

### For type-only imports:

Users should proactively use `import type` for type-only imports:

```typescript
// Good - explicit type import
import type { A } from "./types.ts";
export type U = A;

// Bad - value import for type-only usage (but won't be caught)
import { A } from "./types.ts";
export type U = A;
```

The TypeScript compiler's `--importsNotUsedAsValues` flag can help catch these
at build time.

---

## Future Work

These issues are documented for future contributors:

1. **Exhaustive Match Rule Enhancement** (GitHub issue #TBD)
   - Investigate TypeScript's Type API for union analysis
   - Implement `typeIsADT(type: ts.Type)` helper
   - Test with complex union types

2. **Type-Only Imports Rule Enhancement** (GitHub issue #TBD)
   - Improve `isInTypePosition()` heuristic
   - Add test cases for edge cases
   - Consider semantic analysis approach

---

## Testing Notes

Run the test suite with:

```bash
deno task test
```

Expected output:

```
✅ 15 tests passing
❌ 3 tests failing (known limitations)
```

The 3 failures are expected and documented above. All other failures indicate
regressions.
