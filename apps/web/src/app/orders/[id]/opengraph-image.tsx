import { ImageResponse } from 'next/og';
import { prisma } from '@specai/database';
import { OG_FONT_NAME, ogFontData } from '@/lib/ogFont';
import { orderOgText } from '@/lib/orderCard';
import { SITE } from '@/lib/site';

// The link preview of an order (Telegram, WhatsApp, VK): «Нужен автокран ·
// Елабуга · 20 октября» and the brand. Only the kind of machine, the city and
// the day (lib/orderCard.ts) — no name, phone, address, description or price.
export const runtime = 'nodejs';
export const alt = `Заявка на спецтехнику — ${SITE.platform} от ${SITE.name}`;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const COLORS = {
  ink: '#121519',
  muted: '#aeb4bd',
  signal: '#f47b10',
  paper: '#f5f6f7',
};

export default async function Image({ params }: { params: { id: string } }) {
  const order = await prisma.order
    .findUnique({
      where: { id: params.id },
      select: {
        status: true,
        desiredStartDate: true,
        category: { select: { name: true } },
        location: { select: { city: true, latitude: true, longitude: true } },
      },
    })
    .catch(() => null);
  const text = orderOgText(
    order
      ? {
          status: order.status,
          categoryName: order.category?.name,
          location: order.location,
          desiredStartDate: order.desiredStartDate,
        }
      : null,
    `${SITE.platform} от ${SITE.name}`,
  );

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '64px 72px',
        background: COLORS.ink,
        color: COLORS.paper,
        fontFamily: OG_FONT_NAME,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
        <div style={{ width: 20, height: 56, background: COLORS.signal, borderRadius: 4 }} />
        <div style={{ fontSize: 34, color: COLORS.muted }}>{text.kicker}</div>
        {text.status && (
          <div
            style={{
              marginLeft: 'auto',
              fontSize: 28,
              padding: '8px 22px',
              borderRadius: 999,
              border: `3px solid ${COLORS.signal}`,
              color: COLORS.signal,
            }}
          >
            {text.status}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ fontSize: 84, lineHeight: 1.05 }}>{text.title}</div>
        {text.subtitle && (
          <div style={{ fontSize: 40, color: COLORS.muted, lineHeight: 1.2 }}>{text.subtitle}</div>
        )}
        {text.details && <div style={{ fontSize: 52, color: COLORS.signal }}>{text.details}</div>}
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          fontSize: 32,
          color: COLORS.muted,
        }}
      >
        <div style={{ color: COLORS.paper }}>{text.brand}</div>
        <div style={{ color: COLORS.signal }}>{text.promise}</div>
      </div>
    </div>,
    {
      ...size,
      fonts: [{ name: OG_FONT_NAME, data: ogFontData(), weight: 800, style: 'normal' }],
      headers: { 'Cache-Control': 'public, max-age=600, s-maxage=600' },
    },
  );
}
