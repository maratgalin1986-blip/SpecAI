import type { Metadata } from 'next';
import { Stroyka } from '@/components/stroyka/Stroyka';
import { SITE } from '@/lib/site';
import { PRICES, rub, ZONES } from '@/lib/stroyka';

export const metadata: Metadata = {
  title: 'Стройка — пройдись по объекту',
  description: `Пройдитесь по стройке ${SITE.name} в 3D: экскаватор-погрузчик копает котлован, автокран монтирует плиты, автовышка работает на фасаде. Закажите технику с машинистом прямо на объекте.`,
  alternates: { canonical: '/stroyka' },
};

export default function StroykaPage() {
  return (
    <>
      {/* For search engines and screen readers; the scene itself is full-screen. */}
      <div className="sr-only">
        <h1>Стройка — пройдись по объекту</h1>
        <p>
          Интерактивная 3D-площадка {SITE.name}: {ZONES.map((z) => z.name).join(', ')}. Аренда
          спецтехники с машинистом в Набережных Челнах: самосвал от {rub(PRICES.truck)} ₽/ч,
          автовышка и трактор от {rub(PRICES.agp)} ₽/ч, автокран от {rub(PRICES.crane)} ₽/ч,
          остальная техника от {rub(PRICES.other)} ₽/ч. Телефон диспетчера: {SITE.phone}.
        </p>
      </div>
      <Stroyka />
    </>
  );
}
