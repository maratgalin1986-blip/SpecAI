import { Card } from '@specai/ui';
import {
  FUNNEL_AGENTS,
  funnelAgentTitle,
  funnelNotes,
  funnelRows,
  type FunnelCell,
  type FunnelData,
} from '@/lib/office/funnel';

// Воронка офиса для /admin/office (S10): этапы по строкам, агенты по столбцам, доля — от
// «написали». Данные собирает страница: `collectFunnel(prisma, now)` из lib/office/funnel.ts.
// Серверный компонент, без состояния.

function Cell({ cell }: { cell: FunnelCell | null }) {
  if (!cell) {
    return (
      <span className="text-graphite-400" aria-label="нет такого этапа">
        —
      </span>
    );
  }
  return (
    <>
      <span className="font-mono font-bold tabular-nums text-graphite-950">{cell.count}</span>
      {cell.share && (
        <span className="ml-1.5 font-mono text-xs tabular-nums text-graphite-500">
          {cell.share}
        </span>
      )}
    </>
  );
}

export function OfficeFunnel({ data }: { data: FunnelData }) {
  const rows = funnelRows(data);
  const notes = funnelNotes(data);
  return (
    <Card className="flex flex-col gap-3">
      <div>
        <h2 className="text-lg font-bold text-graphite-950">Воронка</h2>
        <p className="mt-1 text-xs text-graphite-600">
          За всё время. Доля — сколько из тех, кому написали, дошли до этапа.
        </p>
      </div>
      <div className="-mx-4 overflow-x-auto px-4">
        <table className="w-full min-w-[420px] border-collapse text-sm">
          <thead className="text-[11px] uppercase tracking-wide text-graphite-500">
            <tr>
              <th
                scope="col"
                className="border-b border-graphite-100 px-2 py-2 text-left font-bold"
              >
                Этап
              </th>
              {FUNNEL_AGENTS.map((agent) => (
                <th
                  key={agent}
                  scope="col"
                  className="border-b border-graphite-100 px-2 py-2 text-right font-bold"
                >
                  {funnelAgentTitle(agent)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.stage} className="border-b border-graphite-100 last:border-0">
                <th scope="row" className="px-2 py-2 text-left font-normal">
                  <span className="font-semibold text-graphite-900">{row.title}</span>
                  <span className="block text-xs text-graphite-500">{row.hint}</span>
                </th>
                {FUNNEL_AGENTS.map((agent) => (
                  <td key={agent} className="whitespace-nowrap px-2 py-2 text-right">
                    <Cell cell={row.cells[agent]} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="flex flex-col gap-1 text-sm text-graphite-800">
        {notes.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
    </Card>
  );
}
