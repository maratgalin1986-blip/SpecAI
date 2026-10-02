---
name: refresh-material-prices
description: Refresh the market reference prices of construction materials used by the procurement estimate (/smeta?mode=snab), every two weeks.
---

The client sees «цены СпецПласт16» = reference midpoint × tiered markup (`materialPrice()` in
`apps/web/src/lib/smetaPrices.ts`). Sources and dates live only in that file and are never rendered.

1. For each material in `smetaPrices.ts`, find a price published in the last 14 days for Набережные Челны or
   Татарстан (a seller's own price list with a visible date, or an official source). Record low/high, unit,
   publisher, URL, `publishedAt`, and set `checkedAt` to today.
2. If no dated source from the last 14 days exists, leave the old entry: the site hides prices older than 14
   days by itself and asks the manager to confirm. Never invent numbers.
3. Do not change the markup tiers or the owner's machinery rates.
4. Run `pnpm test` (the price tests) and `site-check`, commit «Refresh material prices <date>», push to the
   site branch, and tell the owner the PR is ready to merge.
