/**
 * Mobile-tuned type scale derived from landing/tokens/typography.css.
 * Marketing-page display sizes (56px/72px) are compressed for phone/tablet
 * screens; everything else maps 1:1 (rem * 16 -> px).
 */

export const fontFamily = {
  display: 'Newsreader_500Medium',
  displaySemibold: 'Newsreader_600SemiBold',
  sans: 'Manrope_400Regular',
  sansMedium: 'Manrope_500Medium',
  sansSemibold: 'Manrope_600SemiBold',
  sansBold: 'Manrope_700Bold',
  mono: 'JetBrainsMono_400Regular',
  monoMedium: 'JetBrainsMono_500Medium',
} as const;

export const fontSize = {
  caption: 12,
  bodySm: 14,
  body: 16,
  bodyLg: 18,
  title: 20,
  headlineMd: 24,
  headlineLg: 30,
  displaySm: 34,
  display: 40,
} as const;

export const lineHeight = {
  tight: 1.05,
  snug: 1.25,
  normal: 1.5,
  relaxed: 1.65,
} as const;

export const tracking = {
  tight: -0.4, // ~ -0.02em at 20px body size
  normal: 0,
  wide: 0.6, // ~ 0.04em
} as const;

export const fontWeight = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
} as const;
