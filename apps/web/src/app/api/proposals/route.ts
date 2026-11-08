import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@specai/database';
import { clientIp } from '@/lib/loginErrors';
import { notifyTelegram } from '@/lib/notify';
import {
  PROPOSAL_RATE_LIMIT,
  PROPOSAL_SUCCESS,
  createProposalSchema,
  isProposalHoneypot,
  proposalFieldErrors,
  proposalTelegramText,
} from '@/lib/proposals';
import { isRateLimited, recordAttempt } from '@/lib/rateLimit';
import { getRequestUser } from '@/lib/requestUser';
import { SITE } from '@/lib/site';
import { siteUrl } from '@/lib/siteUrl';

export const dynamic = 'force-dynamic';

/**
 * «Предложения и партнёрство»: a public write for guests and signed-in people
 * (REVIEW.md §2). The account, when there is one, comes only from the session
 * or the app's token, never from the body. The answer carries no ids.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  // Bots that fill the honeypot get the same success, so the trap stays hidden.
  if (isProposalHoneypot(body)) {
    return NextResponse.json({ ok: true, message: PROPOSAL_SUCCESS }, { status: 201 });
  }
  const parsed = createProposalSchema.safeParse(body);
  if (!parsed.success) {
    const fields = proposalFieldErrors(parsed.error);
    return NextResponse.json(
      { error: Object.values(fields)[0] ?? 'Проверьте поля формы', fields },
      { status: 400 },
    );
  }

  const user = await getRequestUser(request).catch(() => null);
  const keys = [`proposals:ip:${clientIp(request)}`];
  if (user) keys.push(`proposals:user:${user.id}`);
  const limited = keys
    .map((key) => isRateLimited(key, PROPOSAL_RATE_LIMIT))
    .find((result) => !result.ok);
  if (limited) {
    return NextResponse.json(
      { error: 'Вы уже отправили несколько сообщений. Попробуйте через час' },
      { status: 429, headers: { 'Retry-After': String(limited.retryAfterSec) } },
    );
  }
  // Counted before the slow save: parallel requests cannot slip past the limit.
  // (Only when both the database and Telegram are down does a failed try count.)
  for (const key of keys) recordAttempt(key, PROPOSAL_RATE_LIMIT);

  const { kind, name, contact, message, company } = parsed.data;
  const saved = await prisma.proposal
    .create({
      data: { kind, name, contact, message, company: company ?? null, userId: user?.id ?? null },
      select: { id: true },
    })
    .then(() => true)
    .catch((error: unknown) => {
      console.error('[proposals] failed to save', error);
      return false;
    });
  const notified = await notifyTelegram(
    proposalTelegramText({ kind, name, contact, message }, `${siteUrl()}/admin#proposals`),
  ).catch(() => false);

  if (!saved && !notified) {
    return NextResponse.json(
      { error: `Не удалось отправить. Попробуйте позже или напишите на ${SITE.email}` },
      { status: 503 },
    );
  }
  return NextResponse.json({ ok: true, message: PROPOSAL_SUCCESS }, { status: 201 });
}
