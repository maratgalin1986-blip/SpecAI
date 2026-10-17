import { Card } from '@specai/ui';
import { AdminTag } from '@/components/admin/AdminUi';
import { ProposalStatusButtons } from '@/components/admin/ProposalStatusButtons';
import { PROPOSAL_KIND_BADGES, proposalContactHref, type ProposalKind } from '@/lib/proposals';

export interface AdminProposalRow {
  id: string;
  kind: string;
  name: string;
  contact: string;
  company: string | null;
  message: string;
  status: string;
  createdAt: Date;
}

function ProposalItem({ proposal }: { proposal: AdminProposalRow }) {
  const href = proposalContactHref(proposal.contact);
  const kind = proposal.kind as ProposalKind;
  return (
    <div className="flex flex-col gap-2 border-t border-slate-100 pt-3 sm:flex-row sm:justify-between">
      <div className="min-w-0 text-sm">
        <p className="flex flex-wrap items-center gap-2">
          <AdminTag tone={kind === 'PARTNERSHIP' ? 'accent' : 'amber'}>
            {PROPOSAL_KIND_BADGES[kind] ?? proposal.kind}
          </AdminTag>
          <span className="font-semibold">{proposal.name}</span>
          {href ? (
            <a href={href} className="break-all font-semibold text-signal-700 hover:underline">
              {proposal.contact}
            </a>
          ) : (
            <span className="break-all">{proposal.contact}</span>
          )}
          {proposal.company && <span className="text-slate-600">· {proposal.company}</span>}
        </p>
        <p className="mt-1 whitespace-pre-wrap break-words">{proposal.message}</p>
        <p className="mt-1 text-xs text-slate-500">
          {proposal.createdAt.toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })}
        </p>
      </div>
      <ProposalStatusButtons id={proposal.id} status={proposal.status} />
    </div>
  );
}

/** «Предложения и партнёрство» in /admin: new on top, read ones folded below. */
export function ProposalsCard({ proposals }: { proposals: AdminProposalRow[] }) {
  const fresh = proposals.filter((proposal) => proposal.status === 'NEW');
  const read = proposals.filter((proposal) => proposal.status === 'READ');
  return (
    <Card className="flex scroll-mt-24 flex-col gap-3" id="proposals">
      <div>
        <h2 className="font-semibold">
          Предложения и партнёрство <span className="text-amber-700">({fresh.length})</span>
        </h2>
        <p className="text-sm text-slate-600">
          Идеи по сервису и предложения о сотрудничестве со страницы «Предложения и партнёрство» и
          из приложения. Ответьте по контакту, затем отметьте «Прочитано» или уберите в архив.
        </p>
      </div>
      {fresh.length === 0 && <p className="text-sm text-slate-500">Новых сообщений нет.</p>}
      {fresh.map((proposal) => (
        <ProposalItem key={proposal.id} proposal={proposal} />
      ))}
      {read.length > 0 && (
        <details>
          <summary className="cursor-pointer text-sm text-slate-600">
            Прочитанные · {read.length}
          </summary>
          <div className="mt-2 flex flex-col gap-3">
            {read.map((proposal) => (
              <ProposalItem key={proposal.id} proposal={proposal} />
            ))}
          </div>
        </details>
      )}
    </Card>
  );
}
