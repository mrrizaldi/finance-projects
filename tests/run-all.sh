#!/usr/bin/env bash
# Run all integration tests
# Usage: SUPABASE_SERVICE_ROLE_KEY=xxx bash tests/run-all.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NODE="${NODE_BIN:-node}"

# Ambil kunci dari api/.env kalau belum ada di environment. Tanpa ini suite RLS/JWT
# ke-skip diam-diam dan cuma keliatan sebagai "0 passed, 0 failed".
if [ -f "$ROOT/api/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$ROOT/api/.env"
  set +a
fi

for v in SUPABASE_SERVICE_ROLE_KEY SUPABASE_ANON_KEY SUPABASE_JWT_SECRET; do
  if [ -z "$(eval "echo \${$v:-}")" ]; then
    echo "Error: $v not set (taruh di api/.env atau export manual)"
    exit 1
  fi
done

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
