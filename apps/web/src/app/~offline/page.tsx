import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Нет соединения',
};

export default function OfflinePage() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-16 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-900 text-3xl font-bold text-white">
        S
      </div>
      <h1 className="text-2xl font-semibold">Нет соединения</h1>
      <p className="text-slate-600">
        Похоже, интернет недоступен. Проверьте подключение и попробуйте снова — приложение откроется
        автоматически, когда сеть появится.
      </p>
      <Link
        href="/"
        className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
      >
        Попробовать снова
      </Link>
    </div>
  );
}
