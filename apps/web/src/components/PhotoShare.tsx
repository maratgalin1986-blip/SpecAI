'use client';

import { useState } from 'react';
import {
  PHOTO_MAX_FILES,
  PHOTO_NOTE_MAX,
  PHOTO_PROMPTS,
  type PhotoRole,
  type PhotoStage,
} from '@/lib/photoShare';

// A quiet, optional offer to share photos from the job site. Collapsed to one
// line until the visitor opens it. Photos are shrunk in the browser (which
// also drops EXIF, GPS included) and go to the owner for review.

const MAX_SIDE = 1600;

async function shrink(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.85),
    );
    if (!blob) throw new Error('shrink');
    return blob;
  } catch {
    // The original may carry GPS in EXIF: refuse rather than send it.
    throw new Error('Не удалось обработать фото — попробуйте другое (JPEG или PNG).');
  }
}

export function PhotoShare({
  role,
  stage: initialStage = 'before',
  dark = false,
  startOpen = false,
}: {
  role: PhotoRole;
  stage?: PhotoStage;
  dark?: boolean;
  startOpen?: boolean;
}) {
  const [open, setOpen] = useState(startOpen);
  const [stage, setStage] = useState<PhotoStage>(initialStage);
  const prompt = PHOTO_PROMPTS[role][stage];
  const [files, setFiles] = useState<File[]>([]);
  const [note, setNote] = useState('');
  const [consent, setConsent] = useState(false);
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');
  const [error, setError] = useState('');

  const muted = dark ? 'text-white/60' : 'text-slate-500';
  const input = dark
    ? 'rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/40'
    : 'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm';

  if (state === 'done') {
    return (
      <p className={`text-sm ${muted}`} role="status">
        Спасибо за фото! Посмотрим и, если подойдёт, покажем на сайте.
      </p>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`text-left text-sm underline decoration-dotted underline-offset-4 ${muted} hover:text-amber-500`}
      >
        {prompt.link}
      </button>
    );
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setState('sending');
    setError('');
    const form = new FormData();
    try {
      for (const file of files) form.append('files', await shrink(file), 'site.jpg');
    } catch (problem) {
      setError((problem as Error).message);
      setState('error');
      return;
    }
    form.append('role', role);
    form.append('stage', stage);
    form.append('consent', consent ? '1' : '0');
    if (role === 'client' && note.trim()) form.append('note', note.trim());
    form.append('page', window.location.pathname);
    try {
      const response = await fetch('/api/photos', { method: 'POST', body: form });
      if (response.ok) {
        setState('done');
        return;
      }
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(data?.error ?? 'Не получилось отправить. Попробуйте ещё раз.');
    } catch {
      setError('Нет связи. Попробуйте ещё раз.');
    }
    setState('error');
  }

  return (
    <form onSubmit={submit} className="ym-hide-content flex flex-col gap-3">
      {role === 'executor' && (
        <div className="flex gap-2 text-sm" role="radiogroup" aria-label="Когда снято">
          {(['before', 'after'] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={stage === value}
              onClick={() => setStage(value)}
              className={`rounded-full px-3 py-1 ${
                stage === value ? 'bg-amber-500 text-slate-950' : `ring-1 ring-slate-300 ${muted}`
              }`}
            >
              {value === 'before' ? 'До работ' : 'После работ'}
            </button>
          ))}
        </div>
      )}
      <p className={`text-sm ${muted}`}>{prompt.text} Лучше без лиц и номеров машин.</p>
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        aria-label="Фото с объекта"
        onChange={(event) =>
          setFiles(Array.from(event.target.files ?? []).slice(0, PHOTO_MAX_FILES))
        }
        className={`text-sm ${muted}`}
      />
      {role === 'client' && (
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          maxLength={PHOTO_NOTE_MAX}
          rows={2}
          placeholder="Пара слов об объекте — необязательно"
          aria-label="Комментарий к фото"
          className={input}
        />
      )}
      <label className={`flex items-start gap-2 text-sm ${muted}`}>
        <input
          type="checkbox"
          checked={consent}
          onChange={(event) => setConsent(event.target.checked)}
          className="mt-1"
        />
        Разрешаю опубликовать эти фото на сайте СпецПласт16
      </label>
      {error && (
        <p className={`text-sm ${dark ? 'text-red-300' : 'text-red-700'}`} role="alert">
          {error}
        </p>
      )}
      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={!files.length || !consent || state === 'sending'}
          className="inline-flex min-h-11 items-center rounded-full bg-amber-500 px-5 text-sm font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-50"
        >
          {state === 'sending' ? 'Отправляем…' : 'Отправить фото'}
        </button>
        <button type="button" onClick={() => setOpen(false)} className={`text-sm ${muted}`}>
          Не сейчас
        </button>
      </div>
    </form>
  );
}
