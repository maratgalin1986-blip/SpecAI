import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { EmailFeaturesProvider } from '@/components/EmailFeaturesProvider';
import { emailFeatures } from '@/lib/emailFeatures';

export const metadata: Metadata = {
  title: 'Восстановление пароля',
  robots: { index: false },
};

export default function Layout({ children }: { children: ReactNode }) {
  return <EmailFeaturesProvider value={emailFeatures()}>{children}</EmailFeaturesProvider>;
}
