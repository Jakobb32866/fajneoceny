import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { googleErrorMessage, loginErrorMessage, registerErrorMessage } from '../auth/authErrors';
import { LoginFeatures } from '../components/LoginFeatures';
import { UniversityPicker, type UniversityPickerValue } from '../components/UniversityPicker';
import { Banner } from '../components/ui/Banner';
import { Logo } from '../components/ui/Brand';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { TextField } from '../components/ui/Input';
import { Text } from '../components/ui/Text';
import { theme } from '../theme';

type Mode = 'login' | 'register';

export function LoginScreen({ onAdminPress }: { onAdminPress?: () => void }) {
  const { signInWithEmail, register, signInWithGoogle, completeGoogleProfile } = useAuth();

  const { width } = useWindowDimensions();
  const isWide = width >= 900;

  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [school, setSchool] = useState<UniversityPickerValue>({ universityId: null, schoolName: '' });

  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [googleNeedsSchool, setGoogleNeedsSchool] = useState(false);
  const [googleSchool, setGoogleSchool] = useState<UniversityPickerValue>({ universityId: null, schoolName: '' });
  const [savingGoogleSchool, setSavingGoogleSchool] = useState(false);

  const registerSchoolValid = !!school.universityId || !!school.schoolName.trim();
  const googleSchoolValid = !!googleSchool.universityId || !!googleSchool.schoolName.trim();

  async function handleSubmit() {
    setError(null);
    setLoading(true);
    try {
      if (mode === 'login') {
        await signInWithEmail(email.trim(), password);
      } else {
        await register({
          email: email.trim(),
          password,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          universityId: school.universityId ?? undefined,
          schoolName: school.universityId ? undefined : school.schoolName.trim() || undefined,
        });
      }
    } catch (e) {
      setError(mode === 'login' ? loginErrorMessage(e) : registerErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleSignIn() {
    setError(null);
    setGoogleLoading(true);
    try {
      const result = await signInWithGoogle();
      if (result.needsSchoolName) {
        setGoogleNeedsSchool(true);
      }
    } catch (e) {
      setError(googleErrorMessage(e));
    } finally {
      setGoogleLoading(false);
    }
  }

  async function handleSaveGoogleSchool() {
    setError(null);
    setSavingGoogleSchool(true);
    try {
      await completeGoogleProfile({
        universityId: googleSchool.universityId ?? undefined,
        schoolName: googleSchool.universityId ? undefined : googleSchool.schoolName.trim() || undefined,
      });
    } catch (e) {
      setError(googleErrorMessage(e));
    } finally {
      setSavingGoogleSchool(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.colors.surface.app }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: 'center',
          padding: theme.spacing[6],
        }}
        keyboardShouldPersistTaps="handled"
      >
        <View
          style={{
            width: '100%',
            maxWidth: isWide ? 960 : 460,
            alignSelf: 'center',
            flexDirection: isWide ? 'row' : 'column',
            alignItems: isWide ? 'center' : 'stretch',
            gap: isWide ? theme.spacing[16] : theme.spacing[10],
          }}
        >
          <View style={{ flex: isWide ? 1 : undefined }}>
            <View style={{ alignItems: 'center', marginBottom: theme.spacing[6] }}>
              <Logo size={44} />
              <Text.Body
                style={{
                  color: theme.colors.text.secondary,
                  marginTop: theme.spacing[1],
                  textAlign: 'center',
                }}
              >
                Twoje przedmioty, notatki i fiszki w jednym miejscu
              </Text.Body>
            </View>

            <Card elevated style={{ gap: theme.spacing[4] }}>
              {googleNeedsSchool ? (
                <>
                  <Text.Title>Ostatni krok</Text.Title>
                  <Text.BodySm>
                    Podaj nazwę swojej szkoły, żeby dokończyć zakładanie konta przez Google.
                  </Text.BodySm>
                  <UniversityPicker value={googleSchool} onChange={setGoogleSchool} />
                  {error ? <Banner message={error} /> : null}
                  <Button
                    title="Zapisz"
                    onPress={handleSaveGoogleSchool}
                    loading={savingGoogleSchool}
                    disabled={!googleSchoolValid}
                    fullWidth
                  />
                </>
              ) : (
                <>
                  <Text.Title>{mode === 'login' ? 'Zaloguj się' : 'Załóż konto'}</Text.Title>

                  <TextField
                    label="E-mail"
                    placeholder="jan.kowalski@example.com"
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                  />
                  <TextField
                    label="Hasło"
                    placeholder="••••••••"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                    autoCapitalize="none"
                  />

                  {mode === 'register' ? (
                    <>
                      <TextField
                        label="Imię"
                        placeholder="Jan"
                        value={firstName}
                        onChangeText={setFirstName}
                      />
                      <TextField
                        label="Nazwisko"
                        placeholder="Kowalski"
                        value={lastName}
                        onChangeText={setLastName}
                      />
                      <UniversityPicker value={school} onChange={setSchool} />
                    </>
                  ) : null}

                  {error ? <Banner message={error} /> : null}

                  <Button
                    title={mode === 'login' ? 'Zaloguj się' : 'Zarejestruj się'}
                    onPress={handleSubmit}
                    loading={loading}
                    disabled={mode === 'register' && !registerSchoolValid}
                    fullWidth
                  />

                  <Button
                    title={
                      mode === 'login' ? 'Nie masz konta? Zarejestruj się' : 'Masz już konto? Zaloguj się'
                    }
                    variant="ghost"
                    onPress={() => {
                      setError(null);
                      setMode(mode === 'login' ? 'register' : 'login');
                    }}
                    fullWidth
                  />

                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: theme.spacing[3],
                    }}
                  >
                    <View
                      style={{
                        flex: 1,
                        height: 1,
                        backgroundColor: theme.colors.border.default,
                      }}
                    />
                    <Text.Caption>lub</Text.Caption>
                    <View
                      style={{
                        flex: 1,
                        height: 1,
                        backgroundColor: theme.colors.border.default,
                      }}
                    />
                  </View>

                  <Button
                    title="Zaloguj przez Google"
                    variant="ghost"
                    onPress={handleGoogleSignIn}
                    loading={googleLoading}
                    fullWidth
                  />
                </>
              )}
            </Card>
          </View>

          <View style={{ flex: isWide ? 1 : undefined }}>
            <LoginFeatures />
          </View>
        </View>

        {/* Deliberately understated: admins are a handful of people, and this
            is not a door students need to notice. */}
        {onAdminPress ? (
          <Pressable
            onPress={onAdminPress}
            style={{ alignSelf: 'center', padding: theme.spacing[3], marginTop: theme.spacing[2] }}
          >
            <Text.Caption style={{ color: theme.colors.text.tertiary }}>Panel administratora</Text.Caption>
          </Pressable>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
