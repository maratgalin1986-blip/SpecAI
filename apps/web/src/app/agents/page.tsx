import type { Metadata } from 'next';
import { PUBLIC_AGENT_PROFILES, agentIdSchema } from '@specai/shared';
import { AgentChat } from '@/components/AgentChat';
import { CinemaHero } from '@/components/CinemaHero';
import { pageMeta } from '@/lib/pageMeta';

export const metadata: Metadata = pageMeta('/agents', {
  title: 'ИИ-агенты',
  // ?agent=<id> preselects an agent: one canonical for every variant.
});

export default async function AgentsPage(props: { searchParams: Promise<{ agent?: string }> }) {
  const searchParams = await props.searchParams;
  const parsed = agentIdSchema.safeParse(searchParams.agent);
  const initialAgent = parsed.success ? parsed.data : 'auto';

  return (
    <div className="flex flex-col gap-6">
      <CinemaHero
        eyebrow="Диспетчерская · круглосуточно"
        title="ИИ-агенты"
        clips={['city-cranes', 'steel-frame']}
        camera={3}
        compact
      >
        <p>
          Выберите специалиста или оставьте «Авто» — ассистент сам передаст вопрос нужному агенту.
        </p>
      </CinemaHero>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <AgentChat key={initialAgent} initialAgent={initialAgent} />
        </div>

        <aside className="flex flex-col gap-3">
          {PUBLIC_AGENT_PROFILES.map((agent) => (
            <a
              key={agent.id}
              href={`/agents?agent=${agent.id}`}
              className={`rounded-lg border bg-white p-4 hover:border-amber-400 ${
                agent.id === initialAgent ? 'border-amber-500' : 'border-slate-200'
              }`}
            >
              <div className="text-xs font-semibold uppercase text-amber-700">{agent.role}</div>
              <div className="font-semibold">{agent.name}</div>
              <p className="mt-1 text-sm text-slate-600">{agent.description}</p>
            </a>
          ))}
        </aside>
      </div>
    </div>
  );
}
