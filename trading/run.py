"""One working day of the trading office: analyst → risk → trader → journal.

Run once a day after 10:30 MSK (cron or a scheduled Claude session):
    python3 run.py            # paper trading (default, no money involved)
    TRADING_MODE=live python3 run.py   # real orders on Finam

Rebalancing happens once a month; on other days the office only checks risk
and writes a line in the journal.
"""

import json
import os
from datetime import date, datetime

from agents import analyst, risk, trader
from strategy import UNIVERSE

MODE = os.environ.get("TRADING_MODE", "paper")
CAPITAL = float(os.environ.get("TRADING_CAPITAL", "100000"))
STATE_FILE = os.path.join(risk.MEMORY, f"state_{MODE}.json")
JOURNAL = os.path.join(risk.MEMORY, "journal.md")


def load_state():
    if os.path.exists(STATE_FILE):
        with open(STATE_FILE) as f:
            return json.load(f)
    return {"cash": CAPITAL, "positions": {}, "month": None}


def main():
    os.makedirs(risk.MEMORY, exist_ok=True)
    state = load_state()
    weights, why, prices = analyst.propose()

    if MODE == "live":
        from finam import Finam

        broker = Finam()
        account_equity, holdings = broker.portfolio()
        # Only the strategy's own names; anything else on the account is never touched.
        holdings = {s.split("@")[0]: q for s, q in holdings.items() if s.split("@")[0] in UNIVERSE}
        prices.update({t: broker.last_price(f"{t}@MISX") for t in set(weights) | set(holdings)})
        lots = {t: broker.lot_size(f"{t}@MISX") for t in set(weights) | set(holdings)}
        # Use a separate Finam account for the office; it never manages more than CAPITAL.
        equity = min(account_equity, CAPITAL)
    else:
        holdings = state["positions"]
        lots = {}
        equity = state["cash"] + sum(q * prices.get(t, 0) for t, q in holdings.items())

    target, notes = risk.check(weights, equity, state)
    month = date.today().strftime("%Y-%m")
    rebalance = target is not None and (month != state.get("month") or target == {})

    lines = [f"\n## {datetime.now():%Y-%m-%d %H:%M} · режим: {MODE}", *[f"- {n}" for n in notes]]
    if rebalance:
        orders = trader.plan(target, equity, holdings, prices, lots)
        lines += [f"- Аналитик: {w}" for w in why]
        if MODE == "live":
            lines += [f"- Заявка: {r}" for r in trader.execute_live(orders, broker)]
        else:
            trader.execute_paper(orders, state)
            lines += [f"- Сделка (бумага): {t} {s} {q} шт по {p:.2f}" for t, s, q, p in orders]
        if not orders:
            lines.append("- Портфель уже соответствует цели, сделок нет")
        state["month"] = month
    elif target is None:
        pass
    else:
        lines.append("- Не день ребалансировки: только контроль риска")

    with open(STATE_FILE, "w") as f:
        json.dump(state, f, ensure_ascii=False, indent=1)
    with open(JOURNAL, "a") as f:
        f.write("\n".join(lines) + "\n")
    print("\n".join(lines))


if __name__ == "__main__":
    main()
