#!/usr/bin/env bash
# Loads the production schema snapshot (supabase/schema) on a throwaway local
# Postgres, applies every migration newer than the snapshot,
# then runs the SQL test files in supabase/tests (NN_*.test.sql) in order.
#
#   PGHOST=/path/to/socket PGPORT=54329 ./supabase/tests/run.sh
#
# Never point this at a real Supabase project: it drops and recreates the
# database named in TEST_DB.
set -euo pipefail

cd "$(dirname "$0")/../.."
TEST_DB="${TEST_DB:-flag_test}"
PSQL=(psql -U "${PGUSER:-postgres}" -v ON_ERROR_STOP=1 -q -X)

"${PSQL[@]}" -d postgres -c "drop database if exists ${TEST_DB}" -c "create database ${TEST_DB}" >/dev/null
"${PSQL[@]}" -d "$TEST_DB" -f supabase/tests/00_supabase_stub.sql >/dev/null 2>&1

BASELINE_VERSION=20261021025244
if ! out=$("${PSQL[@]}" -d "$TEST_DB" -f supabase/schema/baseline_20261031.sql 2>&1); then
  echo "BASELINE FAILED"; echo "$out" | tail -20; exit 1
fi
applied=0
for f in supabase/migrations/*.sql; do
  v=$(basename "$f"); v=${v%%_*}
  (( v > BASELINE_VERSION )) || continue
  if ! out=$("${PSQL[@]}" -d "$TEST_DB" -f "$f" 2>&1); then
    echo "MIGRATION FAILED: $f"; echo "$out" | tail -20; exit 1
  fi
  applied=$((applied + 1))
done
echo "baseline: ok, new migrations applied: $applied"

status=0
for t in supabase/tests/[0-9][0-9]_*.test.sql; do
  [[ -e "$t" ]] || continue
  if out=$("${PSQL[@]}" -d "$TEST_DB" -f "$t" 2>&1); then
    echo "PASS $t"
  else
    echo "FAIL $t"; echo "$out" | tail -25; status=1
  fi
done
exit $status
