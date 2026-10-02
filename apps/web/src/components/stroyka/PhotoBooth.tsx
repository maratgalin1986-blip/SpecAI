'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { photoCaption, photoFileName, photoLayout } from '@/lib/stroyka/photo';
import { SITE } from '@/lib/site';

type Snap = { url: string; width: number; height: number };

/** Draws the snapshot into a branded frame; resolves to a PNG data URL and blob. */
async function frame(snap: Snap, date: Date) {
  const img = new Image();
  img.src = snap.url;
  await img.decode();
  const L = photoLayout(snap.width, snap.height);
  const canvas = document.createElement('canvas');
  canvas.width = L.width;
  canvas.height = L.height;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, L.width, L.height);
  ctx.fillStyle = '#f59e0b';
  ctx.fillRect(L.pad / 2, L.pad / 2, L.photo.w + L.pad, L.photo.h + L.pad);
  ctx.drawImage(img, L.photo.x, L.photo.y, L.photo.w, L.photo.h);
  const caption = photoCaption(date, window.location.host);
  const top = L.photo.y + L.photo.h + L.pad;
  const size = Math.round(L.band * 0.3);
  // The «16» block, as in the site header.
  const block = Math.round(L.band * 0.62);
  ctx.fillStyle = '#f59e0b';
  ctx.fillRect(L.pad, top + (L.band - L.pad - block) / 2, block, block);
  ctx.fillStyle = '#0f172a';
  ctx.font = `bold ${Math.round(block * 0.5)}px ui-monospace, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('16', L.pad + block / 2, top + (L.band - L.pad) / 2 + 1);
  const x = L.pad + block + Math.round(L.pad * 0.8);
  const maxW = L.width - x - L.pad;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${size}px Arial, sans-serif`;
  ctx.fillText(caption.title, x, top + (L.band - L.pad) * 0.45, maxW);
  ctx.fillStyle = '#cbd5e1';
  ctx.font = `${Math.round(size * 0.68)}px Arial, sans-serif`;
  ctx.fillText(`${caption.date} · ${caption.site}`, x, top + (L.band - L.pad) * 0.85, maxW);
  const url = canvas.toDataURL('image/png');
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  return { url, blob };
}

// «📸 Фото с бригадой»: the current frame in a branded frame, to download or share.
export function PhotoBooth({ snap }: { snap: () => Snap | null }) {
  const [photo, setPhoto] = useState<{ url: string; file: File | null; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const take = async () => {
    const shot = snap();
    if (!shot) return;
    setBusy(true);
    try {
      const now = new Date();
      const { url, blob } = await frame(shot, now);
      const name = photoFileName(now);
      setPhoto({ url, name, file: blob ? new File([blob], name, { type: 'image/png' }) : null });
    } catch {
      // The browser refused to read the canvas: no photo this time.
    } finally {
      setBusy(false);
    }
  };
  const canShare =
    !!photo?.file &&
    typeof navigator !== 'undefined' &&
    !!navigator.canShare?.({ files: [photo.file] });
  const share = async () => {
    if (!photo?.file) return;
    try {
      await navigator.share({ files: [photo.file], title: `${SITE.platform} · ${SITE.name}` });
    } catch {
      // Cancelled.
    }
  };
  return (
    <>
      <button
        type="button"
        data-testid="photo-btn"
        onClick={() => void take()}
        disabled={busy}
        className="rounded-full bg-slate-950/75 px-3 py-1.5 text-xs font-semibold backdrop-blur hover:bg-slate-800 disabled:opacity-60"
      >
        📸 Фото с бригадой
      </button>
      {photo &&
        createPortal(
          <div
            className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4"
            role="dialog"
            aria-label="Фото с бригадой"
            data-testid="photo-dialog"
            onClick={() => setPhoto(null)}
          >
            <div
              className="w-full max-w-xl rounded-2xl bg-slate-900 p-3 text-white shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <img src={photo.url} alt="Фото со стройки" className="w-full rounded-lg" />
              <div className="mt-3 flex flex-wrap gap-2">
                <a
                  href={photo.url}
                  download={photo.name}
                  data-testid="photo-download"
                  className="rounded-full bg-amber-500 px-4 py-2 text-sm font-bold text-slate-950 hover:bg-amber-400"
                >
                  Скачать PNG
                </a>
                {canShare && (
                  <button
                    type="button"
                    onClick={() => void share()}
                    className="rounded-full bg-white/10 px-4 py-2 text-sm font-semibold hover:bg-white/20"
                  >
                    Поделиться
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setPhoto(null)}
                  className="ml-auto rounded-full px-3 py-2 text-sm text-slate-300 hover:text-white"
                >
                  Закрыть
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
