import { useEffect, useRef, useState } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ActivityIndicator, Alert, ScrollView, View } from 'react-native';
import { invalidate, setCached } from '../api/cache';
import { cacheKeys } from '../api/cacheKeys';
import { api } from '../api/client';
import { useCachedQuery } from '../hooks/useCachedQuery';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { TextField } from '../components/ui/Input';
import { Text } from '../components/ui/Text';
import { theme } from '../theme';
import type { SrsSettings } from '../api/types';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;

// Form state mirrors SrsSettings but keeps every field as a string so text
// inputs (including in-progress decimal typing like "2.") don't get clobbered.
type FormState = {
  dailySessionSize: string;
  newCardsPerDay: string;
  learningStepsMinutes: string;
  relearningStepsMinutes: string;
  graduatingIntervalDays: string;
  easyIntervalDays: string;
  startingEase: string;
  easyBonus: string;
  hardMultiplier: string;
  lapseNewIntervalMultiplier: string;
  minimumIntervalDays: string;
  maximumIntervalDays: string;
  timezone: string;
  dayRolloverHour: string;
};

const DEFAULTS: FormState = {
  dailySessionSize: '30',
  newCardsPerDay: '20',
  learningStepsMinutes: '1,10',
  relearningStepsMinutes: '10',
  graduatingIntervalDays: '1',
  easyIntervalDays: '4',
  startingEase: '2.5',
  easyBonus: '1.3',
  hardMultiplier: '1.2',
  lapseNewIntervalMultiplier: '0.5',
  minimumIntervalDays: '1',
  maximumIntervalDays: '365',
  timezone: 'Europe/Warsaw',
  dayRolloverHour: '4',
};

function toForm(settings: SrsSettings): FormState {
  return {
    dailySessionSize: String(settings.dailySessionSize),
    newCardsPerDay: String(settings.newCardsPerDay),
    learningStepsMinutes: settings.learningStepsMinutes,
    relearningStepsMinutes: settings.relearningStepsMinutes,
    graduatingIntervalDays: String(settings.graduatingIntervalDays),
    easyIntervalDays: String(settings.easyIntervalDays),
    startingEase: String(settings.startingEase),
    easyBonus: String(settings.easyBonus),
    hardMultiplier: String(settings.hardMultiplier),
    lapseNewIntervalMultiplier: String(settings.lapseNewIntervalMultiplier),
    minimumIntervalDays: String(settings.minimumIntervalDays),
    maximumIntervalDays: String(settings.maximumIntervalDays),
    timezone: settings.timezone,
    dayRolloverHour: String(settings.dayRolloverHour),
  };
}

function toApi(form: FormState): SrsSettings {
  return {
    dailySessionSize: Number(form.dailySessionSize),
    newCardsPerDay: Number(form.newCardsPerDay),
    learningStepsMinutes: form.learningStepsMinutes.trim(),
    relearningStepsMinutes: form.relearningStepsMinutes.trim(),
    graduatingIntervalDays: Number(form.graduatingIntervalDays),
    easyIntervalDays: Number(form.easyIntervalDays),
    startingEase: Number(form.startingEase),
    easyBonus: Number(form.easyBonus),
    hardMultiplier: Number(form.hardMultiplier),
    lapseNewIntervalMultiplier: Number(form.lapseNewIntervalMultiplier),
    minimumIntervalDays: Number(form.minimumIntervalDays),
    maximumIntervalDays: Number(form.maximumIntervalDays),
    timezone: form.timezone.trim(),
    dayRolloverHour: Number(form.dayRolloverHour),
  };
}

// Parses a comma-separated list of step minutes (e.g. "1,10") and requires
// every entry to be a positive integer, mirroring the server-side check.
function parseSteps(raw: string): number[] | null {
  const parts = raw.split(',').map((p) => p.trim());
  if (parts.length === 0 || parts.some((p) => p === '')) return null;
  const nums = parts.map((p) => Number(p));
  if (nums.some((n) => !Number.isFinite(n) || !Number.isInteger(n) || n <= 0)) return null;
  return nums;
}

function inRange(n: number, min: number, max: number): boolean {
  return Number.isFinite(n) && n >= min && n <= max;
}

type Errors = Partial<Record<keyof FormState, string>>;

