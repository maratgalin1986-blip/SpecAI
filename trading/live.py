"""The council trading live on Finam, small lots, one position at a time.

    export FINAM_SECRET=...  FINAM_ACCOUNT_ID=...  TRADING_CAPITAL=3000
    python3 live.py

Runs until 18:45 MSK and exits; start it every trading morning (cron/Task
Scheduler). Every discussion and every order goes to memory/council.md.
Create memory/STOP to halt it at once.
"""

import json
import os
import time
from datetime import datetime, timedelta, timezone

from council import agents
from finam import Finam

MSK = timezone(timedelta(hours=3))
TICKERS = ["SBER", "GAZP", "VTBR", "ROSN", "T", "PLZL", "NVTK", "GMKN", "SMLT", "MAGN", "TATN", "RUAL", "SNGSP"]
CAPITAL = float(os.environ.get("TRADING_CAPITAL", "3000"))
DAY_LOSS_LIMIT = 0.05  # stop for the day after losing 5% of capital
MAX_TRADES = 6  # per day; each trade pays fees twice
MEMORY = os.path.join(os.path.dirname(__file__), "memory")
STATE = os.path.join(MEMORY, "council_state.json")
JOURNAL = os.path.join(MEMORY, "council.md")
STOP = os.path.join(MEMORY, "STOP")


def log(text):
    line = f"{datetime.now(MSK):%Y-%m-%d %H:%M:%S} {text}"
    print(line, flush=True)
    with open(JOURNAL, "a") as f:
        f.write(line + "\n")


def bars10(broker, symbol):
    """Finam has no 10-minute timeframe; build it from 5-minute bars (same as the backtest)."""
    end = datetime.now(timezone.utc)
    raw = broker.bars(symbol, "TIME_FRAME_M5", (end - timedelta(days=5)).isoformat(), end.isoformat())
    out = {}
    for ts, o, h, l, c, v in raw[:-1]:  # drop the bar that is still forming
        key = ts[:15]  # YYYY-MM-DDTHH:M → groups :00-:05, :10-:15, ...
        if key in out:
            k, o0, h0, l0, _, v0 = out[key]
            out[key] = (k, o0, max(h0, h), min(l0, l), c, v0 + v)
        else:
            out[key] = (key, o, h, l, c, v)
    return list(out.values())


def load():
    today = datetime.now(MSK).date().isoformat()
    s = json.load(open(STATE)) if os.path.exists(STATE) else {}
    if s.get("day") != today:
        s.update(day=today, pnl=0.0, trades=0)
    return s


def save(s):
    json.dump(s, open(STATE, "w"), ensure_ascii=False, indent=1)


def close(broker, s, price, why):
    p = s.pop("position")
    broker.place_market(f"{p['t']}@MISX", "sell", p["qty"])
    cost = agents.COMMISSION + agents.SLIPPAGE
    pnl = p["qty"] * (price - p["entry"]) - p["qty"] * (price + p["entry"]) * cost
    s["pnl"] += pnl
    log(f"ПРОДАЖА {p['t']} {p['qty']} шт ~{price:.2f} ({why}), результат сделки {pnl:+.2f} ₽, за день {s['pnl']:+.2f} ₽")


def step(broker, s):
    now = datetime.now(MSK)
    hhmm = now.strftime("%H:%M")
    if "position" in s:
        p = s["position"]
        price = broker.last_price(f"{p['t']}@MISX")
        if price <= p["stop"]:
            close(broker, s, price, "стоп-лосс")
        elif price >= p["take"]:
            close(broker, s, price, "тейк-профит")
        elif hhmm >= "18:30":
            close(broker, s, price, "конец дня, на ночь не держим")
        return

    if os.path.exists(STOP):
        return
    if s["pnl"] <= -DAY_LOSS_LIMIT * CAPITAL or s["trades"] >= MAX_TRADES:
        return
    if not ("10:30" <= hhmm <= "17:30") or now.minute % 10 != 1:
        return  # decide once per fresh 10-minute bar

    equity, _ = broker.portfolio()
    budget = min(equity, CAPITAL) * 0.97
    for t in TICKERS:
        bars = bars10(broker, f"{t}@MISX")
        if len(bars) < 90:
            continue
        ok, ops = agents.discuss(bars[-90:])
        if not ok:
            continue
        price = broker.last_price(f"{t}@MISX")
        lot = broker.lot_size(f"{t}@MISX")
        qty = int(budget / (price * (1 + agents.COMMISSION + agents.SLIPPAGE)) / lot) * lot
        log(f"Совет по {t}: " + " | ".join(f"{o.agent}: {o.reason}" for o in ops))
        if qty < lot:
            log(f"  Риск-менеджер: на лот {t} ({lot} шт × {price:.2f}) не хватает денег, пропускаем")
            continue
        stop, take = agents.exits(price, bars)
        broker.place_market(f"{t}@MISX", "buy", qty)
        s["position"] = {"t": t, "qty": qty, "entry": price, "stop": stop, "take": take}
        s["trades"] += 1
        log(f"ПОКУПКА {t} {qty} шт ~{price:.2f}, стоп {stop:.2f}, цель {take:.2f}")
        return


def main():
    os.makedirs(MEMORY, exist_ok=True)
    broker = Finam()
    log(f"Совет начал работу. Капитал {CAPITAL:.0f} ₽, лимит убытка за день {DAY_LOSS_LIMIT * CAPITAL:.0f} ₽")
    while datetime.now(MSK).strftime("%H:%M") < "18:45":
        s = load()
        try:
            step(broker, s)
        except Exception as e:  # network hiccup: log and keep going
            log(f"Ошибка: {e}")
        save(s)
        time.sleep(30)
    log(f"Совет закончил день. Итог дня {load()['pnl']:+.2f} ₽")


if __name__ == "__main__":
    main()
