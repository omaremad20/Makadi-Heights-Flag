#!/usr/bin/env bash
# Starts a fully LOCAL stack for end-to-end tests:
#   throwaway Postgres DB (schema snapshot + new migrations + seed)
#   PostgREST  :3001   (binary path in $POSTGREST_BIN)
#   mock Supabase gateway :54321 (Auth + Storage enforcing the real RLS)
#   Next.js :3100 with .env.e2e.local values (never production keys)
# Requires PGHOST/PGPORT for a local Postgres superuser `postgres`.
set -euo pipefail
cd "$(dirname "$0")/../.."

: "${PGHOST:?set PGHOST}" "${PGPORT:=54329}" "${POSTGREST_BIN:?set POSTGREST_BIN}"
export PGHOST PGPORT PGDATABASE=flag_e2e
WORK="${E2E_WORK_DIR:-$(mktemp -d)}"
JWT_SECRET="local-e2e-secret-$(head -c 16 /dev/urandom | od -An -tx1 | tr -d ' \n')"

TEST_DB=flag_e2e SKIP_TESTS=1 ./supabase/tests/run.sh
psql -U postgres -d flag_e2e -q -v ON_ERROR_STOP=1 -f scripts/e2e/seed.sql
psql -U postgres -d flag_e2e -q -c "alter role authenticator login"

cat > "$WORK/pgrst.conf" <<EOF
db-uri = "postgres://authenticator@/flag_e2e?host=$PGHOST&port=$PGPORT"
db-schemas = "public"
db-anon-role = "anon"
jwt-secret = "$JWT_SECRET"
server-port = 3001
EOF

mkjwt() { node -e '
const c=require("crypto");const [s,role,sub,email]=process.argv.slice(1);
const b=o=>Buffer.from(JSON.stringify(o)).toString("base64url");
const d=b({alg:"HS256",typ:"JWT"})+"."+b({role,sub:sub||undefined,email:email||undefined,aud:"authenticated",iss:"e2e",exp:4102444800});
console.log(d+"."+c.createHmac("sha256",s).update(d).digest("base64url"));' "$JWT_SECRET" "$@"; }

ANON=$(mkjwt anon)
cat > "$WORK/env.json" <<EOF
{"anon":"$ANON","service":"$(mkjwt service_role)",
 "admin":"$(mkjwt authenticated 00000000-0000-0000-0000-0000000000a1 admin@e2e.test)",
 "employee":"$(mkjwt authenticated 00000000-0000-0000-0000-0000000000e1 employee@e2e.test)"}
EOF

"$POSTGREST_BIN" "$WORK/pgrst.conf" > "$WORK/pgrst.log" 2>&1 &
JWT_SECRET="$JWT_SECRET" node scripts/e2e/mock-supabase.mjs > "$WORK/mock.log" 2>&1 &

cat > .env.local <<EOF
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$ANON
SUPABASE_SERVICE_ROLE_KEY=$(mkjwt service_role)
RATE_LIMIT_SALT=local-e2e-salt-not-for-production
EOF

NEXT_TELEMETRY_DISABLED=1 npx next ${NEXT_MODE:-dev} -p 3100 > "$WORK/next.log" 2>&1 &
until curl -sf -o /dev/null http://localhost:3100/application-form; do sleep 1; done
echo "E2E stack ready. Work dir: $WORK"
