'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { EmailFeatures } from '@/lib/emailFeatures';

// The server layouts of /register and /forgot-password read which e-mail
// features work (lib/emailFeatures.ts) and hand the answer to the client
// pages, so they do not offer a letter that cannot be sent.

const EmailFeaturesContext = createContext<EmailFeatures>({
  passwordRecovery: true,
  weeklyDigest: true,
});

export function EmailFeaturesProvider({
  value,
  children,
}: {
  value: EmailFeatures;
  children: ReactNode;
}) {
  return <EmailFeaturesContext.Provider value={value}>{children}</EmailFeaturesContext.Provider>;
}

export function useEmailFeatures(): EmailFeatures {
  return useContext(EmailFeaturesContext);
}
