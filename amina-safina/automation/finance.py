#!/usr/bin/env python3
"""Финмодель AMINA SAFINA: сценарии 20/50/100/200/500 платящих. Не прогноз, а расчёт.
Параметры комиссий — из reports/platforms-check.md; меняйте через аргументы.
Запуск: python3 automation/finance.py [--fee 0.10] [--acq 0.0] [--tax 0.04] [--mix 0.6,0.3,0.1]
"""
import argparse

TIERS = {"Базовый": 149, "Расширенный": 299, "VIP": 499}

def model(n, mix, fee, acq, tax, costs):
    gross = sum(n * share * price for share, price in zip(mix, TIERS.values()))
    platform = gross * fee
    processing = gross * acq
    payout = gross - platform - processing
    taxes = payout * tax  # НПД считается от поступившей суммы
    net = payout - taxes - costs
    return gross, platform + processing, taxes, costs, net

def main(argv=None):
    p = argparse.ArgumentParser()
    p.add_argument("--fee", type=float, default=0.10, help="комиссия площадки")
    p.add_argument("--acq", type=float, default=0.0, help="эквайринг/вывод сверх комиссии")
    p.add_argument("--tax", type=float, default=0.04, help="НПД 4% (физлица) / 6% (юрлица)")
    p.add_argument("--mix", default="0.6,0.3,0.1", help="доли тарифов 149/299/499")
    p.add_argument("--costs", type=float, default=1000, help="ежемесячные расходы, ₽")
    a = p.parse_args(argv)
    mix = [float(x) for x in a.mix.split(",")]
    assert len(mix) == 3 and abs(sum(mix) - 1) < 1e-6, "mix должен давать 1.0"
    print(f"| Платящих | Оборот ₽/мес | Комиссии | Налог | Расходы | Чистая прибыль |")
    print("|---|---|---|---|---|---|")
    for n in (20, 50, 100, 200, 500):
        r = model(n, mix, a.fee, a.acq, a.tax, a.costs)
        print("| " + " | ".join([str(n)] + [f"{v:,.0f}".replace(",", " ") for v in r]) + " |")

if __name__ == "__main__":
    main()
