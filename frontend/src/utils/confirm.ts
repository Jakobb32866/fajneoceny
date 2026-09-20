import { Alert, Platform } from 'react-native';

/**
 * Cross-platform confirmation dialog. React Native's `Alert.alert` with buttons
 * is a no-op on react-native-web, so on web we fall back to the browser's native
 * `window.confirm`. Resolves true when the user confirms.
 */
export function confirmAsync(
  title: string,
  message: string,
  confirmLabel = 'Usuń',
): Promise<boolean> {
  if (Platform.OS === 'web') {
    if (typeof window === 'undefined' || !window.confirm) return Promise.resolve(false);
    return Promise.resolve(window.confirm(`${title}\n\n${message}`));
  }
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: 'Anuluj', style: 'cancel', onPress: () => resolve(false) },
      { text: confirmLabel, style: 'destructive', onPress: () => resolve(true) },
    ]);
  });
}
