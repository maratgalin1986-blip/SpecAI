import type { Metadata } from 'next';
import { Card } from '@specai/ui';
import { verifyUnsubscribe } from '@/lib/office/unsubscribe';
import { SITE } from '@/lib/site';
import { OtpiskaButton } from './OtpiskaButton';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Больше не писать',
  robots: { index: false, follow: false, nocache: true },
};

/**
 * Ссылка «Больше не писать» из письма офиса (К3, lib/office/unsubscribe.ts). Открытие страницы
 * ничего не меняет — почтовые сканеры открывают ссылки сами; отписывает только кнопка (POST).
 * Страница не показывает ни названия, ни адреса компании: только подпись ссылки.
 */
export default async function OtpiskaPage(props: {
  params: Promise<{ token: string }>;
  searchParams?: Promise<{ s?: string | string[] }>;
}) {
  const { token } = await props.params;
  const searchParams = (await props.searchParams) ?? {};
  const signature = typeof searchParams.s === 'string' ? searchParams.s : '';
  const valid = verifyUnsubscribe(token, signature);

  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <Card className="flex flex-col gap-3">
        <h1 className="text-xl font-bold">Письма от {SITE.platform}</h1>
        {valid ? (
          <>
            <p className="text-sm text-slate-700">
              Мы писали вам о странице для вашей компании. Если писем больше не нужно — нажмите
              кнопку, и мы больше не напишем на этот адрес.
            </p>
            <OtpiskaButton token={token} signature={signature} />
          </>
        ) : (
          <p className="text-sm text-slate-700">
            Ссылка недействительна. Ответьте на наше письмо словом «стоп» или напишите на{' '}
            <a href={`mailto:${SITE.email}`} className="text-amber-700 underline">
              {SITE.email}
            </a>{' '}
            — больше не напишем.
          </p>
        )}
      </Card>
    </div>
  );
}
