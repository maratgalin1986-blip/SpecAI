#!/usr/bin/env bash
# Состояние поиска офиса по файлу .github/office-relay-chain.txt (первая строка):
#   on                        — поиск и цепочка идут;
#   off-until <дата UTC>      — пауза до этого момента, потом сама снимается (владелец, 2026-11-17:
#                               «всё на паузу»); поиск не идёт, цепочка не ставит следующий проход;
#   любое другое              — пауза без срока.
# Печатает «on» или «off». Чтение входящих писем (тик) от паузы не зависит.
line="$(head -n 1 "${1:-.github/office-relay-chain.txt}" 2>/dev/null | tr -d '\r')"
case "$line" in
  on) echo on ;;
  off-until\ *)
    until_ts="$(date -u -d "${line#off-until }" +%s 2>/dev/null || echo 0)"
    if [ "$(date -u +%s)" -ge "$until_ts" ] && [ "$until_ts" -gt 0 ]; then echo on; else echo off; fi
    ;;
  *) echo off ;;
esac
