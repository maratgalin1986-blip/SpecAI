#!/usr/bin/env bash
# The office search relay (apps/web/src/lib/office/run.ts: peekScheduledStep /
# ingestScheduledStep). Overpass resets connections from Vercel but answers a
# GitHub runner (probe of 2026-11-10), so the runner only carries bytes: it asks
# the app for the next plan step and its Overpass query, fetches Overpass and
# posts the raw answer back. Parsing and candidate creation stay in the app.
# The log gets one line per step with counts only: response bodies hold company
# data and are never printed.
set -uo pipefail

BASE_URL="${BASE_URL:-https://spec-ai-web.vercel.app}"
RELAY_STEPS="${RELAY_STEPS:-4}"
# New steps start only within this many seconds, so the final tick still fits the job timeout.
RELAY_BUDGET_S="${RELAY_BUDGET_S:-300}"
UA='SpecPlast16-office/1.0 (+https://xn--24-6kc5aagh4arjl.xn--p1ai; specplast16@mail.ru)'

if [ -z "${CRON_SECRET:-}" ]; then
  echo "::error::CRON_SECRET repository secret is not set — add it in Settings → Secrets and variables → Actions"
  exit 1
fi
AUTH="Authorization: Bearer $CRON_SECRET"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# One request to one mirror; succeeds only on HTTP 200 with an `elements` array.
ask_mirror() {
  rm -f "$TMP/overpass.json"
  MIRROR_CODE="$(curl -sS -o "$TMP/overpass.json" -w '%{http_code}' --max-time 40 -A "$UA" \
    --data-urlencode "data=$2" "$1" 2>/dev/null)" || true
  [ "$MIRROR_CODE" = "200" ] && jq -e '.elements | type == "array"' "$TMP/overpass.json" >/dev/null 2>&1
}

fetch_overpass() {
  local query="$1" mirror
  while IFS= read -r mirror; do
    [ -n "$mirror" ] || continue
    ask_mirror "$mirror" "$query" && return 0
    case "$MIRROR_CODE" in
      429 | 502 | 503 | 504)
        sleep 5
        ask_mirror "$mirror" "$query" && return 0
        ;;
    esac
  done < <(jq -r '.mirrors[]? // empty' "$TMP/next.json")
  return 1
}

# Posts a file to ingest and prints the single log line of the step.
ingest() {
  local index="$1" key="$2" file="$3" code
  code="$(curl -sS -o "$TMP/ingest.json" -w '%{http_code}' --max-time 70 -H "$AUTH" \
    -H 'Content-Type: application/json' --data-binary "@$file" \
    "$BASE_URL/api/cron/office/ingest?index=$index&key=$key" 2>/dev/null)" || true
  if [ "$code" = "200" ]; then
    echo "step $index: $(jq -r '"found=\(.found) created=\(.created) skipped=\(.skipped) error=\(if .error then "yes" else "no" end)"' "$TMP/ingest.json" 2>/dev/null || echo 'unreadable answer')"
  elif [ "$code" = "409" ]; then
    echo "step $index: stale (the plan moved on)"
  else
    echo "step $index: ingest failed, HTTP $code"
  fi
}

i=0
while [ "$i" -lt "$RELAY_STEPS" ] && [ "$SECONDS" -lt "$RELAY_BUDGET_S" ]; do
  if ! curl -fsS --max-time 30 -H "$AUTH" -o "$TMP/next.json" "$BASE_URL/api/cron/office/next"; then
    if [ "$i" -eq 0 ]; then
      echo "::error::the office did not answer /api/cron/office/next"
      exit 1
    fi
    echo "next: no answer, stopping"
    break
  fi
  skipped="$(jq -r '.skipped // empty' "$TMP/next.json" 2>/dev/null)"
  if [ -n "$skipped" ]; then
    echo "plan: $skipped"
    break
  fi
  index="$(jq -r '.index // empty' "$TMP/next.json" 2>/dev/null)"
  key="$(jq -r '.key // empty' "$TMP/next.json" 2>/dev/null)"
  query="$(jq -r '.query // empty' "$TMP/next.json" 2>/dev/null)"
  if [ -z "$index" ] || [ -z "$key" ]; then
    echo "next: unexpected answer, stopping"
    break
  fi

  if [ -n "$query" ] && fetch_overpass "$query"; then
    ingest "$index" "$key" "$TMP/overpass.json"
  else
    # Journaled as a failed run, and the plan moves on to the next step.
    printf '%s' '{"error":"Overpass не ответил с раннера GitHub"}' >"$TMP/error.json"
    ingest "$index" "$key" "$TMP/error.json"
  fi

  i=$((i + 1))
  sleep 3
done

# Outreach planning and the owner's digest; the plan steps were done above.
if curl -fsS --max-time 70 -H "$AUTH" -o "$TMP/tick.json" "$BASE_URL/api/cron/office?steps=0"; then
  echo "tick: done"
else
  echo "tick: no answer"
fi
exit 0
