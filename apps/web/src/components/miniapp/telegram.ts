// The part of Telegram's WebApp object (telegram-web-app.js) the Mini App
// uses. Outside Telegram the script still defines it, with empty initData.

type Callback = () => void;

export interface TgButton {
  setParams(params: {
    text?: string;
    color?: string;
    text_color?: string;
    is_active?: boolean;
    is_visible?: boolean;
  }): void;
  show(): void;
  hide(): void;
  onClick(cb: Callback): void;
  offClick(cb: Callback): void;
  showProgress?(leaveActive?: boolean): void;
  hideProgress?(): void;
}

export interface TgWebApp {
  initData: string;
  initDataUnsafe?: { start_param?: string };
  ready(): void;
  expand(): void;
  setHeaderColor?(color: string): void;
  setBackgroundColor?(color: string): void;
  setBottomBarColor?(color: string): void;
  MainButton?: TgButton;
  BackButton?: {
    show(): void;
    hide(): void;
    onClick(cb: Callback): void;
    offClick(cb: Callback): void;
  };
  HapticFeedback?: {
    impactOccurred?(style: 'light' | 'medium'): void;
    notificationOccurred?(type: 'success' | 'error'): void;
  };
}

/** Telegram's WebApp object when the page is really open inside Telegram. */
export function telegramApp(): TgWebApp | null {
  if (typeof window === 'undefined') return null;
  const app = (window as unknown as { Telegram?: { WebApp?: TgWebApp } }).Telegram?.WebApp;
  return app && app.initData ? app : null;
}
