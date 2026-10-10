import type { ReactNode } from 'react';
import { AdminNav } from '@/components/admin/AdminNav';
import { isAdminConfigured, isAdminRequest } from '@/lib/admin';
import { countUnreadFeed } from '@/lib/adminFeedData';

export const dynamic = 'force-dynamic';

// Every /admin/* page gets the section bar once the admin is signed in; the
// pages themselves show the login card otherwise (adminGate / page.tsx).
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const admin = isAdminConfigured() && isAdminRequest();
  const unread = admin ? await countUnreadFeed() : 0;
  return (
    <div className="flex flex-col gap-5">
      {admin && <AdminNav unread={unread} />}
      {children}
    </div>
  );
}
