import type { Metadata } from 'next';
import { getServerSession } from 'next-auth';
import { prisma } from '@specai/database';
import { BookingStatusBadge, Card, StatusBadge } from '@specai/ui';
import { authOptions } from '@/lib/auth';
import { NewEquipmentForm } from '@/components/NewEquipmentForm';
import { BookingActionButtons } from '@/components/BookingActionButtons';
import { formatMoney } from '@/lib/money';
import { CallbackForm } from '@/components/CallbackForm';
import { SITE } from '@/lib/site';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Поставщикам техники',
  description: `Сдавайте спецтехнику в аренду через ${SITE.name}: заявки клиентов, бронирования, ИИ-помощник.`,
};

const PROVIDER_BENEFITS = [
  {
    icon: '📥',
    title: 'Заявки клиентов',
    text: 'Клиенты публикуют задачи — вы предлагаете свою технику и цену.',
  },
  {
    icon: '🗓️',
    title: 'Бронирования онлайн',
    text: 'Подтверждайте брони и следите за загрузкой парка в одном кабинете.',
  },
  {
    icon: '🤖',
    title: 'ИИ заполнит карточку',
    text: 'Вставьте текст из паспорта техники — ИИ разложит характеристики по полям.',
  },
  {
    icon: '💸',
    title: 'Бесплатное размещение',
    text: 'Регистрация и размещение техники ничего не стоят.',
  },
];

function ProviderLanding({ signedIn }: { signedIn: boolean }) {
  return (
    <div className="flex flex-col gap-8">
      <section className="rounded-3xl bg-slate-900 p-6 text-white sm:p-10">
        <div className="text-sm font-semibold uppercase tracking-widest text-amber-400">
          Для владельцев техники
        </div>
        <h1 className="mt-2 text-3xl font-bold sm:text-4xl">
          Сдавайте спецтехнику в аренду без простоев
        </h1>
        <p className="mt-3 max-w-2xl text-slate-300">
          Разместите парк на {SITE.name} и получайте заказы от клиентов из Казани и Татарстана.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          {signedIn ? (
            <p className="rounded-md bg-white/10 px-4 py-3 text-sm">
              Вы вошли как клиент. Чтобы размещать технику, зарегистрируйте отдельный аккаунт
              поставщика.
            </p>
          ) : (
            <>
              <a
                href="/register"
                className="rounded-md bg-amber-600 px-6 py-3 font-semibold text-white hover:bg-amber-500"
              >
                Зарегистрироваться как поставщик
              </a>
              <a
                href="/login?callbackUrl=/provider"
                className="rounded-md px-6 py-3 font-semibold ring-1 ring-white/30 hover:bg-white/10"
              >
                Войти
              </a>
            </>
          )}
        </div>
      </section>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {PROVIDER_BENEFITS.map((benefit) => (
          <Card key={benefit.title}>
            <div className="text-3xl">{benefit.icon}</div>
            <h2 className="mt-2 font-semibold">{benefit.title}</h2>
            <p className="mt-1 text-sm text-slate-600">{benefit.text}</p>
          </Card>
        ))}
      </div>
      <Card className="p-6">
        <CallbackForm
          source="provider"
          title="Есть вопросы по размещению?"
          subtitle="Оставьте телефон — расскажем, как начать получать заказы."
        />
      </Card>
    </div>
  );
}

const PROVIDER_ALLOWED_TRANSITIONS: Record<string, string[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['ACTIVE', 'CANCELLED'],
  ACTIVE: ['COMPLETED'],
};

export default async function ProviderPage() {
  const session = await getServerSession(authOptions);

  if (!session || session.user.role !== 'PROVIDER_ADMIN' || !session.user.companyId) {
    return <ProviderLanding signedIn={Boolean(session)} />;
  }

  const [equipment, bookings] = await Promise.all([
    prisma.equipment.findMany({
      where: { companyId: session.user.companyId },
      include: { category: true },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.booking.findMany({
      where: { equipment: { companyId: session.user.companyId } },
      include: { equipment: true, customer: true },
      orderBy: { createdAt: 'desc' },
      take: 30,
    }),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-2xl font-bold">Кабинет поставщика</h1>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Ваша техника</h2>
        {equipment.length === 0 ? (
          <p className="text-sm text-slate-600">Техника пока не добавлена.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {equipment.map((item) => (
              <Card key={item.id} className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{item.name}</p>
                  <p className="text-sm text-slate-500">
                    {item.category.name} · {formatMoney(item.dailyRate, item.currency)}/сутки
                  </p>
                </div>
                <StatusBadge status={item.status} />
              </Card>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Добавить технику</h2>
        <Card className="max-w-xl">
          <NewEquipmentForm />
        </Card>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Бронирования</h2>
        {bookings.length === 0 ? (
          <p className="text-sm text-slate-600">Бронирований пока нет.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {bookings.map((booking) => (
              <Card key={booking.id} className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-medium">{booking.equipment.name}</p>
                  <p className="text-sm text-slate-500">
                    {booking.customer.name} · {booking.startDate.toLocaleDateString('ru-RU')} –{' '}
                    {booking.endDate.toLocaleDateString('ru-RU')} ·{' '}
                    {formatMoney(booking.totalPrice, booking.currency)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <BookingStatusBadge status={booking.status} />
                  <BookingActionButtons
                    bookingId={booking.id}
                    availableTransitions={PROVIDER_ALLOWED_TRANSITIONS[booking.status] ?? []}
                  />
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
