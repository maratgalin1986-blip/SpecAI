'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { AgentChat } from '@/components/AgentChat';
import { useJourneyInView } from '@/components/useJourneyInView';

// Floating chat button shown on every page except /agents, which has the
// full-size chat already.
export function AgentChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();
  const inJourney = useJourneyInView(pathname);
  // Hidden over the first screen (the cinema), shown after it.
  const [pastTop, setPastTop] = useState(false);
  useEffect(() => {
    const update = () => setPastTop(window.scrollY >= window.innerHeight * 0.6);
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, []);
  const show = isOpen || (pastTop && !inJourney);

  const toggleRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  // Focus goes back to the toggle when the window closes (Esc, close or toggle).
  useEffect(() => {
    if (wasOpen.current && !isOpen) toggleRef.current?.focus();
    wasOpen.current = isOpen;
  }, [isOpen]);
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen]);

  if (pathname === '/agents') {
    return null;
  }

  return (
    <>
      {isOpen && (
        <div
          id="agent-chat-dialog"
          role="dialog"
          aria-modal="false"
          aria-labelledby="agent-chat-title"
          className="fixed inset-x-2 bottom-40 z-50 sm:bottom-20 flex h-[70vh] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl sm:inset-x-auto sm:right-6 sm:w-[400px]"
        >
          <div className="flex items-center justify-between bg-slate-900 px-4 py-3 text-white">
            <div>
              <div id="agent-chat-title" className="text-sm font-semibold">
                ИИ-агенты СпецПласт16
              </div>
              <div className="text-xs text-slate-300">Отвечают круглосуточно</div>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              aria-label="Закрыть чат"
              className="rounded p-1 hover:bg-slate-700"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <AgentChat compact autoFocus />
        </div>
      )}

      <button
        ref={toggleRef}
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-label={isOpen ? 'Свернуть чат с ИИ-агентами' : 'Открыть чат с ИИ-агентами'}
        aria-expanded={isOpen}
        aria-controls={isOpen ? 'agent-chat-dialog' : undefined}
        tabIndex={show ? undefined : -1}
        aria-hidden={show ? undefined : true}
        className={`chat-fab fixed right-4 z-50 flex items-center gap-2 rounded-full bg-amber-500 p-3.5 text-sm font-semibold text-slate-950 shadow-lg hover:bg-amber-400 sm:right-6 sm:px-5 sm:py-3 motion-safe:transition-opacity motion-safe:duration-300 ${
          show ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      >
        <svg
          viewBox="0 0 24 24"
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M8 10h8M8 14h5m-9 6 2.5-3H19a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v11a2 2 0 0 0 1 1.7Z"
          />
        </svg>
        <span className="hidden sm:inline">{isOpen ? 'Свернуть' : 'ИИ-помощник'}</span>
      </button>
    </>
  );
}
