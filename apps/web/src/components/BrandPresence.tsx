'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { awayTitle, COPY_SOURCE_LINE, keepsTitle, withCopySource } from '@/lib/brandMoments';

// Two quiet brand moments, nothing drawn on screen:
// - while the visitor looks at another tab, ours says «🚜 Экскаватор ждёт ·
//   СпецПласт16»; the page's own title comes back on return;
// - long passages copied from the site (over 200 characters) get a short
//   source line. Phones, prices, form fields and short text are left alone.
export function BrandPresence() {
  const pathname = usePathname() ?? '/';

  useEffect(() => {
    if (keepsTitle(pathname)) return;
    let saved: string | null = null;
    let shown: string | null = null;
    const restore = () => {
      // Only if nothing else changed the title meanwhile.
      if (saved !== null && document.title === shown) document.title = saved;
      saved = shown = null;
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        if (saved === null) saved = document.title;
        shown = awayTitle(pathname);
        document.title = shown;
      } else {
        restore();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      restore();
    };
  }, [pathname]);

  useEffect(() => {
    // Legal texts (consent, policy) are copied exactly as they are.
    if (keepsTitle(pathname)) return;
    const onCopy = (event: ClipboardEvent) => {
      const target = event.target as Element | null;
      // The visitor's own text in a form field is theirs.
      if (target?.closest?.('input, textarea, [contenteditable="true"]')) return;
      const selection = window.getSelection();
      const text = selection?.toString() ?? '';
      const next = withCopySource(text);
      if (next === text || !event.clipboardData || !selection?.rangeCount) return;
      // Keep the formatting for rich pastes (mail, documents) as well.
      const box = document.createElement('div');
      for (let i = 0; i < selection.rangeCount; i++) {
        box.appendChild(selection.getRangeAt(i).cloneContents());
      }
      const line = document.createElement('p');
      line.textContent = COPY_SOURCE_LINE;
      box.appendChild(line);
      event.clipboardData.setData('text/plain', next);
      event.clipboardData.setData('text/html', box.innerHTML);
      event.preventDefault();
    };
    document.addEventListener('copy', onCopy);
    return () => document.removeEventListener('copy', onCopy);
  }, [pathname]);

  return null;
}
