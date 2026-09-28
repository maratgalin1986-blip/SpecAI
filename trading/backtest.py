"""Honest backtest of strategy.py on real MOEX daily data.

Includes commission + slippage and a cash yield. Excludes dividends for both the
strategy and the benchmark (IMOEX price index), so the comparison is fair.
Survivorship bias: the universe is today's list of blue chips, which flatters
the result somewhat. Treat the numbers as an upper bound, not a promise.

Usage: python3 backtest.py [start_year]
"""

import sys

from moex import daily_closes
from strategy import SMA_DAYS, UNIVERSE, adjusted, target_weights

FEE = 0.0005 + 0.0005  # broker commission + slippage per side
# Money-market fund yield ≈ average CBR key rate of the year minus ~1%.
# 2026 is an estimate; update it as the year goes.
KEY_RATE = {
    2014: 8.5, 2015: 12.5, 2016: 10.5, 2017: 9.0, 2018: 7.4, 2019: 7.3, 2020: 5.0,
    2021: 5.8, 2022: 10.6, 2023: 9.9, 2024: 17.5, 2025: 19.0, 2026: 15.0,
}


def cash_yield(day):
    return (KEY_RATE.get(int(day[:4]), 8.0) - 1) / 100


def run(start="2014-01-01"):
    idx = daily_closes("IMOEX", start, index=True)
    dates = [d for d, _ in idx]
    idx_close = dict(idx)
    prices = {}
    for t in UNIVERSE:
        raw = dict(daily_closes(t, start))
        # Forward-fill onto the index calendar.
        series, last = [], None
        for d in dates:
            last = raw.get(d, last)
            series.append(last)
        first = next((i for i, v in enumerate(series) if v), None)
        if first is None:
            continue
        adj = adjusted(series[first:])
        prices[t] = [None] * first + adj

    equity, cash_only, weights, curve = 1.0, 1.0, {}, []
    month = None
    for i in range(1, len(dates)):
        # Mark to market with yesterday's weights.
        day_ret = sum(w * (prices[t][i] / prices[t][i - 1] - 1) for t, w in weights.items())
        cy = cash_yield(dates[i]) / 252
        cash_w = 1 - sum(weights.values())
        day_ret += cash_w * cy
        equity *= 1 + day_ret
        cash_only *= 1 + cy
        # Drift weights.
        if weights:
            grown = {t: w * prices[t][i] / prices[t][i - 1] for t, w in weights.items()}
            total = sum(grown.values()) + cash_w * (1 + cy)
            weights = {t: w / total for t, w in grown.items()}

        m = dates[i][:7]
        if m != month and i >= SMA_DAYS:
            month = m
            idx_hist = [idx_close[d] for d in dates[: i + 1]]
            hist = {t: [p for p in s[: i + 1] if p] for t, s in prices.items() if s[i]}
            new, _ = target_weights(idx_hist, hist)
            turnover = sum(abs(new.get(t, 0) - weights.get(t, 0)) for t in set(new) | set(weights))
            equity *= 1 - turnover * FEE
            weights = new
        curve.append((dates[i], equity, idx_close[dates[i]], cash_only))
    return curve


def stats(values, days):
    years = days / 252
    cagr = (values[-1] / values[0]) ** (1 / years) - 1
    peak, mdd = values[0], 0
    for v in values:
        peak = max(peak, v)
        mdd = min(mdd, v / peak - 1)
    return cagr, mdd


if __name__ == "__main__":
    start = f"{sys.argv[1]}-01-01" if len(sys.argv) > 1 else "2014-01-01"
    curve = run(start)[SMA_DAYS:]
    print(f"Период: {curve[0][0]} — {curve[-1][0]}  (без дивидендов, с комиссией)")
    for name, col in (("Стратегия", 1), ("IMOEX", 2), ("Фонд денежного рынка", 3)):
        vals = [row[col] for row in curve]
        cagr, mdd = stats(vals, len(vals))
        print(f"{name:21} {cagr:+6.1%} в год, макс. просадка {mdd:6.1%}, итог ×{vals[-1] / vals[0]:.2f}")
    print("\nПо годам: стратегия / IMOEX / денежный рынок")
    by_year = {}
    for row in curve:
        by_year.setdefault(row[0][:4], [row, row])[1] = row
    for y, (a, b) in by_year.items():
        print(f"  {y}: {b[1] / a[1] - 1:+6.1%} / {b[2] / a[2] - 1:+6.1%} / {b[3] / a[3] - 1:+6.1%}")
