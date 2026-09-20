import { Text as RNText, type TextProps } from 'react-native';
import { theme } from '../../theme';

/**
 * Typography primitives wired to the theme's type scale. Prefer these over
 * raw <Text> + inline StyleSheet so every screen shares one scale.
 */

function makeTextComponent(defaultStyle: {
  fontSize: number;
  fontFamily: string;
  lineHeight?: number;
  color?: string;
}) {
  return function ThemedText({ style, ...props }: TextProps) {
    return <RNText {...props} style={[defaultStyle, style]} />;
  };
}

const Display = makeTextComponent({
  fontSize: theme.font.size.display,
  fontFamily: theme.font.family.display,
  lineHeight: theme.font.size.display * theme.font.lineHeight.tight,
  color: theme.colors.text.primary,
});

const HeadlineLg = makeTextComponent({
  fontSize: theme.font.size.headlineLg,
  fontFamily: theme.font.family.display,
  lineHeight: theme.font.size.headlineLg * theme.font.lineHeight.snug,
  color: theme.colors.text.primary,
});

const HeadlineMd = makeTextComponent({
  fontSize: theme.font.size.headlineMd,
  fontFamily: theme.font.family.displaySemibold,
  lineHeight: theme.font.size.headlineMd * theme.font.lineHeight.snug,
  color: theme.colors.text.primary,
});

const Title = makeTextComponent({
  fontSize: theme.font.size.title,
  fontFamily: theme.font.family.sansSemibold,
  lineHeight: theme.font.size.title * theme.font.lineHeight.snug,
  color: theme.colors.text.primary,
});

const BodyLg = makeTextComponent({
  fontSize: theme.font.size.bodyLg,
  fontFamily: theme.font.family.sans,
  lineHeight: theme.font.size.bodyLg * theme.font.lineHeight.normal,
  color: theme.colors.text.primary,
});

const Body = makeTextComponent({
  fontSize: theme.font.size.body,
  fontFamily: theme.font.family.sans,
  lineHeight: theme.font.size.body * theme.font.lineHeight.normal,
  color: theme.colors.text.primary,
});

const BodySm = makeTextComponent({
  fontSize: theme.font.size.bodySm,
  fontFamily: theme.font.family.sans,
  lineHeight: theme.font.size.bodySm * theme.font.lineHeight.normal,
  color: theme.colors.text.secondary,
});

const Caption = makeTextComponent({
  fontSize: theme.font.size.caption,
  fontFamily: theme.font.family.sansMedium,
  lineHeight: theme.font.size.caption * theme.font.lineHeight.normal,
  color: theme.colors.text.tertiary,
});

/** For grades, streaks, counters — anything numeric that benefits from tabular figures. */
const Mono = makeTextComponent({
  fontSize: theme.font.size.body,
  fontFamily: theme.font.family.mono,
  color: theme.colors.text.primary,
});

export const Text = { Display, HeadlineLg, HeadlineMd, Title, BodyLg, Body, BodySm, Caption, Mono };