function validate(form: FormState): Errors {
  const errors: Errors = {};

  const dailySessionSize = Number(form.dailySessionSize);
  if (!inRange(dailySessionSize, 1, 500)) {
    errors.dailySessionSize = 'Podaj wartość od 1 do 500.';
  }

  const newCardsPerDay = Number(form.newCardsPerDay);
  if (!inRange(newCardsPerDay, 0, 1000)) {
    errors.newCardsPerDay = 'Podaj wartość od 0 do 1000.';
  }

  if (!parseSteps(form.learningStepsMinutes)) {
    errors.learningStepsMinutes = 'Podaj listę dodatnich liczb całkowitych, np. „1,10".';
  }

  if (!parseSteps(form.relearningStepsMinutes)) {
    errors.relearningStepsMinutes = 'Podaj listę dodatnich liczb całkowitych, np. „10".';
  }

  const graduatingIntervalDays = Number(form.graduatingIntervalDays);
  if (!Number.isFinite(graduatingIntervalDays) || graduatingIntervalDays < 1) {
    errors.graduatingIntervalDays = 'Wartość musi być co najmniej 1.';
  }

  const easyIntervalDays = Number(form.easyIntervalDays);
  if (!Number.isFinite(easyIntervalDays) || easyIntervalDays < 1) {
    errors.easyIntervalDays = 'Wartość musi być co najmniej 1.';
  }

  const startingEase = Number(form.startingEase);
  if (!Number.isFinite(startingEase) || startingEase < 1.3) {
    errors.startingEase = 'Wartość musi być co najmniej 1,3.';
  }

  const easyBonus = Number(form.easyBonus);
  if (!Number.isFinite(easyBonus) || easyBonus < 1.0) {
    errors.easyBonus = 'Wartość musi być co najmniej 1,0.';
  }

  const hardMultiplier = Number(form.hardMultiplier);
  if (!Number.isFinite(hardMultiplier) || hardMultiplier < 1.0) {
    errors.hardMultiplier = 'Wartość musi być co najmniej 1,0.';
  }

  const lapseNewIntervalMultiplier = Number(form.lapseNewIntervalMultiplier);
  if (!inRange(lapseNewIntervalMultiplier, 0, 1)) {
    errors.lapseNewIntervalMultiplier = 'Podaj wartość od 0 do 1.';
  }

  const minimumIntervalDays = Number(form.minimumIntervalDays);
  if (!Number.isFinite(minimumIntervalDays) || minimumIntervalDays < 1) {
    errors.minimumIntervalDays = 'Wartość musi być co najmniej 1.';
  }

  const maximumIntervalDays = Number(form.maximumIntervalDays);
  if (
    !Number.isFinite(maximumIntervalDays) ||
    !Number.isFinite(minimumIntervalDays) ||
    maximumIntervalDays < minimumIntervalDays
  ) {
    errors.maximumIntervalDays = 'Wartość musi być większa lub równa minimalnemu interwałowi.';
  }

  if (!form.timezone.trim()) {
    errors.timezone = 'Podaj strefę czasową.';
  }

  const dayRolloverHour = Number(form.dayRolloverHour);
  if (!Number.isFinite(dayRolloverHour) || !Number.isInteger(dayRolloverHour) || !inRange(dayRolloverHour, 0, 23)) {
    errors.dayRolloverHour = 'Podaj godzinę od 0 do 23.';
  }

  return errors;
}

