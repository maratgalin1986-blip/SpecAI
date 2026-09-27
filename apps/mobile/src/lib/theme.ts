/** Палитра как на сайте (tailwind slate + amber). */
export const colors = {
  primary: '#d97706', // amber-600
  primaryDark: '#b45309', // amber-700
  primaryLight: '#fef3c7', // amber-100
  background: '#f8fafc', // slate-50
  card: '#ffffff',
  border: '#e2e8f0', // slate-200
  text: '#0f172a', // slate-900
  textMuted: '#64748b', // slate-500
  textSoft: '#94a3b8', // slate-400
  danger: '#dc2626', // red-600
  dangerLight: '#fee2e2',
  success: '#16a34a',
  successLight: '#dcfce7',
  info: '#2563eb',
  infoLight: '#dbeafe',
  warningLight: '#fef9c3',
  dark: '#1e293b', // slate-800
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
} as const;

export const radius = {
  sm: 6,
  md: 10,
  lg: 14,
} as const;
