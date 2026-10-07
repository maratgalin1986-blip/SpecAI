import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Two top-level @keyframes with one name: the later one silently wins for the
// whole site (the /stroyka fly-over title once hid every hero H1).
function topLevelKeyframes(css: string): string[] {
  const names: string[] = [];
  let depth = 0;
  const re = /@keyframes\s+([\w-]+)|[{}]/g;
  for (let m = re.exec(css); m; m = re.exec(css)) {
    if (m[1]) {
      if (depth === 0) names.push(m[1]);
    } else depth += m[0] === '{' ? 1 : -1;
  }
  return names;
}

describe('globals.css', () => {
  it('has no two top-level keyframes with the same name', () => {
    // motion.css is loaded right after globals.css: one namespace.
    const css = ['./globals.css', './motion.css']
      .map((file) => readFileSync(fileURLToPath(new URL(file, import.meta.url)), 'utf8'))
      .join('\n');
    const names = topLevelKeyframes(css.replace(/\/\*[\s\S]*?\*\//g, ''));
    const dupes = names.filter((n, i) => names.indexOf(n) !== i);
    expect(dupes).toEqual([]);
  });
});
