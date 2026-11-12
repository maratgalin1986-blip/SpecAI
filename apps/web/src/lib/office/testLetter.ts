// Пробное письмо владельцу (2026-11-12: «отправь мне пробное письмо на почту, как обычно всем
// делаешь»): фирма владельца заводится обычной ручной строкой офиса, ей строится страница и то
// же письмо, что уходит всем, и оно отправляется с ящика офиса на адрес владельца. Так он видит
// письмо в настоящей почте (в том числе не попало ли оно в спам), а ответив на него — как офис
// читает ответы. Адрес получателя задан здесь и из запроса не берётся.
import { prisma } from '@specai/database';
import { SITE } from '@/lib/site';
import { siteUrl } from '@/lib/siteUrl';
import { parseDossier } from './dossier';
import { nicheTitle } from './niches';
import { applicableAngles, buildOffer } from './offer';
import { buildEmail } from './outreach';
import { officePrices } from './prices';
import { createManualProspects } from './run';
import { parseManualLines } from './sources/manual';
import { sendOfficeMail } from './smtp';
import { unsubscribeHeaders, unsubscribeLinks } from './unsubscribe';

/** Куда уходит пробное письмо: вторая почта владельца (назвал сам, 2026-11-12). */
export const TEST_LETTER_TO = 'specplast16@mail.ru';
const TEST_LINE = `${SITE.name}; ${SITE.phone}; ${SITE.city}; ${TEST_LETTER_TO}`;

export type TestLetterResult = { ok: true; created: boolean } | { ok: false; reason: string };

async function findRow() {
  return prisma.prospect.findFirst({
    where: { source: 'manual', email: { equals: TEST_LETTER_TO, mode: 'insensitive' } },
    orderBy: { id: 'desc' },
  });
}

export async function sendTestLetter(now: Date): Promise<TestLetterResult> {
  let row = await findRow();
  let created = false;
  if (!row) {
    const { candidates } = parseManualLines(TEST_LINE);
    await createManualProspects('sites', candidates, { niche: 'machinery' });
    row = await findRow();
    created = true;
  }
  if (!row || !row.email) return { ok: false, reason: 'Строка фирмы не создана' };
  const base = siteUrl().replace(/\/+$/, '');
  const links = unsubscribeLinks(base, row.token);
  if (!links) return { ok: false, reason: 'Нет секрета для ссылки отписки' };
  const dossier = parseDossier(row.dossierJson, row.source);
  const angle = applicableAngles(dossier)[0] ?? 'leads_to_email';
  const offer = buildOffer({ dossier, angle, companyName: row.name, city: row.city });
  const letter = buildEmail(
    {
      kind: 'site',
      status: row.status,
      slug: row.slug,
      name: row.name,
      phone: row.phone,
      address: row.address,
      city: row.city,
      lat: row.lat,
      lon: row.lon,
      tags: row.tags,
      hours: row.hours,
      email: row.email,
    },
    {
      previewUrl: `${base}/preview/${encodeURIComponent(row.token)}`,
      baseUrl: base,
      prices: await officePrices(),
      nicheTitle: nicheTitle(row.niche),
      replyTo: '',
      offer,
      unsubscribeUrl: links.page,
    },
  );
  const sent = await sendOfficeMail({
    to: row.email,
    subject: letter.subject,
    html: letter.html,
    text: letter.text,
    headers: unsubscribeHeaders(links),
  });
  if (!sent.ok) {
    return {
      ok: false,
      reason: sent.reason.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+/g, '<адрес>').slice(0, 160),
    };
  }
  // Как у обычного письма: с этой отметкой офис узнаёт ответ с этого адреса.
  await prisma.prospect.update({
    where: { id: row.id },
    data: {
      emailSentAt: now,
      contactedAt: row.contactedAt ?? now,
      ...(row.status === 'READY' || row.status === 'NEW' ? { status: 'CONTACTED' } : {}),
      // Автоответ офиса на пробное письмо можно проверять повторно.
      replyAnsweredAt: null,
    },
  });
  return { ok: true, created };
}
