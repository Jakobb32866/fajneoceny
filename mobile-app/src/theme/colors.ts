/**
 * Ported 1:1 from the fajneoceny.pl landing page design tokens
 * (landing/tokens/colors.css). Keep these two files in sync — this is the
 * only other place the brand palette is defined.
 */

export const palette = {
  navy: {
    950: '#060F24',
    900: '#0B1A3A',
    800: '#122548',
    700: '#1B3563',
    600: '#274585',
    500: '#35569E',
    400: '#5B78B8',
    300: '#8AA3D2',
    200: '#C0D0EA',
    100: '#E4EBF7',
    50: '#F2F5FC',
  },
  cyan: {
    700: '#0E7FA3',
    600: '#1697C2',
    500: '#2FB6E6',
    400: '#55C6ED',
    300: '#8ADAF3',
    200: '#BEEBF9',
    100: '#E4F7FC',
  },
  gray: {
    950: '#0B1120',
    800: '#232A3B',
    600: '#4B5568',
    500: '#6B7386',
    400: '#8B93A7',
    300: '#C3C9D6',
    200: '#E4E7EE',
    100: '#F0F2F6',
    50: '#F7F8FA',
  },
  white: '#FFFFFF',
  green: { 600: '#16875A', 500: '#1FA971', 100: '#DCF5EA' },
  amber: { 600: '#B4791E', 500: '#E8A23A', 100: '#FBEBD3' },
  red: { 600: '#C23B3B', 500: '#E15252', 100: '#FBE2E2' },
} as const;

export const colors = {
  surface: {
    app: palette.gray[50],
    card: palette.white,
    sunken: palette.gray[100],
    inverse: palette.navy[900],
    inverseElevated: palette.navy[800],
    accentSoft: palette.cyan[100],
  },
  text: {
    primary: palette.gray[950],
    secondary: palette.gray[600],
    tertiary: palette.gray[400],
    inverse: palette.white,
    inverseSecondary: palette.navy[200],
    accent: palette.cyan[700],
    link: palette.navy[700],
    linkHover: palette.cyan[700],
  },
  border: {
    default: palette.gray[200],
    strong: palette.gray[300],
    inverse: 'rgba(255, 255, 255, 0.14)',
    focus: palette.cyan[500],
  },
  accent: {
    default: palette.cyan[500],
    hover: palette.cyan[600],
    active: palette.cyan[700],
    soft: palette.cyan[100],
    onAccent: palette.navy[950],
  },
  brand: {
    default: palette.navy[900],
    hover: palette.navy[800],
    active: palette.navy[950],
    onBrand: palette.white,
  },
  status: {
    success: palette.green[500],
    successStrong: palette.green[600],
    successSoft: palette.green[100],
    warning: palette.amber[500],
    warningStrong: palette.amber[600],
    warningSoft: palette.amber[100],
    danger: palette.red[500],
    dangerStrong: palette.red[600],
    dangerSoft: palette.red[100],
  },
} as const;
