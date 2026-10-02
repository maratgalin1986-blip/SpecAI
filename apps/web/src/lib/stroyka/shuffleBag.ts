// A shuffle-bag: a line does not come back until every line it competes with
// has been said. Used IDs survive visits through localStorage.

export class ShuffleBag {
  private usedIds: Set<string>;
  constructor(
    used: Iterable<string> = [],
    private random: () => number = Math.random,
  ) {
    this.usedIds = new Set(used);
  }

  /** A random unused id from `ids`; when all are used, they start over. */
  next(ids: readonly string[]): string | null {
    if (!ids.length) return null;
    let fresh = ids.filter((id) => !this.usedIds.has(id));
    if (!fresh.length) {
      for (const id of ids) this.usedIds.delete(id);
      fresh = [...ids];
    }
    const id = fresh[Math.floor(this.random() * fresh.length) % fresh.length]!;
    this.usedIds.add(id);
    return id;
  }

  get used(): string[] {
    return [...this.usedIds];
  }
}

const STORAGE_KEY = 'stroyka.lines.used.v1';
const MAX_STORED = 2000;

export function loadUsed(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function saveUsed(ids: string[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids.slice(-MAX_STORED)));
  } catch {
    // Private mode or storage blocked: lines just may repeat next visit.
  }
}
