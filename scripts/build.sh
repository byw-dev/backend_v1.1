#!/usr/bin/env bash
# Build a deployable tarball for backend-v1.
#
# Usage:
#   ./scripts/build.sh [version-tag]
#
# Produces:  dist/backend-v1-<tag>.tar.gz
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

TAG="${1:-$(date +%Y%m%d-%H%M)}"
OUT_DIR="$REPO_ROOT/dist"
OUT_FILE="$OUT_DIR/backend-v1-${TAG}.tar.gz"
STAGING="$(mktemp -d)"
trap 'rm -rf "$STAGING"' EXIT

echo "==> Build: backend-v1-${TAG}"

# Stage files
mkdir -p "$STAGING/backend-v1"

# Source code
cp *.py "$STAGING/backend-v1/" 2>/dev/null || true

# Resource directories
for dir in frontend reference map_tiles simulated_data doc; do
  [ -d "$dir" ] && cp -r "$dir" "$STAGING/backend-v1/"
done

# Deploy assets
cp pyproject.toml "$STAGING/backend-v1/"
cp .env.example "$STAGING/backend-v1/"
cp -r deploy "$STAGING/backend-v1/"
cp -r scripts "$STAGING/backend-v1/"

# Clean up non-essential artifacts
find "$STAGING/backend-v1" -name '__pycache__' -type d -exec rm -rf {} + 2>/dev/null || true
find "$STAGING/backend-v1" -name '*.pyc' -delete
find "$STAGING/backend-v1" -name '.DS_Store' -delete
find "$STAGING/backend-v1" -name '*.bak' -delete

# Remove test scripts not needed at runtime
rm -f "$STAGING/backend-v1/smoke_test.py"
rm -rf "$STAGING/backend-v1/frontend_backup_20260430_201419" 2>/dev/null || true

# Create tarball
mkdir -p "$OUT_DIR"
tar -czf "$OUT_FILE" -C "$STAGING" backend-v1
echo "==> Created: $OUT_FILE ($(du -h "$OUT_FILE" | cut -f1))"
