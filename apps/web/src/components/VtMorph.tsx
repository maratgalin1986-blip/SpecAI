'use client';

import { useEffect } from 'react';
import { reachGoal } from '@/lib/marketing';

const MACHINE_URL = /\/equipment\/([^/?#]+)/;
const PARTS = { photo: 'machine-photo', title: 'machine-title', price: 'machine-price' } as const;

interface Activation {
  entry?: { url?: string };
  from?: { url?: string };
}
type VtEvent = Event & {
  activation?: Activation;
};

function idOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const match = MACHINE_URL.exec(new URL(url, location.href).pathname);
    return match?.[1] ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}

function findCard(id: string): Element | null {
  return (
    Array.from(document.querySelectorAll('[data-vt-id]')).find(
      (el) => el.getAttribute('data-vt-id') === id,
    ) ?? null
  );
}

// Names the photo, title and price of one card; returns a function that clears them.
function nameParts(card: Element): () => void {
  const named: HTMLElement[] = [];
  for (const [part, name] of Object.entries(PARTS)) {
    const el = card.querySelector<HTMLElement>(`[data-vt-part="${part}"]`);
    if (!el) continue;
    el.style.viewTransitionName = name;
    named.push(el);
  }
  return () => named.forEach((el) => (el.style.viewTransitionName = ''));
}

// Cross-document morph from a catalog card to the machine page (and back).
export function VtMorph() {
  useEffect(() => {
    if (!('onpageswap' in window) || matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const onSwap = (event: Event) => {
      const id = idOf((event as VtEvent).activation?.entry?.url);
      if (!id || location.pathname.startsWith('/equipment/')) return;
      const card = findCard(id);
      if (!card) return;
      nameParts(card);
      reachGoal('card_open');
    };

    window.addEventListener('pageswap', onSwap);
    return () => {
      window.removeEventListener('pageswap', onSwap);
    };
  }, []);

  // pagereveal fires before React hydrates, so the back-navigation half runs
  // as an inline script placed after the catalog markup.
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `(function(){if(!('onpagereveal' in window)||matchMedia('(prefers-reduced-motion: reduce)').matches)return;addEventListener('pagereveal',function(e){var vt=e.viewTransition;var a=window.navigation&&navigation.activation;var m=a&&a.from&&/\\/equipment\\/([^/?#]+)/.exec(new URL(a.from.url).pathname);if(!vt||!m||location.pathname.indexOf('/equipment/')===0)return;var id=decodeURIComponent(m[1]);var card=Array.prototype.find.call(document.querySelectorAll('[data-vt-id]'),function(c){return c.getAttribute('data-vt-id')===id});if(!card)return;var names={photo:'machine-photo',title:'machine-title',price:'machine-price'};var els=[];for(var k in names){var el=card.querySelector('[data-vt-part="'+k+'"]');if(el){el.style.viewTransitionName=names[k];els.push(el)}}var clear=function(){els.forEach(function(x){x.style.viewTransitionName=''})};vt.finished.then(clear,clear)})})();`,
      }}
    />
  );
}
