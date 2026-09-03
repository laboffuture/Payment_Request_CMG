#!/usr/bin/env bash
# Emergency account recovery, run on the server.
#
# The interface cannot rescue you from a lockout, because signing in is exactly what it
# needs. This talks to the database directly and does not.
#
#   ./scripts/account.sh list
#   ./scripts/account.sh enable  <email>|all
#   ./scripts/account.sh disable <email>
#   ./scripts/account.sh password <email> <new-password>
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

DB=$(find .wrangler/state/v3/d1 -name '*.sqlite' -size +0 ! -name 'metadata.sqlite' | head -1)
[ -n "$DB" ] || { echo "No database found." >&2; exit 1; }
q(){ sqlite3 "$DB" "$@"; }

case "${1:-list}" in
  list)
    printf '%-40s %-18s %-8s %s\n' EMAIL NAME ACTIVE ROLES
    q -separator '|' "SELECT email,name,active,roles FROM wf_users ORDER BY email" |
      while IFS='|' read -r e n a r; do printf '%-40s %-18s %-8s %s\n' "$e" "$n" "$a" "$r"; done ;;
  enable)
    t="${2:?usage: account.sh enable <email>|all}"
    if [ "$t" = all ]; then q "UPDATE wf_users SET active=1;"; echo "All accounts enabled."
    else q "UPDATE wf_users SET active=1 WHERE email='${t//\'/\'\'}';"; echo "Enabled $t."; fi ;;
  disable)
    t="${2:?usage: account.sh disable <email>}"
    q "UPDATE wf_users SET active=0 WHERE email='${t//\'/\'\'}';"
    q "DELETE FROM wf_sessions WHERE email='${t//\'/\'\'}';"; echo "Disabled $t." ;;
  password)
    t="${2:?usage: account.sh password <email> <new-password>}"; pw="${3:?new password required}"
    # hashed with the same scheme the application uses, so the app can verify it
    node scripts/make-admin-sql.mjs "$t" "$pw" "$(q "SELECT name FROM wf_users WHERE email='${t//\'/\'\'}'" )" \
      | sqlite3 "$DB"
    echo "Password reset for $t. Every session for that account has ended." ;;
  *) sed -n '2,10p' "$0"; exit 64 ;;
esac
