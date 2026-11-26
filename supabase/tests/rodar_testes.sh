#!/usr/bin/env bash
# Sobe um PostgreSQL temporário, aplica migrations + seed e roda os cenários.
# Uso: ./supabase/tests/rodar_testes.sh   (precisa do PostgreSQL 15+ instalado)
set -euo pipefail
DIR="$(cd "$(dirname "$0")/.." && pwd)"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
TMP="$(mktemp -d)"
PORT="${PORT:-54329}"
trap '"$PGBIN/pg_ctl" -D "$TMP/data" stop -m immediate >/dev/null 2>&1 || true; rm -rf "$TMP"' EXIT

"$PGBIN/initdb" -D "$TMP/data" -U postgres -A trust >/dev/null
"$PGBIN/pg_ctl" -D "$TMP/data" -o "-p $PORT -k $TMP -c listen_addresses=''" -l "$TMP/log" start >/dev/null
PSQL=(psql -h "$TMP" -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q)

"${PSQL[@]}" -f "$DIR/tests/supabase_stub.sql"
for f in "$DIR"/migrations/*.sql; do
  echo "-> $(basename "$f")"
  "${PSQL[@]}" -f "$f"
done
echo "-> seed.sql"
"${PSQL[@]}" -f "$DIR/seed.sql"
echo "-> cenários"
"${PSQL[@]}" -o /dev/null -f "$DIR/tests/cenarios.sql" 2>&1 | sed 's/^psql:.*NOTICE:  /  /'
