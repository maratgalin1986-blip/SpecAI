import { Card } from '@specai/ui';
import { AdminLogin } from '@/components/AdminLogin';
import { isAdminConfigured, isAdminRequest } from '@/lib/admin';

// What an /admin/* page shows instead of its content when the admin is not
// signed in: the same cards as /admin itself. Server-only (reads cookies).
export function adminGate(): JSX.Element | null {
  if (!isAdminConfigured()) {
    return (
      <Card className="mx-auto max-w-lg">
        <h1 className="text-xl font-bold">Админка отключена</h1>
        <p className="mt-2 text-sm text-slate-600">
          Задайте переменную окружения{' '}
          <code className="rounded bg-slate-100 px-1">ADMIN_PASSWORD</code> в настройках Vercel и
          сделайте Redeploy.
        </p>
      </Card>
    );
  }
  if (!isAdminRequest()) {
    return (
      <Card className="mx-auto max-w-sm">
        <h1 className="mb-4 text-xl font-bold">Вход для администратора</h1>
        <AdminLogin />
      </Card>
    );
  }
  return null;
}
