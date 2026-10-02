import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}', '../../packages/ui/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Tailwind's #64748b is 4.4:1 on the #f7f7f5 page background, just
        // under WCAG AA; this shade keeps the look and reaches 4.8:1.
        slate: { 500: '#5f6f85' },
        // СпецПласт16 cabinet palette: graphite for surfaces and text, «signal»
        // orange for the one action that matters on a screen. Text on white:
        // graphite-600 and darker, signal-700 and darker (WCAG AA).
        graphite: {
          50: '#f5f6f7',
          100: '#e8eaed',
          200: '#d2d6db',
          300: '#aeb4bd',
          400: '#858d99',
          500: '#5f6875',
          600: '#4a525d',
          700: '#3a4049',
          800: '#2a2f36',
          900: '#1d2126',
          950: '#121519',
        },
        signal: {
          50: '#fff6ec',
          100: '#ffe8cc',
          200: '#ffcf96',
          300: '#ffb25c',
          400: '#ff9733',
          500: '#f47b10',
          600: '#d9650a',
          700: '#b34f0b',
          800: '#8f3f10',
          900: '#743511',
          950: '#431a05',
        },
      },
      borderRadius: {
        cab: '1.25rem',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;
