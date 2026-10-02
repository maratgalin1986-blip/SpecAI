// Share buttons (equipment, provider pages, the invitation): links that open
// Telegram, WhatsApp and VK with the page and a short text. Each shared URL
// carries utm_source=<network>&utm_medium=share, so /admin «Маркетинг» shows
// visits that came from shares (docs/marketing.md, docs/promotion.md).
// Pure functions, safe for client components.

export type ShareNetwork = 'telegram' | 'whatsapp' | 'vk';

export const SHARE_NETWORKS: { id: ShareNetwork; label: string }[] = [
  { id: 'telegram', label: 'Telegram' },
  { id: 'whatsapp', label: 'WhatsApp' },
  { id: 'vk', label: 'ВКонтакте' },
];

/** The page URL with UTM tags for one network; keeps existing query params. */
export function withShareUtm(url: string, source: string, medium = 'share'): string {
  try {
    const parsed = new URL(url);
    if (!parsed.searchParams.has('utm_source')) {
      parsed.searchParams.set('utm_source', source);
      parsed.searchParams.set('utm_medium', medium);
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

/** Share link for one network. `tag` = false keeps the URL as is (referral links). */
export function shareUrl(network: ShareNetwork, url: string, text: string, tag = true): string {
  const link = tag ? withShareUtm(url, network) : url;
  const e = encodeURIComponent;
  switch (network) {
    case 'telegram':
      return `https://t.me/share/url?url=${e(link)}&text=${e(text)}`;
    case 'whatsapp':
      return `https://wa.me/?text=${e(`${text} ${link}`)}`;
    case 'vk':
      return `https://vk.com/share.php?url=${e(link)}&title=${e(text)}`;
  }
}
