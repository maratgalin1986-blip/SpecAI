'use client';

import { useEffect, useState } from 'react';
import { SHARE_NETWORKS, shareUrl, withShareUtm } from '@/lib/share';

// «Поделиться»: copy the link, or open Telegram / WhatsApp / VK with it. On a
// phone with the system share sheet a «Ещё…» button opens it as well.
// `tag` adds utm_source=<network>&utm_medium=share (off for invitation links,
// which carry their own tags after the /r/<code> redirect).

export function ShareButtons({
  url,
  text,
  tag = true,
  label = 'Поделиться',
  className = '',
}: {
  url: string;
  text: string;
  tag?: boolean;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  // Known only in the browser: set after mounting so the first render matches the server's.
  const [canShare, setCanShare] = useState(false);
  useEffect(() => setCanShare(typeof navigator.share === 'function'), []);
  const copyUrl = tag ? withShareUtm(url, 'copy') : url;

  async function copy() {
    try {
      await navigator.clipboard.writeText(copyUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Скопируйте ссылку', copyUrl);
    }
  }

  async function systemShare() {
    try {
      await navigator.share({ title: text, text, url: tag ? withShareUtm(url, 'native') : url });
    } catch {
      // The user closed the sheet.
    }
  }

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {label && <p className="text-sm font-semibold text-graphite-800">{label}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => void copy()} className="cab-ghost">
          {copied ? 'Ссылка скопирована' : 'Копировать ссылку'}
        </button>
        {SHARE_NETWORKS.map((network) => (
          <a
            key={network.id}
            href={shareUrl(network.id, url, text, tag)}
            target="_blank"
            rel="noopener noreferrer"
            className="cab-ghost"
          >
            {network.label}
          </a>
        ))}
        {canShare && (
          <button type="button" onClick={() => void systemShare()} className="cab-ghost">
            Ещё…
          </button>
        )}
      </div>
    </div>
  );
}
