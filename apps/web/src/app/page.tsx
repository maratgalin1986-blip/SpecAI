import { Button, Card } from '@specai/ui';

export default function HomePage() {
  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4">
        <h1 className="text-3xl font-bold tracking-tight">
          Rent the right heavy equipment, faster.
        </h1>
        <p className="max-w-2xl text-slate-600">
          SpecAI matches construction jobs to available excavators, cranes, and other heavy
          equipment nearby, using an AI assistant to recommend the right fit and extract specs
          automatically from provider listings.
        </p>
        <div>
          <a href="/equipment">
            <Button>Browse equipment</Button>
          </a>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <Card>
          <h2 className="font-semibold">Smart matching</h2>
          <p className="mt-1 text-sm text-slate-600">
            Describe the job and get ranked equipment recommendations from available inventory.
          </p>
        </Card>
        <Card>
          <h2 className="font-semibold">Automatic spec extraction</h2>
          <p className="mt-1 text-sm text-slate-600">
            Providers paste a spec sheet; SpecAI structures make, model, and technical specs.
          </p>
        </Card>
        <Card>
          <h2 className="font-semibold">End-to-end bookings</h2>
          <p className="mt-1 text-sm text-slate-600">
            Manage rentals, contracts, and maintenance records in one place.
          </p>
        </Card>
      </section>
    </div>
  );
}
