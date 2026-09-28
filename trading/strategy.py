"""Trend + momentum rotation on liquid Russian blue chips.

Rules (checked once a month):
1. Market filter: IMOEX above its 200-day average, otherwise everything goes to cash.
2. Rank shares by 6-month return; keep only those above their own 200-day average
   and with positive momentum.
3. Hold the top N in equal weights. The rest stays in cash (money-market fund).

Shared by the backtest and the live agents so both run exactly the same logic.
"""

UNIVERSE = [
    "SBER", "GAZP", "LKOH", "GMKN", "NVTK", "ROSN", "TATN", "SNGSP", "PLZL", "MGNT",
    "MTSS", "CHMF", "NLMK", "ALRS", "MOEX", "PHOR", "AFLT", "IRAO", "HYDR", "RTKM",
]
TOP_N = 4
SMA_DAYS = 200
MOMENTUM_DAYS = 126


def adjusted(closes):
    """Rebuild a price series from daily returns, dropping split jumps (|r| > 40%).

    ISS candles are not split-adjusted (GMKN 1:100 in 2024, for example)."""
    out = [closes[0]]
    for prev, cur in zip(closes, closes[1:]):
        r = cur / prev - 1
        out.append(out[-1] * (1 + (0 if abs(r) > 0.4 else r)))
    return out


def sma(series, n):
    return sum(series[-n:]) / n


def target_weights(index_hist, share_hist, top_n=TOP_N):
    """index_hist: [close]; share_hist: {ticker: [adjusted close]} up to today.

    Returns ({ticker: weight}, explanation lines)."""
    why = []
    if len(index_hist) < SMA_DAYS:
        return {}, ["мало истории индекса"]
    idx_ma = sma(index_hist, SMA_DAYS)
    if index_hist[-1] < idx_ma:
        why.append(f"IMOEX {index_hist[-1]:.0f} ниже 200-дневной средней {idx_ma:.0f} → всё в кэш")
        return {}, why
    why.append(f"IMOEX {index_hist[-1]:.0f} выше 200-дневной средней {idx_ma:.0f} → рынок в тренде")

    ranked = []
    for t, h in share_hist.items():
        if len(h) < max(SMA_DAYS, MOMENTUM_DAYS + 1):
            continue
        mom = h[-1] / h[-MOMENTUM_DAYS - 1] - 1
        if mom > 0 and h[-1] > sma(h, SMA_DAYS):
            ranked.append((mom, t))
    ranked.sort(reverse=True)
    picks = [t for _, t in ranked[:top_n]]
    for mom, t in ranked[:top_n]:
        why.append(f"{t}: импульс за 6 мес {mom:+.1%}, выше своей 200-дневной средней")
    if not picks:
        why.append("нет акций в восходящем тренде → кэш")
    # Fixed slot size: an empty slot stays in cash instead of doubling another stake.
    return {t: 1 / top_n for t in picks}, why
