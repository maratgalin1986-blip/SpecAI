import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Регистрация',
  description: 'Регистрация клиента: заявки, бронирования и история аренды.',
};

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
