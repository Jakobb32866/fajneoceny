import { Pressable, type PressableProps } from 'react-native';
import { theme } from '../../theme';
import { Text } from './Text';

interface ChipProps extends Omit<PressableProps, 'style' | 'children'> {
  label: string;
  selected?: boolean;
}

export function Chip({ label, selected = false, ...props }: ChipProps) {
  return (
    <Pressable
      style={{
        paddingVertical: theme.spacing[2],
        paddingHorizontal: theme.spacing[3],
        borderRadius: theme.radius.full,
        backgroundColor: selected ? theme.colors.brand.default : theme.colors.surface.sunken,
      }}
      {...props}
    >
      <Text.BodySm
        style={{
          color: selected ? theme.colors.brand.onBrand : theme.colors.text.secondary,
          fontFamily: selected ? theme.font.family.sansSemibold : theme.font.family.sansMedium,
        }}
      >
        {label}
      </Text.BodySm>
    </Pressable>
  );
}
