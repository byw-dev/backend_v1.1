#!/usr/bin/env bash
# Build a deployable tarball for backend-v1.
#
# Usage:
#   ./scripts/build.sh [--offline] [version-tag]
#
#   --offline   Include pre-downloaded wheels so remote can install
#               without network access (requires uv, ~50MB extra).
#
# Produces:  dist/backend-v1-<tag>.tar.gz
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

OFFLINE=false
TAG=""
for arg in "$@"; do
  if [ "$arg" = "--offline" ]; then OFFLINE=true
  elif [ -z "$TAG" ]; then TAG="$arg"
  fi
done
TAG="${TAG:-$(date +%Y%m%d-%H%M)}"
OUT_DIR="$REPO_ROOT/dist"
OUT_FILE="$OUT_DIR/backend-v1-${TAG}.tar.gz"
STAGING="$(mktemp -d)"
trap 'rm -rf "$STAGING"' EXIT

echo "==> Build: backend-v1-${TAG} (offline=${OFFLINE})"

# ── Stage source ────────────────────────────────────────
mkdir -p "$STAGING/backend-v1"
cp *.py "$STAGING/backend-v1/" 2>/dev/null || true
for dir in frontend reference map_tiles simulated_data doc; do
  [ -d "$dir" ] && cp -r "$dir" "$STAGING/backend-v1/"
done
cp pyproject.toml uv.lock "$STAGING/backend-v1/"
cp .env.example "$STAGING/backend-v1/"
cp -r deploy "$STAGING/backend-v1/"
cp -r scripts "$STAGING/backend-v1/"

# ── Offline mode: bundle wheels ─────────────────────────
if $OFFLINE; then
  echo "==> Exporting dependencies..."
  mkdir -p "$STAGING/backend-v1/vendor"
  uv export --frozen --no-dev --no-emit-project \
    --output-file "$STAGING/backend-v1/vendor/requirements.txt"

  echo "==> Downloading wheels..."
  pip download \
    -r "$STAGING/backend-v1/vendor/requirements.txt" \
    -d "$STAGING/backend-v1/vendor/wheels/" \
    --only-binary :all: \
    --no-deps 2>&1 | tail -5

  COUNT=$(find "$STAGING/backend-v1/vendor/wheels" -name '*.whl' | wc -l)
  SIZE=$(du -sh "$STAGING/backend-v1/vendor/wheels" | cut -f1)
  echo "==> Bundled ${COUNT} wheels (${SIZE})"
fi

# ── Clean non-essentials ────────────────────────────────
find "$STAGING/backend-v1" -name '__pycache__' -type d -exec rm -rf {} + 2>/dev/null || true
find "$STAGING/backend-v1" -name '*.pyc' -delete
find "$STAGING/backend-v1" -name '.DS_Store' -delete
find "$STAGING/backend-v1" -name '*.bak' -delete
rm -f "$STAGING/backend-v1/smoke_test.py"
rm -rf "$STAGING/backend-v1/frontend_backup_20260430_201419" 2>/dev/null || true

# ── Create tarball ──────────────────────────────────────
mkdir -p "$OUT_DIR"
tar -czf "$OUT_FILE" -C "$STAGING" backend-v1
echo "==> Created: $OUT_FILE ($(du -h "$OUT_FILE" | cut -f1))"
