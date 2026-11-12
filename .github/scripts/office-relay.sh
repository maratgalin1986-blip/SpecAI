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
RELAY_STEPS="${RELAY_STEPS:-6}"
# New steps start only within this many seconds, so the final tick still fits the job timeout.
RELAY_BUDGET_S="${RELAY_BUDGET_S:-300}"
UA='SpecPlast16-office/1.0 (+https://xn--24-6kc5aagh4arjl.xn--p1ai; specplast16@yandex.ru)'

if [ -z "${CRON_SECRET:-}" ]; then
  echo "::error::CRON_SECRET repository secret is not set — add it in Settings → Secrets and variables → Actions"
  exit 1
fi
AUTH="Authorization: Bearer $CRON_SECRET"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# One request to one mirror. Succeeds on HTTP 200 with an `elements` array that is either
# non-empty or carries no error remark: Overpass reports its own timeout as 200 with an empty
# list and «remark: runtime error…» — then the next mirror is asked. Such an answer leaves
# $TMP/remark.json behind, so that if no mirror does better the step is reported as «did not
# finish in time» (and kept aside for a retry) rather than «no mirror could be reached».
ANSWERED=0
# 1 — a mirror took the request but did not finish in time (only the wording of the journal
# line). A mirror that cannot be connected to gives up in 10 s and is not a timeout.
TIMED_OUT=0
ask_mirror() {
  local started="$SECONDS"
  rm -f "$TMP/overpass.json"
  MIRROR_CODE="$(curl -sS -o "$TMP/overpass.json" -w '%{http_code}' --connect-timeout 10 \
    --max-time 40 -A "$UA" --data-urlencode "data=$2" "$1" 2>/dev/null)" || true
  if [ "$MIRROR_CODE" != "200" ] && [ $((SECONDS - started)) -ge 35 ]; then TIMED_OUT=1; fi
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
# Steps whose Overpass answer the office parsed without an error; steps another run had done.
GOOD=0
STALE=0
FAILS=0
# 1 — /api/cron/office/next answered something that is not a plan step.
NEXT_BAD=0

post_ingest() {
  INGEST_CODE="$(curl -sS -o "$TMP/ingest.json" -w '%{http_code}' --max-time 70 -H "$AUTH" \
    -H 'Content-Type: application/json' --data-binary "@$3" \
    "$BASE_URL/api/cron/office/ingest?index=$1&key=$2" 2>/dev/null)" || true
}

# Posts a file to ingest and prints the single log line of the step. If the app does not take
# the answer (413 — too large, 500, no reply), a short error is posted for the same step, so
# that it is journaled as failed and the plan moves on instead of re-downloading it forever;
# such a step is not counted as good even when that second post is answered.
ingest() {
  local index="$1" key="$2" file="$3" refused=0
  ATTEMPTED=$((ATTEMPTED + 1))
  post_ingest "$index" "$key" "$file"
  if [ "$INGEST_CODE" != "200" ] && [ "$INGEST_CODE" != "409" ]; then
    refused=1
    echo "step $index: ingest failed, HTTP $INGEST_CODE — reporting the step as failed"
    printf '{"error":"ответ Overpass не принят офисом: HTTP %s"}' "$INGEST_CODE" >"$TMP/rejected.json"
    post_ingest "$index" "$key" "$TMP/rejected.json"
  fi
  if [ "$INGEST_CODE" = "200" ]; then
    if [ "$refused" -eq 0 ] && jq -e '(.error // "") == ""' "$TMP/ingest.json" >/dev/null 2>&1; then
      GOOD=$((GOOD + 1))
    fi
    echo "step $index: $(jq -r '"found=\(.found) created=\(.created) skipped=\(.skipped) error=\(if .error then "yes" else "no" end)"' "$TMP/ingest.json" 2>/dev/null || echo 'unreadable answer')"
  elif [ "$INGEST_CODE" = "409" ] && [ "$refused" -eq 0 ]; then
    STALE=$((STALE + 1))
    echo "step $index: stale (the plan moved on)"
  elif [ "$INGEST_CODE" = "409" ]; then
    echo "step $index: the office refused the answer and has moved on without a journal line"
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
  # A redirect or an HTML page is «success» for curl -f, so the answer must be a JSON object.
  if ! jq -e 'type == "object"' "$TMP/next.json" >/dev/null 2>&1; then
    echo "next: the answer is not JSON, stopping"
    NEXT_BAD=1
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
    NEXT_BAD=1
    break
  fi

  ANSWERED=0
  TIMED_OUT=0
  rm -f "$TMP/remark.json"
  if [ -z "$query" ]; then
    # The plan names a niche or a city the app does not know: journaled, the plan moves on.
    printf '%s' '{"error":"Для шага плана нет запроса Overpass"}' >"$TMP/error.json"
    ingest "$index" "$key" "$TMP/error.json"
  elif fetch_overpass "$query"; then
    FAILS=0
    ingest "$index" "$key" "$TMP/overpass.json"
  else
    # No mirror gave an answer (the mirrors are often too slow: on 2026-11-10 every second
    # step was lost this way). The office journals the step as failed, moves the plan on and
    # keeps this step aside («retry»): it is offered again right after another step succeeds.
    FAILS=$((FAILS + 1))
    if [ -f "$TMP/remark.json" ]; then
      # A mirror answered HTTP 200 with its own «runtime error: Query timed out» — the same
      # «too slow right now» as a curl timeout, so the step is kept aside in the same way.
      reason='Overpass не успел выполнить запрос'
    elif [ "$TIMED_OUT" -eq 1 ]; then
      reason='Overpass не успел ответить на запрос шага'
    else
      reason='Overpass не ответил с раннера GitHub'
    fi
    printf '{"error":"%s","retry":true}' "$reason" >"$TMP/error.json"
    ingest "$index" "$key" "$TMP/error.json"
    echo "overpass: step $index got no answer (timed out: $TIMED_OUT)"
  fi
  # Two failed steps in a row is an outage rather than one heavy query: stop, so that the
  # outage does not eat the plan (only the first failed step is kept aside for a retry).
  if [ "$FAILS" -ge 2 ]; then
    echo "overpass: two failures in a row, stopping"
    break
  fi

  i=$((i + 1))
  sleep 3
done

# The owner's test letter (apps/web/src/lib/office/testLetter.ts): sent when the last line of the
# on-demand file asks for it. The recipient is fixed in the code; the log gets status words only.
if tail -n 1 .github/office-relay-run.txt 2>/dev/null | grep -q 'пробное письмо'; then
  if curl -fsS --max-time 60 -H "$AUTH" -o "$TMP/test.json" "$BASE_URL/api/cron/office/test-letter"; then
    echo "test letter: $(jq -r 'if .ok then "sent created=\(.created)" else "not sent: \(.reason // "?" | .[0:160])" end' "$TMP/test.json" 2>/dev/null || echo 'unreadable answer')"
  else
    echo "test letter: no answer"
  fi
fi

# Outreach planning and the owner's digest; the plan steps were done above.
TICK_OK=1
if curl -fsS --max-time 70 -H "$AUTH" -o "$TMP/tick.json" "$BASE_URL/api/cron/office?steps=0"; then
  # Counts and status words only (the answer has no names or addresses).
  echo "tick: $(jq -r 'if .skipped then "skipped=\(.skipped)" else (.outreach // {}) | "email=\(.email // 0) whatsapp=\(.whatsapp // 0) followUps=\(.followUps // 0) errors=\(.errors // 0) filtered=\(.filtered // 0) skipped=\(.skipped // "no") mail=\(.mail // "ok") code=\((.mailError // "") | (capture("(?<c>[0-9]{3})") | .c) // "-")" end' "$TMP/tick.json" 2>/dev/null || echo 'done')"
  # The mail server's own refusal text (it carries no password; addresses are masked): without it
  # «mail=broken» cannot be told apart — wrong password, wrong login or a blocked sign-in.
  jq -r '(.outreach.mailError // "") | select(length > 0) | gsub("[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+"; "<address>") | "tick: mail error: \(.[0:180])"' "$TMP/tick.json" 2>/dev/null || true
  # Signs of the mailbox settings without their values (which server, the login's domain, whether
  # the sender equals the login, whether the password looks like an app password).
  jq -r '(.outreach.mailHint // "") | select(length > 0) | "tick: mail settings: \(.[0:160])"' "$TMP/tick.json" 2>/dev/null || true
  # Replies read from the mailbox: counts only.
  jq -r '.replies // empty | "tick: replies: seen=\(.seen // 0) replies=\(.replies // 0) answered=\(.answered // 0) stops=\(.stops // 0) bounces=\(.bounces // 0) needOwner=\(.needOwner // 0) skipped=\(.skipped // "no") error=\(if .error then "yes" else "no" end)"' "$TMP/tick.json" 2>/dev/null || true
  jq -r '(.replies.error // "") | select(length > 0) | "tick: mailbox error: \(.[0:160])"' "$TMP/tick.json" 2>/dev/null || true
else
  TICK_OK=0
  echo "tick: no answer"
fi

# A red run is how a broken search gets noticed: the office answered /next with something that
# is not a plan step, no step brought a parsed Overpass answer, or there was no tick.
if [ "$NEXT_BAD" -eq 1 ]; then
  echo "::error::/api/cron/office/next did not return a plan step"
  exit 1
fi
if [ "$ATTEMPTED" -gt 0 ] && [ "$GOOD" -eq 0 ] && [ "$STALE" -eq 0 ]; then
  echo "::error::none of the $ATTEMPTED plan steps brought an Overpass answer the office could use"
  exit 1
fi
if [ "$TICK_OK" -eq 0 ]; then
  echo "::error::the office tick (/api/cron/office?steps=0) did not answer"
  exit 1
fi
exit 0
