import { View, type ViewProps } from 'react-native';
import { theme } from '../../theme';
import { Text } from './Text';

export type BadgeVariant = 'success' | 'brand' | 'warning' | 'danger' | 'neutral';

const VARIANT_STYLES: Record<BadgeVariant, { bg: string; text: string }> = {
  success: { bg: theme.colors.status.successSoft, text: theme.colors.status.successStrong },
  brand: { bg: theme.colors.accent.soft, text: theme.colors.accent.active },
  warning: { bg: theme.colors.status.warningSoft, text: theme.colors.status.warningStrong },
  danger: { bg: theme.colors.status.dangerSoft, text: theme.colors.status.dangerStrong },
  neutral: { bg: theme.colors.surface.sunken, text: theme.colors.text.secondary },
};

interface BadgeProps extends ViewProps {
  label: string;
  variant?: BadgeVariant;
}

export function Badge({ label, variant = 'neutral', style, ...props }: BadgeProps) {
  const v = VARIANT_STYLES[variant];
  return (
    <View
      style={[
        {
          alignSelf: 'flex-start',
          backgroundColor: v.bg,
          borderRadius: theme.radius.full,
          paddingVertical: theme.spacing[1],
          paddingHorizontal: theme.spacing[3],
        },
        style,
      ]}
      {...props}
    >
      <Text.Caption style={{ color: v.text, fontFamily: theme.font.family.sansSemibold }}>{label}</Text.Caption>
    </View>
  );
}
