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

# One request to one mirror. Succeeds on HTTP 200 with an `elements` array that is either
# non-empty or carries no error remark: Overpass reports its own timeout as 200 with an empty
# list and «remark: runtime error…» — then the next mirror is asked. Such an answer is kept
# in $TMP/remark.json, so that if no mirror does better it is posted and journaled as is.
ANSWERED=0
ask_mirror() {
  rm -f "$TMP/overpass.json"
  MIRROR_CODE="$(curl -sS -o "$TMP/overpass.json" -w '%{http_code}' --max-time 40 -A "$UA" \
    --data-urlencode "data=$2" "$1" 2>/dev/null)" || true
  [ "$MIRROR_CODE" = "200" ] || return 1
  jq -e '.elements | type == "array"' "$TMP/overpass.json" >/dev/null 2>&1 || return 1
  ANSWERED=1
  if jq -e '(.elements | length) == 0 and ((.remark // "") | test("error"; "i"))' \
    "$TMP/overpass.json" >/dev/null 2>&1; then
    cp "$TMP/overpass.json" "$TMP/remark.json"
    return 1
  fi
  return 0
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

ATTEMPTED=0
ACCEPTED=0

post_ingest() {
  INGEST_CODE="$(curl -sS -o "$TMP/ingest.json" -w '%{http_code}' --max-time 70 -H "$AUTH" \
    -H 'Content-Type: application/json' --data-binary "@$3" \
    "$BASE_URL/api/cron/office/ingest?index=$1&key=$2" 2>/dev/null)" || true
}

# Posts a file to ingest and prints the single log line of the step. If the app does not take
# the answer (413 — too large, 500, no reply), a short error is posted for the same step, so
# that it is journaled as failed and the plan moves on instead of re-downloading it forever.
ingest() {
  local index="$1" key="$2" file="$3"
  ATTEMPTED=$((ATTEMPTED + 1))
  post_ingest "$index" "$key" "$file"
  if [ "$INGEST_CODE" != "200" ] && [ "$INGEST_CODE" != "409" ]; then
    echo "step $index: ingest failed, HTTP $INGEST_CODE — reporting the step as failed"
    printf '{"error":"ответ Overpass не принят офисом: HTTP %s"}' "$INGEST_CODE" >"$TMP/rejected.json"
    post_ingest "$index" "$key" "$TMP/rejected.json"
  fi
  if [ "$INGEST_CODE" = "200" ]; then
    ACCEPTED=$((ACCEPTED + 1))
    echo "step $index: $(jq -r '"found=\(.found) created=\(.created) skipped=\(.skipped) error=\(if .error then "yes" else "no" end)"' "$TMP/ingest.json" 2>/dev/null || echo 'unreadable answer')"
  elif [ "$INGEST_CODE" = "409" ]; then
    ACCEPTED=$((ACCEPTED + 1))
    echo "step $index: stale (the plan moved on)"
  else
    echo "step $index: the office did not accept the step, HTTP $INGEST_CODE"
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

  ANSWERED=0
  rm -f "$TMP/remark.json"
  if [ -z "$query" ]; then
    # The plan names a niche or a city the app does not know: journaled, the plan moves on.
    printf '%s' '{"error":"Для шага плана нет запроса Overpass"}' >"$TMP/error.json"
    ingest "$index" "$key" "$TMP/error.json"
  elif fetch_overpass "$query"; then
    ingest "$index" "$key" "$TMP/overpass.json"
  elif [ -f "$TMP/remark.json" ]; then
    # A mirror answered, but with its own timeout: journaled as is, the plan moves on.
    ingest "$index" "$key" "$TMP/remark.json"
  else
    # No mirror could be reached: journaled as failed, the cursor stays (retry), and the
    # loop stops — the same step is tried again on the next run instead of losing the city.
    printf '%s' '{"error":"Overpass не ответил с раннера GitHub","retry":true}' >"$TMP/error.json"
    ingest "$index" "$key" "$TMP/error.json"
    echo "overpass: no mirror answered, stopping"
    break
  fi

  i=$((i + 1))
  sleep 3
done

# Outreach planning and the owner's digest; the plan steps were done above.
TICK_OK=1
if curl -fsS --max-time 70 -H "$AUTH" -o "$TMP/tick.json" "$BASE_URL/api/cron/office?steps=0"; then
  echo "tick: done"
else
  TICK_OK=0
  echo "tick: no answer"
fi

# A red run is how a broken relay gets noticed: nothing accepted, or no tick.
if [ "$ATTEMPTED" -gt 0 ] && [ "$ACCEPTED" -eq 0 ]; then
  echo "::error::the office accepted none of the $ATTEMPTED plan steps"
  exit 1
fi
if [ "$TICK_OK" -eq 0 ]; then
  echo "::error::the office tick (/api/cron/office?steps=0) did not answer"
  exit 1
fi
exit 0
