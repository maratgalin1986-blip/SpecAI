/**
 * Дизайн-система приложения СпецПласт16: «графит + сигнальный оранжевый».
 * Своя палитра стройплощадки — тёмный графит кабины и оранжевый цвет
 * сигнальных жилетов и проблесковых маячков. Все экраны берут цвета,
 * отступы, радиусы и шрифты отсюда.
 */
export const palette = {
  graphite900: '#15181C',
  graphite800: '#1E2227',
  graphite700: '#2A2F36',
  graphite600: '#3A414A',
  steel500: '#5C6570',
  steel400: '#8A939D',
  steel300: '#B9C0C8',
  steel200: '#DDE1E6',
  steel100: '#EDEFF2',
  steel50: '#F5F6F8',
  white: '#FFFFFF',
  signal600: '#E0560B',
  signal700: '#B8460A',
  signal100: '#FFE9DA',
  signal50: '#FFF5EE',
  amber400: '#F5A524',
  green600: '#1E9E57',
  green100: '#DDF5E7',
  blue600: '#2D6CDF',
  blue100: '#E0EAFC',
  red600: '#D3302F',
  red100: '#FDE3E2',
  yellow100: '#FFF4D6',
  yellow800: '#7A5A00',
} as const;

export const colors = {
  /** Главный акцент: кнопки «Заказать», активные вкладки. */
  primary: palette.signal600,
  primaryDark: palette.signal700,
  primaryLight: palette.signal100,
  primarySoft: palette.signal50,
  onPrimary: palette.white,
  /** Вторичный акцент (звёзды, индикаторы). */
  accent: palette.amber400,
  background: palette.steel50,
  card: palette.white,
  surfaceMuted: palette.steel100,
  border: palette.steel200,
  text: palette.graphite900,
  textMuted: palette.steel500,
  textSoft: palette.steel400,
  danger: palette.red600,
  dangerLight: palette.red100,
  success: palette.green600,
  successLight: palette.green100,
  info: palette.blue600,
  infoLight: palette.blue100,
  warningLight: palette.yellow100,
  warningText: palette.yellow800,
  /** Тёмные поверхности: шапка кабинета, статус «Не на линии». */
  dark: palette.graphite800,
  darkSoft: palette.graphite700,
  onDark: palette.white,
  onDarkMuted: palette.steel300,
  overlay: 'rgba(21, 24, 28, 0.45)',
} as const;

export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999,
} as const;

/** Минимальный размер области нажатия (dp). */
export const TAP = 48;

export const typography = {
  display: { fontSize: 28, lineHeight: 34, fontWeight: '800' },
  title: { fontSize: 22, lineHeight: 28, fontWeight: '800' },
  heading: { fontSize: 18, lineHeight: 24, fontWeight: '700' },
  body: { fontSize: 16, lineHeight: 22, fontWeight: '400' },
  bodyStrong: { fontSize: 16, lineHeight: 22, fontWeight: '600' },
  small: { fontSize: 14, lineHeight: 20, fontWeight: '400' },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '600' },
} as const;

/** Мягкая тень карточек и нижней шторки (iOS shadow* + Android elevation). */
export const shadow = {
  card: {
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  sheet: {
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: -4 },
    elevation: 12,
  },
} as const;

export const theme = { palette, colors, spacing, radius, typography, shadow, TAP } as const;
export default theme;
