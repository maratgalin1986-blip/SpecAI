'use client';

import { SITE } from '@/lib/site';

// Last-resort error page when the root layout itself fails; it must render
// its own <html> and cannot rely on the site's styles.
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="ru">
      <body
        style={{ fontFamily: 'system-ui, sans-serif', textAlign: 'center', padding: '64px 16px' }}
      >
        <h1 style={{ fontSize: 28 }}>Сервис временно недоступен</h1>
        <p style={{ color: '#475569' }}>
          Бригада {SITE.name} уже чинит. Попробуйте обновить страницу через минуту или позвоните
          нам.
        </p>
        <p>
          <button type="button" onClick={reset} style={{ padding: '10px 20px', marginRight: 12 }}>
            Попробовать ещё раз
          </button>
          <a href={SITE.phoneHref} style={{ color: '#d97706', fontWeight: 600 }}>
            {SITE.phone}
          </a>
        </p>
      </body>
    </html>
  );
}
