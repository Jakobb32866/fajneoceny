import { useState } from 'react';
import { TextInput, View, type TextInputProps } from 'react-native';
import { theme } from '../../theme';
import { Text } from './Text';

interface TextFieldProps extends TextInputProps {
  label?: string;
  error?: string;
}

export function TextField({ label, error, style, onFocus, onBlur, ...props }: TextFieldProps) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={{ gap: theme.spacing[1] }}>
      {label ? <Text.Caption style={{ color: theme.colors.text.secondary }}>{label}</Text.Caption> : null}
      <TextInput
        placeholderTextColor={theme.colors.text.tertiary}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        style={[
          {
            borderWidth: 1,
            borderColor: error ? theme.colors.status.danger : focused ? theme.colors.border.focus : theme.colors.border.default,
            borderRadius: theme.radius.sm,
            paddingVertical: theme.spacing[3],
            paddingHorizontal: theme.spacing[3],
            fontSize: theme.font.size.body,
            fontFamily: theme.font.family.sans,
            color: theme.colors.text.primary,
            backgroundColor: theme.colors.surface.card,
          },
          style,
        ]}
        {...props}
      />
      {error ? <Text.BodySm style={{ color: theme.colors.status.danger }}>{error}</Text.BodySm> : null}
    </View>
  );
}
