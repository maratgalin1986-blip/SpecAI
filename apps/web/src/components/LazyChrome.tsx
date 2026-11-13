'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { afterLoad, onIdle } from '@/lib/cinemaFx';

// Floating helpers nothing on the first screen needs: their code arrives as
// separate chunks after hydration instead of sitting in every page's
// first-load JS. All of them are fixed overlays that appear later anyway (the
// chat button only past the first screen, the install card after a few
// seconds, «Сторож» after 20 s), so nothing in the page moves when they mount.
// The layout keeps each in its old place, so the stacking order is the same.
const AgentChatWidget = dynamic(
  () => import('@/components/AgentChatWidget').then((m) => m.AgentChatWidget),
  { ssr: false },
);
const InstallPrompt = dynamic(
  () => import('@/components/InstallPrompt').then((m) => m.InstallPrompt),
  { ssr: false },
);
const Storozh = dynamic(() => import('@/components/Storozh').then((m) => m.Storozh), {
  ssr: false,
});

/** True once the page has loaded and the main thread is idle. */
function usePageIdle(): boolean {
  const [idle, setIdle] = useState(false);
  useEffect(() => {
    let cancelIdle = () => {};
    const cancelLoad = afterLoad(() => {
      cancelIdle = onIdle(() => setIdle(true), 2000);
    }, 0);
    return () => {
      cancelLoad();
      cancelIdle();
    };
  }, []);
  return idle;
}

export function LazyAgentChat() {
  return usePageIdle() ? <AgentChatWidget /> : null;
}

export function LazyInstallPrompt() {
  return usePageIdle() ? <InstallPrompt /> : null;
}

/**
 * «Сторож» counts its 20 s from the opening of the page (Storozh.tsx), so it
 * only has to be listening before then: it loads right after hydration.
 */
export function LazyStorozh() {
  return <Storozh />;
}
