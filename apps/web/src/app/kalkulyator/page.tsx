import type { Metadata } from 'next';
import { WorkCalculator } from '@/components/WorkCalculator';
import { fromPrice, MIN_RATE } from '@/lib/prices';

export const metadata: Metadata = {
  title: 'Калькулятор: сколько стоит моя работа — аренда техники с машинистом',
  description: `Выберите работу, технику и часы — посчитаем ориентировочную стоимость с машинистом СпецПласт16 (${fromPrice(MIN_RATE)}). Результат — в Telegram одной кнопкой.`,
  alternates: { canonical: '/kalkulyator' },
};

export default function CalculatorPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="eyebrow text-amber-700">Калькулятор</div>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">
          Сколько стоит моя работа
        </h1>
        <p className="mt-2 max-w-2xl text-slate-600">
          Три шага: работа, техника, часы. Цены — с машинистом, своя техника СпецПласт16.
        </p>
      </div>
      <WorkCalculator />
    </div>
  );
}
