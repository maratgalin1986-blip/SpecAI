"""Analyst: reads the market and proposes target weights with reasons."""

from datetime import date, timedelta

from moex import daily_closes
from strategy import UNIVERSE, adjusted, target_weights


def propose():
    start = (date.today() - timedelta(days=500)).isoformat()
    idx = [c for _, c in daily_closes("IMOEX", start, index=True)]
    hist, last = {}, {}
    for t in UNIVERSE:
        closes = [c for _, c in daily_closes(t, start)]
        if closes:
            hist[t] = adjusted(closes)
            last[t] = closes[-1]
    weights, why = target_weights(idx, hist)
    return weights, why, last
