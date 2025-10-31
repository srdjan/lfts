# LFTS Examples

Welcome to the LFTS examples! These progressive examples will teach you how to use the Light Functional TypeScript compiler and runtime effectively.

## Learning Path

Follow these examples in order for the best learning experience:

```
Foundation (Start Here)
├── 01-hello-world          ⏱️  15 min  →  Your first LFTS program
├── 02-basic-validation     ⏱️  30 min  →  Core validation patterns
└── 03-adts-and-matching    ⏱️  30 min  →  Algebraic Data Types

Functional Patterns
├── 04-result-option        ⏱️  45 min  →  Error handling without exceptions
├── 05-async-effects        ⏱️  45 min  →  AsyncResult and Promise<Result>
└── 07-refinements          ⏱️  30 min  →  Type refinements (Email, Min, Max)

Architecture & Real Apps
├── 06-ports-di             ⏱️  60 min  →  Dependency injection with ports
├── cli/                    ⏱️  90 min  →  Full CLI task manager
└── web/                    ⏱️  90 min  →  Full REST API application
```

## Quick Start

### Absolute Beginner?
Start with **01-hello-world**:
```bash
cd examples/01-hello-world
deno task build
deno task start
```

### Already familiar with LFTS basics?
Jump to a specific example based on what you want to learn:

- **Validation patterns** → `02-basic-validation`
- **ADTs and matching** → `03-adts-and-matching`
- **Error handling** → `04-result-option`
- **Async operations** → `05-async-effects`
- **Architecture** → `06-ports-di`, `cli/`, `web/`

## Example Descriptions

### Foundation

#### 01-hello-world
Your first LFTS program. Learn the compilation workflow, schema-root pattern, and basic validation.

**You'll learn:**
- How LFTS compilation works (`build` → `start`)
- Schema-root rewriter pattern
- Basic validation with `validate()`
- Reading error messages

#### 02-basic-validation
Master LFTS validation with multiple types, optional fields, brand types, and error handling.

**You'll learn:**
- Canonical syntax enforcement
- Optional fields (`?`)
- Readonly arrays
- Brand types for nominal typing
- `validateSafe()` for Result-based errors
- Error path navigation

#### 03-adts-and-matching
Learn Algebraic Data Types and exhaustive pattern matching.

**You'll learn:**
- Discriminated unions with `type` discriminant
- Exhaustive matching with `match()`
- Compiler enforcement of match completeness
- ADT modeling patterns

### Functional Patterns

#### 04-result-option
Functional error handling without exceptions using Result and Option types.

**You'll learn:**
- `Result<T, E>` for fallible operations
- `Option<T>` for nullable values
- Combinators: `map()`, `andThen()`, `mapErr()`
- Railway-oriented programming

#### 05-async-effects
Handle async operations with Promise<Result<T, E>> and AsyncResult helpers.

**You'll learn:**
- `AsyncResult.try()` for exception wrapping
- `AsyncResult.andThen()` for chaining
- `AsyncResult.all()` for parallel operations
- Error transformation in async code

#### 07-refinements
Runtime validation with type refinements like Email, Min, Max, and composable constraints.

**You'll learn:**
- Prebuilt type annotations (v0.4.0)
- String refinements (`Email`, `Url`, `Pattern`)
- Numeric refinements (`Min`, `Max`, `Range`)
- Composing refinements

### Architecture & Real Apps

#### 06-ports-di
Dependency injection using the ports/capabilities pattern for testable, maintainable code.

**You'll learn:**
- Port interfaces for dependency abstraction
- Adapter pattern implementations
- Dependency injection techniques
- Testing with mock implementations

#### cli/ - Task Manager CLI
Complete CLI application demonstrating all LFTS features in a hexagonal architecture.

**You'll learn:**
- Full application architecture
- Command pattern with ADTs
- Hexagonal/ports-and-adapters design
- Testing strategy with DI

#### web/ - REST API
Production-ready REST API with validation, effects, and proper error handling.

**You'll learn:**
- API validation at boundaries
- AsyncResult in HTTP handlers
- Error responses as ADTs
- Database abstraction with ports
- API testing

## Prerequisites

- **Deno** 1.40+ installed ([installation guide](https://deno.land/manual/getting_started/installation))
- Basic TypeScript knowledge
- Familiarity with functional programming concepts (helpful but not required)

## Common Commands

Every example supports these tasks:

```bash
# Build the example (compile TypeScript → JavaScript with bytecode)
deno task build

# Run the compiled example
deno task start

# Run tests (where applicable)
deno task test

# Clean build artifacts
deno task clean
```

## Getting Help

- **Documentation**: See [docs/](../docs/) for detailed guides
- **Tutorial**: [docs/TUTORIAL.md](../docs/TUTORIAL.md) provides in-depth explanations
- **Language Spec**: [LANG-SPEC.md](../LANG-SPEC.md) for complete syntax reference
- **Issues**: [GitHub Issues](https://github.com/anthropics/lfts/issues) for questions and bugs

## Philosophy

These examples follow LFTS's core philosophy:

> "Favor composable primitives over layered frameworks"

Each example demonstrates:
- ✅ Functional patterns over OOP
- ✅ Explicit over implicit
- ✅ Composition over inheritance
- ✅ Types for correctness, validation for safety

## Next Steps

1. **Start with 01-hello-world** if you're new
2. **Work through Foundation examples** (01-03)
3. **Learn functional patterns** (04, 05, 07)
4. **Study architecture** (06, cli, web)
5. **Build your own project!**

Happy learning! 🚀
