"""A council of trading agents that discuss every trade before it happens.

Each agent looks at the same recent bars and says what it thinks, with a reason.
Signal agents vote; the cost and risk agents can veto. A trade happens only when
the signal agents agree and nobody vetoes. Every opinion goes to the journal.

The agents are plain rules, not language-model calls: an LLM call per decision
would cost more than a 3000 ₽ account can earn.
"""

from dataclasses import dataclass

# Costs per side, in fractions. Put your Finam tariff here (see README).
COMMISSION = 0.0005
SLIPPAGE = 0.0005  # half the spread + market-order slippage on liquid blue chips
ROUND_TRIP = 2 * (COMMISSION + SLIPPAGE)
MIN_EDGE = 10.0  # expected move must cover the round trip this many times; 3 and 6 lost money in the backtest


@dataclass
class Opinion:
    agent: str
    vote: int  # +1 buy, 0 abstain, -1 against; veto agents use -9
    reason: str


def ema(xs, n):
    k, out = 2 / (n + 1), xs[0]
    for x in xs[1:]:
        out = x * k + out * (1 - k)
    return out


def atr(bars, n=14):
    trs = [
        max(h - l, abs(h - pc), abs(l - pc))
        for (_, _, h, l, _, _), (_, _, _, _, pc, _) in zip(bars[-n:], bars[-n - 1 : -1])
    ]
    return sum(trs) / len(trs)


def rsi(closes, n=14):
    gains = losses = 0.0
    for a, b in zip(closes[-n - 1 : -1], closes[-n:]):
        d = b - a
        gains += max(d, 0)
        losses += max(-d, 0)
    return 100.0 if losses == 0 else 100 - 100 / (1 + gains / losses)


def trend_agent(bars):
    c = [b[4] for b in bars]
    fast, slow = ema(c[-40:], 9), ema(c[-80:], 30)
    if fast > slow and c[-1] > fast:
        return Opinion("Трендовик", 1, f"быстрая средняя {fast:.2f} выше медленной {slow:.2f}, цена над ними")
    if fast < slow:
        return Opinion("Трендовик", -1, "тренд вниз, покупать против него не буду")
    return Opinion("Трендовик", 0, "тренда нет")


def skeptic_agent(bars):
    c = [b[4] for b in bars]
    r = rsi(c)
    if r > 72:
        return Opinion("Скептик", -1, f"RSI {r:.0f}: перегрето, поздно заходить")
    if 45 <= r <= 68:
        return Opinion("Скептик", 1, f"RSI {r:.0f}: запас хода есть")
    return Opinion("Скептик", 0, f"RSI {r:.0f}: не убеждён")


def volume_agent(bars):
    v = [b[5] for b in bars]
    avg = sum(v[-40:-1]) / 39
    if avg and v[-1] > 1.3 * avg:
        return Opinion("Объёмщик", 1, f"объём {v[-1] / avg:.1f}× от среднего — движение поддержано")
    return Opinion("Объёмщик", 0, "объём обычный")


def cost_agent(bars):
    """The 'gas' agent: vetoes trades whose expected move does not pay the fees."""
    price = bars[-1][4]
    expected = 1.5 * atr(bars) / price  # take-profit distance
    need = MIN_EDGE * ROUND_TRIP
    if expected < need:
        return Opinion("Кассир", -9, f"ожидаемое движение {expected:.2%} < {need:.2%} (издержки ×{MIN_EDGE:.0f}) — комиссия съест прибыль")
    return Opinion("Кассир", 0, f"ожидаемое движение {expected:.2%} окупает издержки {ROUND_TRIP:.2%}")


def discuss(bars):
    """Return (decision, opinions). decision is True only for a buy."""
    ops = [trend_agent(bars), skeptic_agent(bars), volume_agent(bars), cost_agent(bars)]
    if any(o.vote == -9 for o in ops):
        return False, ops
    signal = [o for o in ops if o.agent != "Кассир"]
    # Trend must agree, nobody against, at least two in favour.
    ok = ops[0].vote == 1 and all(o.vote >= 0 for o in signal) and sum(o.vote for o in signal) >= 2
    return ok, ops


def exits(entry, bars):
    """Stop-loss and take-profit prices for a new position."""
    a = atr(bars)
    return entry - 1.0 * a, entry + 1.5 * a
