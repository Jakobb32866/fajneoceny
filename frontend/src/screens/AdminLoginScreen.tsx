import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { useAdminAuth } from '../auth/AdminAuthContext';
import { ApiError } from '../api/errors';
import { Banner } from '../components/ui/Banner';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { TextField } from '../components/ui/Input';
import { Text } from '../components/ui/Text';
import { theme } from '../theme';

/**
 * Admin sign-in. A separate entry point from the student login because these
 * are separate accounts — a student's credentials will never work here.
 */
export function AdminLoginScreen({ onCancel }: { onCancel: () => void }) {
  const { signIn } = useAdminAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    setLoading(true);
    try {
      await signIn(email.trim(), password);
    } catch (err) {
      // The backend answers one uniform 401 for unknown email, missing
      // password and wrong password, so the message can't be more specific.
      setError(
        err instanceof ApiError && err.status === 401
          ? 'Nieprawidłowy e-mail lub hasło.'
          : 'Nie udało się zalogować. Spróbuj ponownie.',
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: 'center',
          alignItems: 'center',
          padding: theme.spacing[4],
          backgroundColor: theme.colors.surface.app,
        }}
      >
        <Card style={{ width: '100%', maxWidth: 420, gap: theme.spacing[4] }}>
          <View style={{ gap: theme.spacing[1] }}>
            <Text.HeadlineMd>Panel administratora</Text.HeadlineMd>
            <Text.BodySm style={{ color: theme.colors.text.secondary }}>
              To osobne konto — dane logowania studenta tu nie zadziałają.
            </Text.BodySm>
          </View>

          {error ? <Banner message={error} variant="danger" /> : null}

          <TextField
            label="E-mail"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="admin@uczelnia.pl"
          />
          <TextField
            label="Hasło"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            onSubmitEditing={submit}
          />

          <Button
            title="Zaloguj się"
            fullWidth
            loading={loading}
            disabled={!email.trim() || !password}
            onPress={submit}
          />

          <Button title="Wróć do aplikacji" variant="ghost" fullWidth onPress={onCancel} />
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
