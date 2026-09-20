import { View, type ViewProps } from 'react-native';
import { theme } from '../../theme';

interface CardProps extends ViewProps {
  inverse?: boolean;
  elevated?: boolean;
  padded?: boolean;
}

export function Card({ inverse = false, elevated = false, padded = true, style, ...props }: CardProps) {
  return (
    <View
      style={[
        {
          backgroundColor: inverse ? theme.colors.surface.inverse : theme.colors.surface.card,
          borderRadius: theme.radius.lg,
          padding: padded ? theme.spacing[4] : 0,
          borderWidth: inverse ? 0 : 1,
          borderColor: theme.colors.border.default,
        },
        elevated && theme.shadows.sm,
        style,
      ]}
      {...props}
    />
  );
}
