"""Public daily candles from the Moscow Exchange ISS API (no token needed).

Used for backtests and as a fallback data source. Results are cached on disk
so repeated runs do not hammer the exchange.
"""

import json
import os
import urllib.request
from datetime import date

CACHE_DIR = os.path.join(os.path.dirname(__file__), ".cache")

SHARE_URL = (
    "https://iss.moex.com/iss/engines/stock/markets/shares/boards/TQBR/"
    "securities/{ticker}/candles.json?interval=24&from={start}&till={till}&start={offset}&iss.meta=off"
)
INDEX_URL = (
    "https://iss.moex.com/iss/engines/stock/markets/index/"
    "securities/{ticker}/candles.json?interval=24&from={start}&till={till}&start={offset}&iss.meta=off"
)


def daily_closes(ticker: str, start: str, till: str | None = None, index: bool = False):
    """Return [(date_str, close)] sorted by date."""
    till = till or date.today().isoformat()
    os.makedirs(CACHE_DIR, exist_ok=True)
    cache = os.path.join(CACHE_DIR, f"{ticker}_{start}_{till}.json")
    if os.path.exists(cache):
        with open(cache) as f:
            return [tuple(r) for r in json.load(f)]

    url_tpl = INDEX_URL if index else SHARE_URL
    rows, offset = [], 0
    while True:
        url = url_tpl.format(ticker=ticker, start=start, till=till, offset=offset)
        with urllib.request.urlopen(url, timeout=30) as resp:
            payload = json.load(resp)["candles"]
        cols, data = payload["columns"], payload["data"]
        if not data:
            break
        ci, bi = cols.index("close"), cols.index("begin")
        rows += [(r[bi][:10], float(r[ci])) for r in data]
        offset += len(data)

    with open(cache, "w") as f:
        json.dump(rows, f)
    return rows
