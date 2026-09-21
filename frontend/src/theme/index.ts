import { colors, palette } from './colors';
import { fontFamily, fontSize, fontWeight, lineHeight, tracking } from './typography';
import { spacing } from './spacing';
import { radius } from './radius';
import { shadows } from './shadows';
import { layout } from './layout';

export const theme = {
  colors,
  palette,
  font: { family: fontFamily, size: fontSize, weight: fontWeight, lineHeight, tracking },
  spacing,
  radius,
  shadows,
  layout,
} as const;

export type Theme = typeof theme;

export { colors, palette } from './colors';
export { fontFamily, fontSize, fontWeight, lineHeight, tracking } from './typography';
export { spacing } from './spacing';
export { radius } from './radius';
export { shadows } from './shadows';
export { layout } from './layout';
