import type { ReactNode } from 'react';
import type { FeedTone } from '@/lib/adminFeed';

// Building blocks of the CRM-style admin (/admin/*): coloured tags, stat
// tiles and page headers in the cabinet palette (graphite + signal; see
// globals.css «Cabinets»). Server-safe, no state.

export type TagTone = FeedTone | 'strong' | 'warn' | 'quiet' | 'accent';

const TAG_CLASSES: Record<TagTone, string> = {
  // The good mark: dark chip with signal text, as «Проверен» elsewhere.
  strong: 'bg-graphite-900 text-signal-300',
  accent: 'bg-signal-100 text-signal-800',
  signal: 'bg-signal-100 text-signal-800',
  warn: 'bg-amber-100 text-amber-900',
  amber: 'bg-amber-100 text-amber-900',
  red: 'bg-red-100 text-red-800',
  green: 'bg-emerald-100 text-emerald-800',
  graphite: 'bg-graphite-100 text-graphite-800',
  quiet: 'border border-graphite-200 bg-white text-graphite-600',
};

export function AdminTag({
  tone = 'graphite',
  children,
  title,
}: {
  tone?: TagTone;
  children: ReactNode;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={`inline-flex items-center whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-bold leading-4 ${TAG_CLASSES[tone]}`}
    >
      {children}
    </span>
  );
}

export function StatTile({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: 'default' | 'dark';
}) {
  return (
    <div
      className={
        tone === 'dark'
          ? 'rounded-xl bg-graphite-900 px-4 py-3 text-white'
          : 'rounded-xl border border-graphite-100 bg-white px-4 py-3'
      }
    >
      <p
        className={`text-[0.7rem] font-bold uppercase tracking-[0.12em] ${
          tone === 'dark' ? 'text-signal-300' : 'text-graphite-500'
        }`}
      >
        {label}
      </p>
      <p className="mt-1 font-mono text-2xl font-bold tabular-nums leading-none">{value}</p>
      {hint && (
        <p
          className={`mt-1.5 text-xs ${tone === 'dark' ? 'text-graphite-300' : 'text-graphite-500'}`}
        >
          {hint}
        </p>
      )}
    </div>
  );
}

export function AdminPageHeader({
  title,
  text,
  children,
}: {
  title: string;
  text?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold text-graphite-950">{title}</h1>
        {text && <p className="mt-1 text-sm text-graphite-600">{text}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

/** A row of chips where exactly one is on (filters, periods, tabs). */
export function chipClass(active: boolean): string {
  return active
    ? 'inline-flex min-h-[32px] items-center gap-1 rounded-full bg-graphite-900 px-3 text-xs font-bold text-white'
    : 'inline-flex min-h-[32px] items-center gap-1 rounded-full border border-graphite-200 bg-white px-3 text-xs font-semibold text-graphite-700 hover:border-graphite-800';
}
