'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { COMMENT_MAX_LENGTH, COMMENT_MIN_LENGTH, type PublicComment } from '@/lib/comments';

/** Approved comments (already masked and with short author names). */
export function CommentList({ comments, empty }: { comments: PublicComment[]; empty?: string }) {
  if (comments.length === 0) {
    return empty ? <p className="text-sm text-slate-500">{empty}</p> : null;
  }
  return (
    <ul className="flex flex-col divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">
      {comments.map((comment) => (
        <li key={comment.id} className="px-4 py-3 text-sm">
          <p className="whitespace-pre-line break-words text-slate-700">{comment.text}</p>
          <p className="mt-1 text-xs text-slate-500">
            {comment.authorName}
            {comment.authorCompany ? ` · ${comment.authorCompany}` : ''} ·{' '}
            {new Date(comment.createdAt).toLocaleDateString('ru-RU')}
          </p>
        </li>
      ))}
    </ul>
  );
}

/**
 * A comment about a provider company (`targetCompanyId`) or a customer
 * (`targetUserId`). It goes to moderation; the author sees that right away.
 */
export function CommentForm({
  targetCompanyId,
  targetUserId,
  label,
  compact = false,
}: {
  targetCompanyId?: string;
  targetUserId?: string;
  label: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const fieldId = useId();
  const [open, setOpen] = useState(!compact);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<string | null>(null);

  if (sent) return <p className="text-sm text-emerald-700">{sent}</p>;
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-fit text-sm font-medium text-amber-700 underline"
      >
        {label}
      </button>
    );
  }

  const length = text.trim().length;
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={async (event) => {
        event.preventDefault();
        setError(null);
        setBusy(true);
        const response = await fetch('/api/comments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, targetCompanyId, targetUserId }),
        }).catch(() => null);
        const body = await response?.json().catch(() => null);
        setBusy(false);
        if (!response?.ok) {
          setError(typeof body?.error === 'string' ? body.error : 'Не удалось отправить');
          return;
        }
        setSent(body?.message ?? 'Комментарий отправлен на проверку');
        router.refresh();
      }}
    >
      <label className="text-sm font-medium" htmlFor={fieldId}>
        {label}
      </label>
      <textarea
        id={fieldId}
        rows={3}
        maxLength={COMMENT_MAX_LENGTH}
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="Как прошла работа: сроки, техника, общение. Телефоны и ссылки будут скрыты."
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
      />
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        <span>
          {length}/{COMMENT_MAX_LENGTH} · от {COMMENT_MIN_LENGTH} символов · публикуется после
          проверки
        </span>
        <button
          type="submit"
          disabled={busy || length < COMMENT_MIN_LENGTH}
          className="rounded-md bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50"
        >
          {busy ? 'Отправка…' : 'Отправить'}
        </button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}

/** Admin: publish or reject a pending comment. */
export function CommentModerationButtons({ commentId }: { commentId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const act = async (status: 'APPROVED' | 'REJECTED') => {
    setBusy(true);
    setError(null);
    const response = await fetch(`/api/admin/comments/${commentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    }).catch(() => null);
    setBusy(false);
    if (!response?.ok) {
      setError('Не удалось сохранить');
      return;
    }
    router.refresh();
  };
  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => act('APPROVED')}
          className="rounded-md bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          Опубликовать
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => act('REJECTED')}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-50"
        >
          Отклонить
        </button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
