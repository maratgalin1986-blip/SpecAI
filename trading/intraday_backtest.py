"""Run the council on real 10-minute MOEX candles with fees, one position at a time.

Usage: python3 intraday_backtest.py [capital] [days]
"""

import json
import os
import sys
import urllib.request
from datetime import date, timedelta

from council import agents

TICKERS = ["SBER", "GAZP", "VTBR", "ROSN", "T", "PLZL", "NVTK", "GMKN", "SMLT", "MAGN", "TATN", "RUAL", "SNGSP"]
URL = (
    "https://iss.moex.com/iss/engines/stock/markets/shares/boards/TQBR/securities/{t}/"
    "candles.json?interval=10&from={f}&till={u}&start={s}&iss.meta=off"
)
CACHE = os.path.join(os.path.dirname(__file__), ".cache")


def bars10(t, start, till):
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, f"10m_{t}_{start}_{till}.json")
    if os.path.exists(path):
        return json.load(open(path))
    rows, s = [], 0
    while True:
        with urllib.request.urlopen(URL.format(t=t, f=start, u=till, s=s), timeout=30) as r:
            p = json.load(r)["candles"]
        if not p["data"]:
            break
        c = p["columns"]
        ix = [c.index(k) for k in ("begin", "open", "high", "low", "close", "volume")]
        rows += [[r[i] for i in ix] for r in p["data"]]
        s += len(p["data"])
    json.dump(rows, open(path, "w"))
    return rows


def run(capital, days):
    till = date.today()
    start = till - timedelta(days=days)
    data = {t: bars10(t, start.isoformat(), till.isoformat()) for t in TICKERS}
    # Merge into one timeline.
    times = sorted({b[0] for rows in data.values() for b in rows})
    idx = {t: {b[0]: i for i, b in enumerate(rows)} for t, rows in data.items()}
    cash, pos, trades, fees = capital, None, [], 0.0
    cost = agents.COMMISSION + agents.SLIPPAGE
    for ts in times:
        hhmm = ts[11:16]
        if pos:
            t = pos["t"]
            i = idx[t].get(ts)
            if i is None:
                continue
            _, _, h, l, c, _ = data[t][i]
            exit_px = None
            if l <= pos["stop"]:
                exit_px = pos["stop"]
            elif h >= pos["take"]:
                exit_px = pos["take"]
            elif hhmm >= "18:30":
                exit_px = c
            if exit_px:
                gross = pos["qty"] * exit_px
                fee = gross * cost
                cash += gross - fee
                fees += fee
                trades.append(pos["qty"] * (exit_px - pos["entry"]) - fee - pos["fee"])
                pos = None
            continue
        if not ("10:30" <= hhmm <= "17:30"):
            continue
        for t in TICKERS:
            i = idx[t].get(ts)
            if i is None or i < 90:
                continue
            window = [b[:1] + b[1:] for b in data[t][i - 89 : i + 1]]
            ok, _ = agents.discuss(window)
            if not ok:
                continue
            price = window[-1][4]
            qty = int(cash / (price * (1 + cost)))
            if qty < 1:
                continue
            fee = qty * price * cost
            stop, take = agents.exits(price, window)
            cash -= qty * price + fee
            fees += fee
            pos = {"t": t, "qty": qty, "entry": price, "stop": stop, "take": take, "fee": fee}
            break
    final = cash + (pos["qty"] * data[pos["t"]][-1][4] if pos else 0)
    wins = sum(1 for x in trades if x > 0)
    print(f"Период: {start} — {till}, стартовый капитал {capital:,.0f} ₽")
    print(f"Сделок: {len(trades)}, прибыльных: {wins} ({wins / max(len(trades), 1):.0%})")
    print(f"Комиссии и проскальзывание: {fees:,.0f} ₽")
    print(f"Итог: {final:,.0f} ₽ ({final / capital - 1:+.1%})")
    best_day = max(trades, default=0)
    print(f"Лучшая сделка: {best_day:+,.0f} ₽; худшая: {min(trades, default=0):+,.0f} ₽")


if __name__ == "__main__":
    run(float(sys.argv[1]) if len(sys.argv) > 1 else 3000, int(sys.argv[2]) if len(sys.argv) > 2 else 180)
