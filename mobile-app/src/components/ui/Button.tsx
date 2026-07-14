import { ActivityIndicator, Pressable, StyleSheet, type PressableProps } from 'react-native';
import { theme } from '../../theme';
import { Text } from './Text';

export type ButtonVariant = 'primary' | 'accent' | 'ghost' | 'ghostInverse' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends Omit<PressableProps, 'style' | 'children'> {
  title: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  fullWidth?: boolean;
}

const SIZES: Record<ButtonSize, { paddingVertical: number; paddingHorizontal: number; fontSize: number }> = {
  sm: { paddingVertical: theme.spacing[2], paddingHorizontal: theme.spacing[3], fontSize: theme.font.size.bodySm },
  md: { paddingVertical: theme.spacing[3], paddingHorizontal: theme.spacing[5], fontSize: theme.font.size.body },
  lg: { paddingVertical: theme.spacing[4], paddingHorizontal: theme.spacing[6], fontSize: theme.font.size.bodyLg },
};

const VARIANT_STYLES: Record<ButtonVariant, { bg: string; text: string; border?: string }> = {
  primary: { bg: theme.colors.brand.default, text: theme.colors.brand.onBrand },
  accent: { bg: theme.colors.accent.default, text: theme.colors.accent.onAccent },
  ghost: { bg: 'transparent', text: theme.colors.text.primary, border: theme.colors.border.default },
  ghostInverse: { bg: 'transparent', text: theme.colors.text.inverse, border: theme.colors.border.inverse },
  danger: { bg: theme.colors.status.dangerSoft, text: theme.colors.status.dangerStrong },
};

export function Button({
  title,
  variant = 'primary',
  size = 'md',
  loading = false,
  fullWidth = false,
  disabled,
  ...pressableProps
}: ButtonProps) {
  const sizeStyle = SIZES[size];
  const variantStyle = VARIANT_STYLES[variant];
  const isDisabled = disabled || loading;

  return (
    <Pressable
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: variantStyle.bg,
          borderColor: variantStyle.border,
          borderWidth: variantStyle.border ? 1 : 0,
          paddingVertical: sizeStyle.paddingVertical,
          paddingHorizontal: sizeStyle.paddingHorizontal,
          opacity: isDisabled ? 0.6 : 1,
          transform: [{ scale: pressed && !isDisabled ? 0.97 : 1 }],
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
        },
      ]}
      {...pressableProps}
    >
      {loading ? (
        <ActivityIndicator color={variantStyle.text} size="small" />
      ) : (
        <Text.Body style={{ color: variantStyle.text, fontFamily: theme.font.family.sansSemibold, fontSize: sizeStyle.fontSize, textAlign: 'center' }}>
          {title}
        </Text.Body>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: theme.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
});
