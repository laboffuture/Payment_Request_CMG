#!/bin/sh
# Starts the Payment Worker: secrets into .dev.vars (wrangler's file for them),
# pending migrations applied, then serve on 8787 for the gateway.
set -e
cd /app
: > .dev.vars
for v in INTEGRATION_TOKEN APP_URL MAIL_CLIENT_EMAIL MAIL_PRIVATE_KEY MAIL_FROM MAIL_FROM_NAME \
         MAIL_SEND_AS MAIL_REPLY_TO MAIL_REDIRECT_TO RELAY_URL RELAY_TOKEN; do
  val=$(printenv "$v" || true)
  [ -n "$val" ] && printf '%s=%s\n' "$v" "$val" >> .dev.vars
done
chmod 600 .dev.vars

npx wrangler d1 migrations apply chandramari-one-task --local \
  -c wrangler.selfhost.jsonc --persist-to /data

exec npx wrangler dev -c wrangler.selfhost.jsonc --local --persist-to /data \
  --ip 0.0.0.0 --port 8787 --show-interactive-dev-session=false
