'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { AgentChat } from '@/components/AgentChat';

// Floating chat button shown on every page except /agents, which has the
// full-size chat already.
export function AgentChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();

  if (pathname === '/agents') {
    return null;
  }

  return (
    <>
      {isOpen && (
        <div className="fixed inset-x-2 bottom-36 z-50 sm:bottom-20 flex h-[70vh] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl sm:inset-x-auto sm:right-6 sm:w-[400px]">
          <div className="flex items-center justify-between bg-slate-900 px-4 py-3 text-white">
            <div>
              <div className="text-sm font-semibold">ИИ-агенты СпецПласт16</div>
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
          <AgentChat compact />
        </div>
      )}

      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-label="Открыть чат с ИИ-агентами"
        className="fixed bottom-28 right-4 z-50 flex items-center gap-2 sm:bottom-4 rounded-full bg-amber-500 p-3.5 text-sm font-semibold text-slate-950 shadow-lg hover:bg-amber-400 sm:right-6 sm:px-5 sm:py-3"
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
