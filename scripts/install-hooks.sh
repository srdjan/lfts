#!/bin/bash
# Install git hooks for Light-FP safeguards
#
# Run this script after cloning the repository:
#   ./scripts/install-hooks.sh

set -e

REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || echo ".")
HOOKS_DIR="$REPO_ROOT/.git/hooks"

if [ ! -d "$HOOKS_DIR" ]; then
  echo "❌ Error: Not a git repository or .git/hooks directory not found"
  exit 1
fi

echo "📦 Installing Light-FP git hooks..."

# Install pre-commit hook
if [ -f "$HOOKS_DIR/pre-commit" ] && [ ! -L "$HOOKS_DIR/pre-commit" ]; then
  echo "⚠️  Existing pre-commit hook found. Backing up to pre-commit.backup"
  mv "$HOOKS_DIR/pre-commit" "$HOOKS_DIR/pre-commit.backup"
fi

ln -sf "../../scripts/pre-commit" "$HOOKS_DIR/pre-commit"
chmod +x "$HOOKS_DIR/pre-commit"

echo "✅ Pre-commit hook installed successfully"
echo ""
echo "The hook will run automatically before each commit to check for OOP constructs."
echo "To bypass (not recommended): git commit --no-verify"
