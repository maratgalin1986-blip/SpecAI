"""Risk manager: has a veto over everything the analyst proposes.

Hard rules, not negotiable by other agents:
- a STOP file in memory/ halts all trading (the owner's red button);
- drawdown from the peak beyond MAX_DRAWDOWN halts trading until a human
  deletes memory/STOP;
- only long positions, no leverage, no single name above MAX_POSITION;
- the agents manage at most TRADING_CAPITAL rubles, never the whole account.
"""

import os

MAX_DRAWDOWN = 0.15
MAX_POSITION = 0.25
MEMORY = os.path.join(os.path.dirname(os.path.dirname(__file__)), "memory")
STOP_FILE = os.path.join(MEMORY, "STOP")


def check(weights, equity, state):
    notes = []
    if os.path.exists(STOP_FILE):
        return None, ["Стоп-кран включён (memory/STOP) — торговля остановлена"]

    state["peak"] = max(state.get("peak", equity), equity)
    dd = equity / state["peak"] - 1
    notes.append(f"Капитал {equity:,.0f} ₽, пик {state['peak']:,.0f} ₽, просадка {dd:.1%}")
    if dd <= -MAX_DRAWDOWN:
        with open(STOP_FILE, "w") as f:
            f.write(f"Просадка {dd:.1%} превысила лимит {MAX_DRAWDOWN:.0%}. Удалите файл, чтобы продолжить.\n")
        return {}, notes + ["Лимит просадки превышен → всё продаём, торговля остановлена до решения владельца"]

    clean = {t: min(w, MAX_POSITION) for t, w in weights.items() if w > 0}
    if sum(clean.values()) > 1:
        k = 1 / sum(clean.values())
        clean = {t: w * k for t, w in clean.items()}
    return clean, notes
