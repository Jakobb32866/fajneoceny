import { Platform } from 'react-native';

/**
 * Ported from landing/tokens/shadows.css. CSS box-shadows use a navy tint
 * (rgba(11,26,58,x)) rather than pure black; RN splits color/opacity/offset
 * so we mirror that via shadowColor + shadowOpacity, with an Android
 * `elevation` approximation (Android ignores shadowOffset/Radius pre-API 28).
 */
type ShadowStyle = {
  shadowColor: string;
  shadowOffset: { width: number; height: number };
  shadowOpacity: number;
  shadowRadius: number;
  elevation: number;
};

const navyShadow = (height: number, radius: number, opacity: number, elevation: number): ShadowStyle => ({
  shadowColor: '#0B1A3A',
  shadowOffset: { width: 0, height },
  shadowOpacity: opacity,
  shadowRadius: radius,
  elevation,
});

export const shadows = {
  xs: navyShadow(1, 2, 0.06, 1),
  sm: navyShadow(2, 8, 0.08, 2),
  md: navyShadow(8, 24, 0.1, 6),
  lg: navyShadow(16, 48, 0.14, 12),
  inverseSm: Platform.select<ShadowStyle>({
    default: { shadowColor: '#000000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.28, shadowRadius: 10, elevation: 3 },
  })!,
} as const;
