"""Minimal client for Finam Trade API (REST, https://api.finam.ru).

The secret token is read from the FINAM_SECRET environment variable. Never
commit it and never paste it into a chat. Create it in the Finam personal
account: «Торговое API» → «Токены».
"""

import json
import os
import urllib.error
import urllib.parse
import urllib.request
import uuid

BASE = "https://api.finam.ru"


def _dec(v):
    """Finam sends decimals as {"value": "12.3"}."""
    if isinstance(v, dict):
        v = v.get("value")
    return float(v) if v not in (None, "") else 0.0


class Finam:
    def __init__(self, secret: str | None = None, account_id: str | None = None):
        self.secret = secret or os.environ["FINAM_SECRET"]
        self.account_id = account_id or os.environ["FINAM_ACCOUNT_ID"]
        self.token = None

    def _request(self, method, path, body=None, query=None, auth=True):
        url = BASE + path
        if query:
            url += "?" + urllib.parse.urlencode(query)
        headers = {"Content-Type": "application/json"}
        if auth:
            if not self.token:
                self.login()
            headers["Authorization"] = self.token
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(url, data=data, method=method, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.load(resp)
        except urllib.error.HTTPError as e:
            raise RuntimeError(f"Finam {method} {path}: {e.code} {e.read().decode()[:300]}")

    def login(self):
        self.token = self._request("POST", "/v1/sessions", {"secret": self.secret}, auth=False)["token"]

    def account(self):
        return self._request("GET", f"/v1/accounts/{self.account_id}")

    def portfolio(self):
        """Return (equity, {symbol: quantity})."""
        acc = self.account()
        positions = {p["symbol"]: _dec(p.get("quantity")) for p in acc.get("positions", [])}
        return _dec(acc.get("equity")), positions

    def last_price(self, symbol):
        q = self._request("GET", f"/v1/instruments/{symbol}/quotes/latest")["quote"]
        return _dec(q.get("last"))

    def lot_size(self, symbol):
        params = self._request("GET", f"/v1/assets/{symbol}", query={"account_id": self.account_id})
        return int(_dec(params.get("lot_size")) or 1)

    def orders(self):
        return self._request("GET", f"/v1/accounts/{self.account_id}/orders").get("orders", [])

    def place_limit(self, symbol, side, quantity, price, comment="agents"):
        body = {
            "symbol": symbol,
            "quantity": {"value": str(int(quantity))},
            "side": "SIDE_BUY" if side == "buy" else "SIDE_SELL",
            "type": "ORDER_TYPE_LIMIT",
            "time_in_force": "TIME_IN_FORCE_DAY",
            "limit_price": {"value": f"{price:.2f}"},
            "client_order_id": uuid.uuid4().hex[:20],
            "comment": comment,
        }
        return self._request("POST", f"/v1/accounts/{self.account_id}/orders", body)
