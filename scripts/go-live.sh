#!/usr/bin/env bash
# One-shot deployment to paymentrequest.cmis.ac.in.
# Requires an authenticated wrangler (npx wrangler login) and a completed npm run build.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

DB_NAME=chandramari-one-task
BUCKET=cmg-audit-media
ADMIN_EMAIL=mustaq@toprockinteriors.com
# Never hard-code this. Supply it at run time:  ADMIN_PASSWORD=... ./scripts/go-live.sh
ADMIN_PASSWORD="${ADMIN_PASSWORD:?set ADMIN_PASSWORD before running this script}"
ADMIN_NAME=Mustaq

echo "==> 1/6 D1 database"
if npx wrangler d1 info "$DB_NAME" >/dev/null 2>&1; then
  echo "    already exists"
else
  npx wrangler d1 create "$DB_NAME" >/dev/null
  echo "    created"
fi
DB_ID=$(npx wrangler d1 info "$DB_NAME" --json | python3 -c 'import json,sys;print(json.load(sys.stdin)["uuid"])')
echo "    database_id $DB_ID"

echo "==> 2/6 writing database_id into wrangler.deploy.jsonc"
python3 - "$DB_ID" <<'PY'
import re,sys
p="wrangler.deploy.jsonc"; s=open(p).read()
s=re.sub(r'"database_id": "[^"]*"', '"database_id": "%s"' % sys.argv[1], s, count=1)
open(p,"w").write(s)
PY

echo "==> 3/6 R2 bucket"
npx wrangler r2 bucket create "$BUCKET" 2>&1 | grep -qi "already\|created\|success" && echo "    ok" || echo "    (check R2 is enabled on the account)"

echo "==> 4/6 applying migrations to the remote database"
npx wrangler d1 migrations apply "$DB_NAME" --remote -c wrangler.deploy.jsonc

echo "==> 5/6 deploying the Worker and attaching the custom domain"
npx wrangler deploy -c wrangler.deploy.jsonc

echo "==> 6/6 creating the administrator login"
node scripts/make-admin-sql.mjs "$ADMIN_EMAIL" "$ADMIN_PASSWORD" "$ADMIN_NAME" > /tmp/admin.sql
npx wrangler d1 execute "$DB_NAME" --remote -c wrangler.deploy.jsonc --file /tmp/admin.sql >/dev/null
rm -f /tmp/admin.sql
echo "    $ADMIN_EMAIL created"

echo
echo "Live at https://paymentrequest.cmis.ac.in"
