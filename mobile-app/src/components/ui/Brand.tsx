import { View } from 'react-native';
import Svg, { G, Rect } from 'react-native-svg';
import { theme } from '../../theme';
import { Text } from './Text';

/**
 * The fajneoceny.pl mark, redrawn as native SVG primitives (not a rasterized
 * asset or embedded XML string) so it can be recolored per-variant and scales
 * crisply at any size. Geometry ported from landing/assets/brand/mark.svg.
 */
export function BrandMark({ size = 32, monochrome = false }: { size?: number; monochrome?: boolean }) {
  const barColor = monochrome ? theme.palette.gray[50] : theme.palette.cyan[400];
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Rect
        x={15}
        y={5}
        width={27}
        height={33}
        rx={8}
        fill={monochrome ? theme.palette.navy[700] : theme.palette.cyan[500]}
        transform="rotate(9 28.5 21.5)"
      />
      <Rect x={6} y={10} width={27} height={33} rx={8} fill={theme.palette.navy[900]} />
      <G fill={barColor}>
        <Rect x={10.5} y={20} width={3} height={13} rx={1.5} />
        <Rect x={15.5} y={15} width={3} height={23} rx={1.5} />
        <Rect x={20.5} y={10.5} width={3} height={32} rx={1.5} />
        <Rect x={25.5} y={15} width={3} height={23} rx={1.5} />
      </G>
    </Svg>
  );
}

/** Mark + wordmark, matching landing/assets/brand/lockup-horizontal.svg. */
export function Logo({ size = 28, inverse = false }: { size?: number; inverse?: boolean }) {
  const wordColor = inverse ? theme.colors.text.inverse : theme.colors.text.primary;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing[2] }}>
      <BrandMark size={size} monochrome={inverse} />
      <Text.Title style={{ fontFamily: theme.font.family.sansBold, color: wordColor }}>
        fajneoceny
        <Text.Title style={{ fontFamily: theme.font.family.sansBold, color: theme.colors.accent.default }}>
          .pl
        </Text.Title>
      </Text.Title>
    </View>
  );
}