export function SettingsScreen({ navigation }: Props) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>(DEFAULTS);

  const { data: settings, loading, error } = useCachedQuery(cacheKeys.srsSettings, () => api.getSrsSettings());

  // Seed the form from the server exactly once. A later background
  // revalidation must not overwrite what the student is currently typing.
  const seeded = useRef(false);
  useEffect(() => {
    if (settings && !seeded.current) {
      seeded.current = true;
      setForm(toForm(settings));
    }
  }, [settings]);

  const alerted = useRef(false);
  useEffect(() => {
    if (error && !alerted.current) {
      alerted.current = true;
      Alert.alert('Nie udało się wczytać ustawień', 'Spróbuj ponownie później.');
    }
  }, [error]);

  const setField = (key: keyof FormState) => (value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const errors = validate(form);
  const isValid = Object.keys(errors).length === 0;

  const onSave = async () => {
    if (!isValid) return;
    setSaving(true);
    try {
      const updated = await api.updateSrsSettings(toApi(form));
      setForm(toForm(updated));
      // Write through rather than invalidate — we already have the fresh value,
      // so no refetch is needed. Session size feeds the dashboard subtitle.
      setCached(cacheKeys.srsSettings, updated);
      invalidate(cacheKeys.dailySummary);
      Alert.alert('Zapisano', 'Ustawienia powtórek zostały zaktualizowane.');
    } catch (e) {
      Alert.alert('Nie udało się zapisać ustawień', String(e));
    } finally {
      setSaving(false);
    }
  };

  const onRestoreDefaults = () => {
    setForm(DEFAULTS);
  };

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.surface.app }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.surface.app }}>
      <ScrollView
        contentContainerStyle={{
          padding: theme.spacing[4],
          gap: theme.spacing[4],
          paddingBottom: theme.spacing[8],
          width: '100%',
          maxWidth: theme.layout.contentMaxWidth,
          alignSelf: 'center',
        }}
      >
        <Card style={{ gap: theme.spacing[3] }}>
          <Text.Title>Sesja</Text.Title>

          <View style={{ gap: theme.spacing[1] }}>
            <TextField
              label="Dzienny limit sesji"
              value={form.dailySessionSize}
              onChangeText={setField('dailySessionSize')}
              keyboardType="numeric"
              error={errors.dailySessionSize}
            />
            <Text.BodySm style={{ color: theme.colors.text.tertiary }}>
              Maksymalna liczba fiszek (nowych i powtórek razem) w jednej dziennej sesji.
            </Text.BodySm>
          </View>

          <View style={{ gap: theme.spacing[1] }}>
            <TextField
              label="Nowe fiszki dziennie"
              value={form.newCardsPerDay}
              onChangeText={setField('newCardsPerDay')}
              keyboardType="numeric"
              error={errors.newCardsPerDay}
            />
            <Text.BodySm style={{ color: theme.colors.text.tertiary }}>
              Ile nowych, nigdy wcześniej nie widzianych fiszek może pojawić się w jednym dniu.
            </Text.BodySm>
          </View>
        </Card>

        <Card style={{ gap: theme.spacing[3] }}>
          <Text.Title>Nauka</Text.Title>

          <View style={{ gap: theme.spacing[1] }}>
            <TextField
              label="Kroki nauki (min)"
              value={form.learningStepsMinutes}
              onChangeText={setField('learningStepsMinutes')}
              placeholder="1,10"
              error={errors.learningStepsMinutes}
            />
            <Text.BodySm style={{ color: theme.colors.text.tertiary }}>
              Odstępy w minutach między kolejnymi powtórzeniami nowej fiszki, np. „1,10" — najpierw po minucie, potem po 10.
            </Text.BodySm>
          </View>

          <View style={{ gap: theme.spacing[1] }}>
            <TextField
              label="Kroki ponownej nauki (min)"
              value={form.relearningStepsMinutes}
              onChangeText={setField('relearningStepsMinutes')}
              placeholder="10"
              error={errors.relearningStepsMinutes}
            />
            <Text.BodySm style={{ color: theme.colors.text.tertiary }}>
              Odstępy w minutach stosowane, gdy zapomnisz fiszkę i musi przejść naukę od nowa.
            </Text.BodySm>
          </View>

          <View style={{ gap: theme.spacing[1] }}>
            <TextField
              label="Interwał absolwencki (dni)"
              value={form.graduatingIntervalDays}
              onChangeText={setField('graduatingIntervalDays')}
              keyboardType="numeric"
              error={errors.graduatingIntervalDays}
            />
            <Text.BodySm style={{ color: theme.colors.text.tertiary }}>
              Po ilu dniach fiszka trafia po raz pierwszy do powtórek po ukończeniu nauki z oceną „dobrze".
            </Text.BodySm>
          </View>

          <View style={{ gap: theme.spacing[1] }}>
            <TextField
              label="Interwał »łatwe« (dni)"
              value={form.easyIntervalDays}
              onChangeText={setField('easyIntervalDays')}
              keyboardType="numeric"
              error={errors.easyIntervalDays}
            />
            <Text.BodySm style={{ color: theme.colors.text.tertiary }}>
              Po ilu dniach fiszka trafia do powtórek, jeśli podczas nauki ocenisz ją jako „łatwe".
            </Text.BodySm>
          </View>
        </Card>

        <Card style={{ gap: theme.spacing[3] }}>
          <Text.Title>Powtórki</Text.Title>

          <View style={{ gap: theme.spacing[1] }}>
            <TextField
              label="Startowa łatwość"
              value={form.startingEase}
              onChangeText={setField('startingEase')}
              keyboardType="numeric"
              error={errors.startingEase}
            />
            <Text.BodySm style={{ color: theme.colors.text.tertiary }}>
              Początkowy mnożnik łatwości nowej fiszki — im wyższy, tym szybciej rosną odstępy między powtórkami.
            </Text.BodySm>
          </View>

          <View style={{ gap: theme.spacing[1] }}>
            <TextField
              label="Bonus »łatwe«"
              value={form.easyBonus}
              onChangeText={setField('easyBonus')}
              keyboardType="numeric"
              error={errors.easyBonus}
            />
            <Text.BodySm style={{ color: theme.colors.text.tertiary }}>
              Dodatkowy mnożnik stosowany do interwału, gdy podczas powtórki ocenisz fiszkę jako „łatwe".
            </Text.BodySm>
          </View>

          <View style={{ gap: theme.spacing[1] }}>
            <TextField
              label="Mnożnik »trudne«"
              value={form.hardMultiplier}
              onChangeText={setField('hardMultiplier')}
              keyboardType="numeric"
              error={errors.hardMultiplier}
            />
            <Text.BodySm style={{ color: theme.colors.text.tertiary }}>
              Mnożnik interwału stosowany, gdy podczas powtórki ocenisz fiszkę jako „trudne".
            </Text.BodySm>
          </View>

          <View style={{ gap: theme.spacing[1] }}>
            <TextField
              label="Mnożnik po wpadce"
              value={form.lapseNewIntervalMultiplier}
              onChangeText={setField('lapseNewIntervalMultiplier')}
              keyboardType="numeric"
              error={errors.lapseNewIntervalMultiplier}
            />
            <Text.BodySm style={{ color: theme.colors.text.tertiary }}>
              Jaką część poprzedniego interwału zachować, gdy zapomnisz fiszkę podczas powtórki (0–1).
            </Text.BodySm>
          </View>

          <View style={{ gap: theme.spacing[1] }}>
            <TextField
              label="Min. interwał (dni)"
              value={form.minimumIntervalDays}
              onChangeText={setField('minimumIntervalDays')}
              keyboardType="numeric"
              error={errors.minimumIntervalDays}
            />
            <Text.BodySm style={{ color: theme.colors.text.tertiary }}>
              Najkrótszy możliwy odstęp między powtórkami dla dojrzałej fiszki.
            </Text.BodySm>
          </View>

          <View style={{ gap: theme.spacing[1] }}>
            <TextField
              label="Maks. interwał (dni)"
              value={form.maximumIntervalDays}
              onChangeText={setField('maximumIntervalDays')}
              keyboardType="numeric"
              error={errors.maximumIntervalDays}
            />
            <Text.BodySm style={{ color: theme.colors.text.tertiary }}>
              Najdłuższy możliwy odstęp między powtórkami — dłuższe interwały zostaną do niego przycięte.
            </Text.BodySm>
          </View>
        </Card>

        <Card style={{ gap: theme.spacing[3] }}>
          <Text.Title>Dzień</Text.Title>

          <View style={{ gap: theme.spacing[1] }}>
            <TextField
              label="Strefa czasowa"
              value={form.timezone}
              onChangeText={setField('timezone')}
              placeholder="Europe/Warsaw"
              error={errors.timezone}
            />
            <Text.BodySm style={{ color: theme.colors.text.tertiary }}>
              Strefa czasowa (IANA), względem której liczone są dni i terminy powtórek.
            </Text.BodySm>
          </View>

          <View style={{ gap: theme.spacing[1] }}>
            <TextField
              label="Godzina zmiany dnia"
              value={form.dayRolloverHour}
              onChangeText={setField('dayRolloverHour')}
              keyboardType="numeric"
              error={errors.dayRolloverHour}
            />
            <Text.BodySm style={{ color: theme.colors.text.tertiary }}>
              Godzina (0–23), o której zaczyna się nowy dzień nauki — podobnie jak w Anki.
            </Text.BodySm>
          </View>
        </Card>

        <View style={{ gap: theme.spacing[3] }}>
          <Button title="Zapisz" onPress={onSave} loading={saving} disabled={!isValid || saving} fullWidth />
          <Button title="Przywróć domyślne" variant="ghost" onPress={onRestoreDefaults} disabled={saving} fullWidth />
        </View>
      </ScrollView>
    </View>
  );
}
