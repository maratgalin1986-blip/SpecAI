'use client';

import { useEffect, useState } from 'react';

/**
 * False on the server and during the first client render, true once React has
 * hydrated. Forms keep their submit button disabled until then: before the JS
 * loads a tap would send a native GET with the phone in the URL (it would land
 * in logs and analytics) instead of the fetch.
 */
export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  return hydrated;
}
