#!/usr/bin/env bash
# Run all integration + n8n report tests
# Usage: SUPABASE_SERVICE_ROLE_KEY=xxx bash tests/run-all.sh
#
# Optional flags:
#   --integration   run only integration tests
#   --n8n           run only n8n report tests
#   --skip-n8n      skip n8n tests (faster, no AI calls)

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NODE="${NODE_BIN:-node}"

if [ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]; then
  echo "Error: SUPABASE_SERVICE_ROLE_KEY not set"
  exit 1
fi

RUN_INTEGRATION=true
RUN_N8N=true

for arg in "$@"; do
  case "$arg" in
    --integration) RUN_N8N=false ;;
    --n8n)         RUN_INTEGRATION=false ;;
    --skip-n8n)    RUN_N8N=false ;;
  esac
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

if [ "$RUN_INTEGRATION" = true ]; then
  echo "========================================"
  echo "Integration Tests"
  echo "========================================"
  for f in "$ROOT/tests/integration/"*.test.js; do
    run_test "$f"
  done
fi

if [ "$RUN_N8N" = true ]; then
  echo ""
  echo "========================================"
  echo "n8n Report Tests"
  echo "========================================"
  for f in "$ROOT/tests/n8n/"*.test.js; do
    run_test "$f"
  done
fi

echo ""
if [ "$FAILED" -eq 0 ]; then
  echo "All test suites passed."
else
  echo "$FAILED test suite(s) failed."
  exit 1
fi
