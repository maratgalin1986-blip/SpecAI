/**
 * Light / dark theme of the site. Until the visitor picks one, the site follows
 * the system setting (prefers-color-scheme); a pick is remembered in this
 * browser only. The choice lives on <html data-theme="light|dark">, set before
 * the first paint by THEME_INIT_SCRIPT (app/layout.tsx), so there is no flash.
 * Colours of the dark theme: app/theme.css.
 */
export type Theme = 'light' | 'dark';

export const THEME_KEY = 'specai:theme';

/** The saved pick, or null when none (or storage is blocked). */
export function savedTheme(storage: Pick<Storage, 'getItem'> | undefined): Theme | null {
  try {
    const value = storage?.getItem(THEME_KEY);
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    return null;
  }
}

/** A saved pick wins; otherwise the system setting. */
export function resolveTheme(saved: Theme | null, systemDark: boolean): Theme {
  return saved ?? (systemDark ? 'dark' : 'light');
}

/** Inline, before React: the same rule as resolveTheme, in plain ES5. */
export const THEME_INIT_SCRIPT = `try{var t=null;try{t=localStorage.getItem('${THEME_KEY}')}catch(e){}if(t!=='light'&&t!=='dark')t=window.matchMedia&&matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';document.documentElement.setAttribute('data-theme',t)}catch(e){}`;

const listeners = new Set<() => void>();

export function currentTheme(): Theme {
  if (typeof document === 'undefined') return 'light';
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

export function setTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme);
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Private mode or blocked storage: the pick lasts for this page only.
  }
  listeners.forEach((listener) => listener());
}

export function subscribeTheme(listener: () => void) {
  listeners.add(listener);
  // Without a saved pick, follow the system setting when it changes.
  const media =
    typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(prefers-color-scheme: dark)')
      : null;
  const onSystem = () => {
    let storage: Storage | undefined;
    try {
      storage = localStorage;
    } catch {
      storage = undefined;
    }
    if (savedTheme(storage)) return;
    document.documentElement.setAttribute('data-theme', media?.matches ? 'dark' : 'light');
    listeners.forEach((l) => l());
  };
  media?.addEventListener?.('change', onSystem);
  return () => {
    listeners.delete(listener);
    media?.removeEventListener?.('change', onSystem);
  };
}
