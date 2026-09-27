import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Регистрация',
  description: 'Регистрация клиента или поставщика спецтехники.',
};

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
