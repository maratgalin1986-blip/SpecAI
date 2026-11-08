import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@specai/database';
import { isAdminRequest } from '@/lib/admin';
import { ADMIN_PROPOSAL_SELECT, PROPOSAL_STATUSES, type ProposalStatus } from '@/lib/proposals';

export const dynamic = 'force-dynamic';

// «Предложения и партнёрство»: new ones by default (`?status=READ|ARCHIVED` for the others).
export async function GET(request: NextRequest) {
  if (!isAdminRequest()) return NextResponse.json({ error: 'Нет доступа' }, { status: 401 });
  const requested = request.nextUrl.searchParams.get('status');
  const status: ProposalStatus = PROPOSAL_STATUSES.includes(requested as ProposalStatus)
    ? (requested as ProposalStatus)
    : 'NEW';
  const proposals = await prisma.proposal.findMany({
    where: { status },
    select: ADMIN_PROPOSAL_SELECT,
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  return NextResponse.json({ proposals });
}
