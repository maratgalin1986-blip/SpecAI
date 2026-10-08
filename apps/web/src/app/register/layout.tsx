import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Регистрация',
  description: 'Личный кабинет клиента СпецПласт16: заявки, бронирования и история аренды.',
};

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
