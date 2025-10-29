# Contributing to Light-FP TypeScript Compiler

Thank you for your interest in contributing to the Light-FP compiler project!

## 🚫 **CRITICAL: No OOP Constructs Allowed**

This codebase strictly follows **Light-FP principles** and **does not allow any OOP constructs**.

### Banned Constructs

The following are **strictly prohibited** in all source code (except test fixtures):

- ❌ `class` declarations
- ❌ `extends` keyword (inheritance)
- ❌ `implements` keyword (class-based interfaces)
- ❌ `this` keyword
- ❌ `super` keyword
- ❌ `constructor` methods
- ❌ `new` with custom classes (built-in APIs like `Map`, `Error` are OK)

### Why?

Light-FP enforces functional programming discipline:
- **Pure functions** over stateful objects
- **Data transformations** over mutation
- **Type aliases** over classes
- **Ports (interface-based DI)** over class hierarchies

### Safeguards in Place

Multiple layers prevent OOP introduction:

1. **Deno Lint** - Run `deno task lint` before committing
2. **Pre-commit Hook** - Automatically checks on `git commit`
3. **CI Pipeline** - GitHub Actions runs OOP checks on all PRs
4. **Custom Script** - `scripts/check-no-oop.ts` scans the codebase

## Getting Started

### Prerequisites

- [Deno](https://deno.land/) v2.x or later
- Git

### Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/your-org/lfp-compiler.git
   cd lfp-compiler
   ```

2. Install git hooks:
   ```bash
   ./scripts/install-hooks.sh
   ```

3. Run tests to verify setup:
   ```bash
   deno task test
   ```

### Development Workflow

1. **Create a branch** for your feature/fix:
   ```bash
   git checkout -b feature/my-feature
   ```

2. **Make changes** following Light-FP principles:
   - Use pure functions
   - Use `type` aliases for data structures
   - Use `interface` for ports (dependency injection)
   - No mutations - use spread operators or immutable operations

3. **Run lint checks**:
   ```bash
   deno task lint
   ```

4. **Run tests**:
   ```bash
   deno task test
   deno task test:app
   ```

5. **Build example**:
   ```bash
   deno task build
   deno task start
   ```

6. **Commit your changes**:
   ```bash
   git add .
   git commit -m "feat: add new feature"
   # Pre-commit hook runs automatically
   ```

7. **Push and create PR**:
   ```bash
   git push origin feature/my-feature
   # Create PR on GitHub
   ```

## Code Style

### Good Light-FP Style ✅

```typescript
// ✅ Pure function
export function calculateTotal(items: Item[]): number {
  return items.reduce((sum, item) => sum + item.price, 0);
}

// ✅ Type alias for data
export type User = {
  readonly id: string;
  readonly name: string;
  readonly email: string;
};

// ✅ Interface for ports (DI)
export interface StoragePort {
  save(user: User): Promise<void>;
  load(id: string): Promise<User | undefined>;
}

// ✅ Implementation function (not class)
export function createFileStorage(basePath: string): StoragePort {
  return {
    async save(user: User): Promise<void> {
      await Deno.writeTextFile(
        `${basePath}/${user.id}.json`,
        JSON.stringify(user)
      );
    },
    async load(id: string): Promise<User | undefined> {
      try {
        const data = await Deno.readTextFile(`${basePath}/${id}.json`);
        return JSON.parse(data);
      } catch {
        return undefined;
      }
    },
  };
}

// ✅ ADT (Algebraic Data Type) with discriminated union
export type Result<T, E> =
  | { readonly type: "ok"; readonly value: T }
  | { readonly type: "err"; readonly error: E };
```

### Bad OOP Style ❌

```typescript
// ❌ Class with state
class UserService {
  private users: Map<string, User>;

  constructor() {
    this.users = new Map();
  }

  save(user: User): void {
    this.users.set(user.id, user);
  }

  load(id: string): User | undefined {
    return this.users.get(id);
  }
}

// ❌ Inheritance
class AdminUser extends User {
  constructor(public permissions: string[]) {
    super();
  }
}

// ❌ Class implementing interface
class FileStorage implements StoragePort {
  constructor(private basePath: string) {}

  async save(user: User): Promise<void> {
    // Implementation using this.basePath
  }
}
```

## Project Structure

```
lfp-compiler/
├── packages/
│   ├── lfp-type-spec/        # Bytecode opcodes
│   ├── lfp-type-compiler/    # Compiler (gate, policy, transform)
│   └── lfp-type-runtime/     # Runtime validator
├── deno_example/             # Minimal example
├── demo_cli/                 # Full-featured CLI demo
├── scripts/                  # Build and validation scripts
│   ├── check-no-oop.ts      # OOP detector
│   ├── pre-commit           # Git pre-commit hook
│   └── install-hooks.sh     # Hook installer
└── docs/                     # Documentation
```

## Adding New Features

### Adding a Policy Rule

See [CLAUDE.md](CLAUDE.md#adding-a-new-policy-rule) for detailed instructions.

### Adding a Bytecode Operation

See [CLAUDE.md](CLAUDE.md#adding-a-new-bytecode-operation) for detailed instructions.

## Testing

### Golden Tests

Compiler tests use golden test pattern:

```bash
deno task test
```

Test fixtures in `packages/lfp-type-compiler/src/testing/fixtures/`:
- `ok_*` - Should compile successfully
- `fail_*` - Should produce specific errors

### Demo Application Tests

```bash
deno task test:app      # Basic tests
deno task test:app:all  # All tests including negative cases
```

## Common Issues

### "OOP constructs detected" error

If you see this error during commit or CI:

1. Review the reported violations
2. Refactor to use Light-FP patterns:
   - Replace classes with functions returning interfaces
   - Replace `this` with closure-captured state
   - Use pure functions instead of methods

3. Re-run lint: `deno task lint`

### Bypassing Checks (Not Recommended)

Only bypass checks for test fixtures that intentionally contain OOP:

```bash
git commit --no-verify  # Skip pre-commit hook
```

## Documentation

- [CLAUDE.md](CLAUDE.md) - Developer guide for Claude Code
- [LANG-SPEC.md](docs/LANG-SPEC.md) - Language specification
- [BYTECODE_REFERENCE.md](docs/BYTECODE_REFERENCE.md) - Bytecode format
- [KNOWN_ISSUES.md](docs/KNOWN_ISSUES.md) - Current limitations

## Questions?

- Open an issue for bugs or feature requests
- Check existing documentation in `docs/`
- Review example code in `deno_example/` and `demo_cli/`

## License

See [LICENSE](LICENSE) file for details.

---

**Remember: Light-FP = No OOP. Pure functions all the way! 🚀**
