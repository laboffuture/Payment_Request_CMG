#!/usr/bin/env bash
# The daily Accounts Receivable run, by paymentrequest-toprock-completion.timer:
#  - Completion and Billing: every active job whose next request date has passed gets a
#    new completion request, and its project manager is emailed.
#  - Debt Collection: every verified invoice now past its due date becomes a case, and
#    accounts are emailed.
#
# The portal has no session for a timer, so this proves itself with COMPLETION_CRON_TOKEN
# from .dev.vars, which the portal compares against the same value.
set -euo pipefail
cd "$(dirname "$0")/.."
token=$(grep -E '^COMPLETION_CRON_TOKEN=' .dev.vars | cut -d= -f2- | tr -d '"'"'"' ')
if [[ -z "$token" ]]; then echo "COMPLETION_CRON_TOKEN is not set in .dev.vars" >&2; exit 1; fi
for path in completion collection; do
  echo -n "$(date -Is) $path: "
  curl -sS --fail-with-body -X POST -H "authorization: Bearer $token" \
    "http://127.0.0.1:${PORT:-4101}/api/$path?run=due"
  echo
done
