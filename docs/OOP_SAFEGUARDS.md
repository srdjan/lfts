# OOP Safeguards

This document describes the multiple layers of protection against introducing
OOP constructs into the Light-FP codebase.

## Overview

The Light-FP compiler project strictly enforces functional programming
principles and **prohibits all OOP constructs**. To prevent accidental
introduction of OOP patterns, we have implemented multiple automated safeguards.

## Prohibited Constructs

The following are banned in all source code (except test fixtures):

- ❌ `class` declarations
- ❌ `extends` keyword (class inheritance)
- ❌ `implements` keyword (class-based interface implementation)
- ❌ `this` keyword
- ❌ `super` keyword
- ❌ `constructor` methods
- ❌ `new` with custom classes (built-in APIs like `Map`, `Error`, `Set` are OK)

## Safeguard Layers

### 1. Custom OOP Checker Script

**File:** [scripts/check-no-oop.ts](../scripts/check-no-oop.ts)

A TypeScript script that scans the codebase for OOP patterns using regex
detection.

**Features:**

- Scans all TypeScript files in key directories
- Detects all OOP keywords and patterns
- Smart filtering to avoid false positives (e.g., generic constraints like
  `T extends readonly`)
- Context-aware checks (allows keywords in string literals and compiler
  metadata)
- Detailed error reporting with file paths, line numbers, and descriptions

**Usage:**

```bash
deno run -A scripts/check-no-oop.ts
```

**Exit codes:**

- `0` - No violations found
- `1` - OOP constructs detected

**Directories checked:**

- `packages/`
- `deno_example/src/`
- `demo_cli/src/`
- `todo_api/`
- `scripts/`

**Excluded:**

- `packages/lfts-type-compiler/src/testing/fixtures/` - Test cases
- `*.test.ts` - Test files
- `dist/` - Build output
- `node_modules/` - Dependencies

### 2. Deno Lint Integration

**File:** [deno.json](../deno.json)

The OOP checker is integrated into the standard lint task:

```bash
deno task lint        # Run Deno lint + OOP checks
deno task lint:fix    # Auto-fix lint issues (not OOP violations)
```

**Configuration:**

```json
{
  "tasks": {
    "lint": "deno lint && deno run -A scripts/check-no-oop.ts"
  },
  "lint": {
    "exclude": [
      "packages/lfts-type-compiler/src/testing/fixtures/",
      "dist/",
      "node_modules/"
    ]
  }
}
```

### 3. Git Pre-commit Hook

**Files:**

- [scripts/pre-commit](../scripts/pre-commit) - The hook script
- [scripts/install-hooks.sh](../scripts/install-hooks.sh) - Installation script

**Installation:**

```bash
./scripts/install-hooks.sh
```

**What it does:**

- Runs automatically before every `git commit`
- Executes the OOP checker on all staged files
- Blocks the commit if violations are found
- Can be bypassed with `git commit --no-verify` (not recommended)

**Benefits:**

- Catches OOP violations before they enter the repository
- Immediate feedback to developers
- Zero manual intervention required

### 4. CI/CD Pipeline (GitHub Actions)

**File:** [.github/workflows/ci.yml](../.github/workflows/ci.yml)

**Jobs:**

#### a) Lint & OOP Safeguards

```yaml
- name: Run Deno Lint
  run: deno lint

- name: Check for OOP constructs
  run: deno run -A scripts/check-no-oop.ts
```

#### b) Light-FP Compliance Check

```yaml
- name: Verify no OOP constructs in packages
  run: grep -r '\bclass\s' packages/ --exclude-dir=fixtures || exit 0

- name: Verify no OOP constructs in examples
  run: grep -r '\bclass\s' deno_example/ demo_cli/ || exit 0

- name: Run comprehensive OOP check
  run: deno run -A scripts/check-no-oop.ts
```

**Triggers:**

- All pushes to `main`
- All pull requests targeting `main`

**Benefits:**

- Prevents merging PRs with OOP violations
- Multiple redundant checks for safety
- Public CI status visible on PRs

### 5. Documentation

**Files:**

- [README.md](../README.md) - Quick reference and safeguard overview
- [CONTRIBUTING.md](../CONTRIBUTING.md) - Detailed contributor guidelines
- [CLAUDE.md](../CLAUDE.md) - Instructions for Claude Code
- This document - Comprehensive safeguard documentation

## How Violations Are Detected

### Pattern Matching

The OOP checker uses regex patterns to detect violations:

