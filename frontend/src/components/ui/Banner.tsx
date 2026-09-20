import { View, type ViewProps } from 'react-native';
import { theme } from '../../theme';
import { Text } from './Text';

export type BannerVariant = 'danger' | 'warning' | 'success';

const VARIANT_STYLES: Record<BannerVariant, { bg: string; accent: string; text: string }> = {
  danger: {
    bg: theme.colors.status.dangerSoft,
    accent: theme.colors.status.danger,
    text: theme.colors.status.dangerStrong,
  },
  warning: {
    bg: theme.colors.status.warningSoft,
    accent: theme.colors.status.warning,
    text: theme.colors.status.warningStrong,
  },
  success: {
    bg: theme.colors.status.successSoft,
    accent: theme.colors.status.success,
    text: theme.colors.status.successStrong,
  },
};

interface BannerProps extends ViewProps {
  message: string;
  variant?: BannerVariant;
}

/**
 * Inline status message for form-level feedback — a failed sign-in, a rejected
 * upload. Use for errors that belong to the form as a whole; per-field
 * validation belongs on the field itself.
 */
export function Banner({ message, variant = 'danger', style, ...props }: BannerProps) {
  const v = VARIANT_STYLES[variant];
  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={[
        {
          backgroundColor: v.bg,
          borderRadius: theme.radius.md,
          borderLeftWidth: 3,
          borderLeftColor: v.accent,
          paddingVertical: theme.spacing[3],
          paddingHorizontal: theme.spacing[4],
        },
        style,
      ]}
      {...props}
    >
      <Text.BodySm style={{ color: v.text, fontFamily: theme.font.family.sansMedium }}>{message}</Text.BodySm>
    </View>
  );
}
