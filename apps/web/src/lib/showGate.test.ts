import { describe, expect, it } from 'vitest';
import { SHOW_INLINE } from './showInline';
import { isLowPower, readShowSignals, showLevel, showPage, type ShowSignals } from './showGate';

const base: ShowSignals = {
  reducedMotion: false,
  saveData: false,
  connection: '4g',
  cores: 8,
  memoryGb: 8,
  calmVariant: false,
};

describe('showLevel', () => {
  it('is full on a normal phone', () => {
    expect(showLevel(base)).toBe('full');
    expect(showLevel({ ...base, cores: null, memoryGb: null, connection: null })).toBe('full');
  });

  it('switches everything off for prefers-reduced-motion, whatever else is set', () => {
    expect(showLevel({ ...base, reducedMotion: true })).toBe('off');
    expect(showLevel({ ...base, reducedMotion: true, saveData: true })).toBe('off');
  });

  it('gives the calm version to data saver, a slow network, a weak phone and ?ab=calm', () => {
    expect(showLevel({ ...base, saveData: true })).toBe('calm');
    expect(showLevel({ ...base, connection: '2g' })).toBe('calm');
    expect(showLevel({ ...base, connection: 'slow-2g' })).toBe('calm');
    expect(showLevel({ ...base, cores: 2 })).toBe('calm');
    expect(showLevel({ ...base, memoryGb: 2 })).toBe('calm');
    expect(showLevel({ ...base, calmVariant: true })).toBe('calm');
  });

  it('keeps 3g and a mid-range phone on the full show', () => {
    expect(showLevel({ ...base, connection: '3g', cores: 4, memoryGb: 4 })).toBe('full');
  });
});

describe('isLowPower', () => {
  it('needs a real signal: unknown values are not low power', () => {
    expect(isLowPower(null, null)).toBe(false);
    expect(isLowPower(4, null)).toBe(false);
    expect(isLowPower(1, null)).toBe(true);
    expect(isLowPower(null, 1)).toBe(true);
  });
});

describe('showPage', () => {
  it('covers the public platform pages', () => {
    for (const path of [
      '/',
      '/arenda/samosval',
      '/arenda/ekskavator-pogruzchik/kazan',
      '/map',
      '/orders',
      '/orders/',
      '/providers',
      '/ceny',
      '/raboty',
      '/raboty/septik',
      '/contacts',
      '/equipment',
      '/equipment/abc',
    ]) {
      expect(showPage(path), path).toBe(true);
    }
  });

  it('leaves out cabinets, the admin, legal pages and the office client pages', () => {
    for (const path of [
      '/admin',
      '/admin/office',
      '/provider',
      '/provider/equipment',
      '/dashboard',
      '/orders/cl123',
      '/privacy',
      '/pravila',
      '/soglasie',
      '/credits',
      '/s/some-client',
      '/preview/abc',
      '/kp/abc',
      '/sajt-pod-klyuch',
      '/oplata/abc',
      '/otpiska/abc',
      '/login',
      '/register',
      '/stroyka',
      '/p/abc',
    ]) {
      expect(showPage(path), path).toBe(false);
    }
    expect(showPage(null)).toBe(false);
  });
});

// The inline script and showLevel must never disagree.
function runInline(opts: {
  path: string;
  search?: string;
  reduced?: boolean;
  saveData?: boolean;
  type?: string;
  cores?: number;
  memory?: number;
  stored?: string;
}): string | null {
  let attr: string | null = null;
  const document = {
    documentElement: {
      setAttribute: (k: string, v: string) => {
        if (k === 'data-show') attr = v;
      },
    },
  };
  const navigator = {
    hardwareConcurrency: opts.cores,
    deviceMemory: opts.memory,
    connection:
      opts.saveData || opts.type
        ? { saveData: opts.saveData, effectiveType: opts.type }
        : undefined,
  };
  const location = { pathname: opts.path, search: opts.search ?? '' };
  let stored = opts.stored ?? null;
  const localStorage = {
    getItem: () => stored,
    setItem: (_key: string, value: string) => {
      stored = value;
    },
  };
  const matchMedia = () => ({ matches: !!opts.reduced });
  new Function('document', 'navigator', 'location', 'localStorage', 'matchMedia', SHOW_INLINE)(
    document,
    navigator,
    location,
    localStorage,
    matchMedia,
  );
  return attr;
}

describe('SHOW_INLINE', () => {
  it('sets nothing on pages without the show', () => {
    expect(runInline({ path: '/dashboard' })).toBeNull();
    expect(runInline({ path: '/orders/abc' })).toBeNull();
    expect(runInline({ path: '/s/x' })).toBeNull();
  });

  it('agrees with showLevel', () => {
    const cases: Array<[Parameters<typeof runInline>[0], Partial<ShowSignals>]> = [
      [{ path: '/', cores: 6, memory: 8 }, {}],
      [{ path: '/', reduced: true }, { reducedMotion: true }],
      [{ path: '/map', saveData: true }, { saveData: true }],
      [{ path: '/ceny', type: '2g' }, { connection: '2g' }],
      [
        { path: '/ceny', type: '3g', cores: 4 },
        { connection: '3g', cores: 4 },
      ],
      [{ path: '/contacts', cores: 2 }, { cores: 2 }],
      [{ path: '/contacts', memory: 1 }, { memoryGb: 1 }],
      [{ path: '/', search: '?ab=calm' }, { calmVariant: true }],
      [{ path: '/', stored: 'calm' }, { calmVariant: true }],
      [{ path: '/', search: '?ab=cine', stored: 'calm' }, {}],
      [
        { path: '/', reduced: true, saveData: true },
        { reducedMotion: true, saveData: true },
      ],
    ];
    for (const [opts, signals] of cases) {
      const expected = showLevel({
        ...base,
        cores: opts.cores ?? null,
        memoryGb: opts.memory ?? null,
        connection: null,
        ...signals,
      });
      expect(runInline(opts), JSON.stringify(opts)).toBe(expected);
    }
  });
});

describe('readShowSignals', () => {
  it('reads the browser, tolerating blocked storage', () => {
    const win = {
      matchMedia: () => ({ matches: true }),
      navigator: { hardwareConcurrency: 4, connection: { saveData: true, effectiveType: '3g' } },
      location: { search: '' },
      get localStorage(): Storage {
        throw new Error('blocked');
      },
    } as unknown as Window;
    expect(readShowSignals(win)).toEqual({
      reducedMotion: true,
      saveData: true,
      connection: '3g',
      cores: 4,
      memoryGb: null,
      calmVariant: false,
    });
  });
});
