'use client';

import { useState } from 'react';
import type { LeadStatus } from '@specai/shared';
import { LeadOutcome } from '@/components/LeadOutcome';
import { LeadStatusSelect } from '@/components/LeadStatusSelect';
import { LeadCrmFields } from '@/components/LeadCrmFields';

// The editable side of a lead card on /admin/leads. Keeps the status in one
// place so that a call-back set below is reflected in the select above.

export function LeadCrmControls({
  id,
  status,
  outcome,
  amount,
  city,
  callAt,
  note,
}: {
  id: string;
  status: LeadStatus;
  outcome: string | null;
  amount: number | null;
  city: string | null;
  callAt: Date | null;
  note: string | null;
}) {
  const [current, setCurrent] = useState<LeadStatus>(status);
  return (
    <div className="flex w-full flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <LeadStatusSelect key={current} id={id} status={current} />
        <LeadOutcome id={id} outcome={outcome} amount={amount} />
      </div>
      <LeadCrmFields
        id={id}
        city={city}
        callAt={callAt}
        note={note}
        onStatusChange={(next) => {
          if (next === 'NEW' || next === 'IN_PROGRESS' || next === 'DONE') setCurrent(next);
        }}
      />
    </div>
  );
}
