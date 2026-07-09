#!/usr/bin/env bash
# Run all integration tests
# Usage: SUPABASE_SERVICE_ROLE_KEY=xxx bash tests/run-all.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NODE="${NODE_BIN:-node}"

if [ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]; then
  echo "Error: SUPABASE_SERVICE_ROLE_KEY not set"
  exit 1
fi

FAILED=0

run_test() {
  local file="$1"
  echo ""
  echo "Running: $file"
  if "$NODE" "$file"; then
    true
  else
    FAILED=$((FAILED + 1))
  fi
}

echo "========================================"
echo "Integration Tests"
echo "========================================"
for f in "$ROOT/tests/integration/"*.test.js; do
  run_test "$f"
done

echo ""
if [ "$FAILED" -eq 0 ]; then
  echo "All test suites passed."
else
  echo "$FAILED test suite(s) failed."
  exit 1
fi
