import { Button, Card } from '@specai/ui';

export default function HomePage() {
  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4">
        <h1 className="text-3xl font-bold tracking-tight">Подберите нужную спецтехнику быстрее.</h1>
        <p className="max-w-2xl text-slate-600">
          SpecAI подбирает экскаваторы, краны и другую спецтехнику под конкретную строительную
          задачу, используя ИИ-ассистента для рекомендаций и автоматического извлечения технических
          характеристик из объявлений поставщиков.
        </p>
        <div>
          <a href="/equipment">
            <Button>Смотреть технику</Button>
          </a>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <Card>
          <h2 className="font-semibold">Умный подбор</h2>
          <p className="mt-1 text-sm text-slate-600">
            Опишите задачу — получите ранжированные рекомендации техники из доступного парка.
          </p>
        </Card>
        <Card>
          <h2 className="font-semibold">Автоизвлечение характеристик</h2>
          <p className="mt-1 text-sm text-slate-600">
            Поставщик вставляет спецификацию — SpecAI структурирует марку, модель и
            теххарактеристики.
          </p>
        </Card>
        <Card>
          <h2 className="font-semibold">Аренда от заявки до сдачи</h2>
          <p className="mt-1 text-sm text-slate-600">
            Управляйте арендой, договорами и обслуживанием техники в одном месте.
          </p>
        </Card>
      </section>
    </div>
  );
}