```typescript
// Example patterns
{
  name: "class-declaration",
  pattern: /\bclass\s+\w+/g,
  description: "Class declarations are not allowed in Light-FP"
}

{
  name: "extends-keyword",
  pattern: /\bclass\s+\w+\s+extends\s+\w+/g,
  description: "Class inheritance (extends) is not allowed in Light-FP"
}

{
  name: "this-keyword",
  pattern: /\bthis\./g,
  description: "Using 'this' keyword is not allowed in Light-FP"
}
```

### Allowed Contexts

The checker intelligently allows keywords in certain contexts:

1. **String literals** - `"class"`, `'extends'`, etc.
2. **TypeScript Compiler API** - `SyntaxKind.ClassDeclaration`
3. **Generic constraints** - `T extends readonly` (not class inheritance)
4. **Built-in constructors** - `new Map()`, `new Error()`, etc.

### Example Violation Report

```
❌ Found OOP constructs in Light-FP codebase:

packages/example.ts:
  Line 3:1 - class-declaration: "class BadClass"
    Class declarations are not allowed in Light-FP
  Line 4:3 - constructor-method: "constructor("
    Constructor methods are not allowed in Light-FP
  Line 5:5 - this-keyword: "this."
    Using 'this' keyword is not allowed in Light-FP

❌ Total violations: 3

Light-FP does not allow OOP constructs.
Please refactor to use functional patterns instead.
```

## Testing the Safeguards

### Manual Testing

1. **Run the OOP checker:**
   ```bash
   deno task lint
   ```

2. **Create a test violation:**
   ```bash
   echo "class Test {}" > test.ts
   deno run -A scripts/check-no-oop.ts  # Should fail
   rm test.ts
   ```

3. **Test pre-commit hook:**
   ```bash
   ./scripts/install-hooks.sh
   # Try to commit a file with OOP constructs
   ```

### Automated Testing

The safeguards are tested in CI on every push and PR. See
[.github/workflows/ci.yml](../.github/workflows/ci.yml).

## Bypassing Safeguards (Not Recommended)

In rare cases (e.g., adding test fixtures), you may need to bypass checks:

### Git Commit Hook

```bash
git commit --no-verify -m "Add test fixture with intentional OOP"
```

### CI Checks

Cannot be bypassed - must be resolved to merge.

## Maintenance

### Adding New OOP Patterns

To detect new OOP patterns:

1. Edit [scripts/check-no-oop.ts](../scripts/check-no-oop.ts)
2. Add pattern to `OOP_PATTERNS` array:
   ```typescript
   {
     name: "pattern-name",
     pattern: /your-regex/g,
     description: "Description of violation",
     allowedContexts: [/optional-exceptions/]
   }
   ```
3. Test the pattern
4. Commit changes

### Updating Excluded Directories

Edit `EXCLUDE_PATTERNS` in
[scripts/check-no-oop.ts](../scripts/check-no-oop.ts):

```typescript
const EXCLUDE_PATTERNS = [
  /\/testing\/fixtures\//,
  /\.test\.ts$/,
  /your-new-exclusion/,
];
```

### Updating Checked Directories

Edit `DIRECTORIES_TO_CHECK` in
[scripts/check-no-oop.ts](../scripts/check-no-oop.ts):

```typescript
const DIRECTORIES_TO_CHECK = [
  "packages",
  "your-new-directory",
];
```

## Developer Workflow

### Initial Setup

```bash
# Clone repository
git clone <repo-url>
cd lfts-compiler

# Install git hooks
./scripts/install-hooks.sh
```

### Before Every Commit

```bash
# Run lint to catch issues early
deno task lint

# If violations found, refactor to Light-FP patterns
# See CONTRIBUTING.md for examples
```

### When Creating PRs

- CI automatically runs all checks
- PRs cannot be merged with violations
- Fix violations in your branch before requesting review

## Benefits

1. **Prevents OOP Introduction** - Multiple automated layers catch violations
2. **Fast Feedback** - Developers learn immediately when they violate Light-FP
3. **No Manual Reviews Needed** - Automation handles enforcement
4. **Educational** - Error messages guide developers to correct patterns
5. **Consistent Codebase** - Ensures entire project follows Light-FP principles

## Related Documentation

- [CONTRIBUTING.md](../CONTRIBUTING.md) - Light-FP style guide and examples
- [LANG-SPEC.md](LANG-SPEC.md) - Full Light-FP language specification
- [CLAUDE.md](../CLAUDE.md) - AI assistant guidelines

---

**Remember: Light-FP = No OOP. Pure functions all the way!**
