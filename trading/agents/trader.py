"""Trader: turns target weights into orders.

paper mode — fills are simulated at the last close and kept in memory/state.json;
live mode  — limit orders go to Finam at last price ± 0.2%.
"""

SLIPPAGE = 0.002


def plan(target, equity, holdings, prices, lots):
    """Return [(ticker, side, qty, price)] — sells first, so buys have cash."""
    orders = []
    for t in sorted(set(target) | set(holdings)):
        price = prices.get(t)
        if not price:
            continue
        lot = lots.get(t, 1)
        want = int(target.get(t, 0) * equity / price / lot) * lot
        have = int(holdings.get(t, 0))
        if want != have:
            side = "buy" if want > have else "sell"
            orders.append((t, side, abs(want - have), price))
    return sorted(orders, key=lambda o: o[1] != "sell")


def execute_paper(orders, state):
    fee = 0.0005
    pos = state.setdefault("positions", {})
    for t, side, qty, price in orders:
        amount = qty * price
        if side == "buy":
            state["cash"] -= amount * (1 + fee)
            pos[t] = pos.get(t, 0) + qty
        else:
            state["cash"] += amount * (1 - fee)
            pos[t] = pos.get(t, 0) - qty
            if pos[t] == 0:
                del pos[t]


def execute_live(orders, broker):
    results = []
    for t, side, qty, price in orders:
        limit = price * (1 + SLIPPAGE if side == "buy" else 1 - SLIPPAGE)
        r = broker.place_limit(f"{t}@MISX", side, qty, limit)
        results.append(f"{t} {side} {qty} @ {limit:.2f} → {r.get('status', r.get('order_id', 'отправлено'))}")
    return results
