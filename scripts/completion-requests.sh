#!/usr/bin/env bash
# Issues the completion requests that are due in Accounts Receivable -> Completion and
# Billing: every active job whose next request date has passed gets a new cycle, and its
# project manager is emailed. Run daily by paymentrequest-toprock-completion.timer.
#
# The portal has no session for a timer, so this proves itself with COMPLETION_CRON_TOKEN
# from .dev.vars, which the portal compares against the same value.
set -euo pipefail
cd "$(dirname "$0")/.."
token=$(grep -E '^COMPLETION_CRON_TOKEN=' .dev.vars | cut -d= -f2- | tr -d '"'"'"' ')
if [[ -z "$token" ]]; then echo "COMPLETION_CRON_TOKEN is not set in .dev.vars" >&2; exit 1; fi
curl -sS --fail-with-body -X POST -H "authorization: Bearer $token" \
  "http://127.0.0.1:${PORT:-4101}/api/completion?run=due"
echo
