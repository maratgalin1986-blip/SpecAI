import { prisma } from '@specai/database';
import { isAdminRequest } from '@/lib/admin';
import type { OrderViewer } from '@/lib/privacy';

interface ViewerUser {
  id: string;
  role: string;
  companyId?: string | null;
}

/**
 * Everything the privacy rules in lib/privacy.ts need to know about the person
 * looking at an order. The e-mail check is read from the database only for
 * providers, the only role it matters for.
 */
export async function orderViewerFor(user: ViewerUser | null | undefined): Promise<OrderViewer> {
  const isAdmin = isAdminRequest();
  if (!user) return { isAdmin };
  let emailVerified = false;
  if (user.role === 'PROVIDER_ADMIN') {
    const record = await prisma.user.findUnique({
      where: { id: user.id },
      select: { emailVerified: true },
    });
    emailVerified = Boolean(record?.emailVerified);
  }
  return {
    userId: user.id,
    role: user.role,
    companyId: user.companyId ?? null,
    emailVerified,
    isAdmin,
  };
}
