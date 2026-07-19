import { useState } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { invalidate } from '../api/cache';
import { cacheKeys } from '../api/cacheKeys';
import { api } from '../api/client';
import { useCachedQuery } from '../hooks/useCachedQuery';
import { useAuth } from '../auth/AuthContext';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { ModalSheet } from '../components/ui/ModalSheet';
import { TextField } from '../components/ui/Input';
import { Text } from '../components/ui/Text';
import { theme } from '../theme';
import type { RootStackParamList } from '../navigation/types';
import type { DailySummary, SubjectSummary } from '../api/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Dashboard'>;

// Describes the daily-review backlog on the dashboard card. Acts as the app's
// "notification": a calm confirmation when clear, a plain count under the
// session size, and a warning once the backlog exceeds one session.
function dailySubtitle(summary: DailySummary | null): { text: string; warning: boolean } {
  if (summary === null) return { text: '…', warning: false };
  if (summary.dueCount === 0) {
    return summary.newAvailable > 0
      ? { text: 'Wszystko powtórzone ✓ — dostępne nowe fiszki', warning: false }
      : { text: 'Wszystko powtórzone ✓', warning: false };
  }
  if (summary.dueCount > summary.dailySessionSize) {
    return { text: `${summary.dueCount} fiszek czeka — masz zaległości!`, warning: true };
  }
  return { text: `${summary.dueCount} ${pluralFiszki(summary.dueCount)} do powtórki dziś`, warning: false };
}

function pluralFiszki(n: number): string {
  if (n === 1) return 'fiszka';
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)) return 'fiszki';
  return 'fiszek';
}

export function DashboardScreen({ navigation }: Props) {
  const [createVisible, setCreateVisible] = useState(false);
  const { signOut } = useAuth();

  const subjectsQuery = useCachedQuery<SubjectSummary[]>(cacheKeys.subjects, () => api.listSubjects());
  const summaryQuery = useCachedQuery<DailySummary>(cacheKeys.dailySummary, () => api.getDailySummary());

  // Preserves the previous behaviour of falling back to an empty list / no
  // summary on error rather than surfacing anything to the student.
  const subjects = subjectsQuery.data ?? (subjectsQuery.error ? [] : null);
  const daily = dailySubtitle(summaryQuery.data ?? null);

  return (
    <View style={styles.container}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 12 }}>
        <Button title="⚙️ Ustawienia" variant="ghost" size="sm" onPress={() => navigation.navigate('Settings')} />
        <Button title="Wyloguj" variant="ghost" size="sm" onPress={signOut} />
      </View>
      <Pressable style={styles.dailyCard} onPress={() => navigation.navigate('DailyFlashcards')}>
        <Text.Title style={{ color: theme.colors.text.inverse }}>📚 Dzisiejsze fiszki</Text.Title>
        <Text.BodySm
          style={{
            color: daily.warning ? theme.colors.status.warning : theme.colors.text.inverseSecondary,
            marginTop: theme.spacing[1],
          }}
        >
          {daily.text}
        </Text.BodySm>
      </Pressable>

      {subjects === null ? (
        <ActivityIndicator style={{ marginTop: 32 }} />
      ) : (
        <FlatList
          data={subjects}
          keyExtractor={(s) => s.id}
          contentContainerStyle={{ padding: theme.spacing[4], gap: theme.spacing[3] }}
          ListEmptyComponent={
            <Text.Body style={{ color: theme.colors.text.tertiary, textAlign: 'center', marginTop: theme.spacing[6] }}>
              Brak przedmiotów — dodaj pierwszy poniżej.
            </Text.Body>
          }
          renderItem={({ item }) => (
            <Pressable
              style={styles.subjectCard}
              onPress={() => navigation.navigate('Subject', { subjectId: item.id, subjectName: item.name })}
            >
              <View style={{ flex: 1 }}>
                <Text.BodyLg style={{ fontFamily: theme.font.family.sansSemibold }}>{item.name}</Text.BodyLg>
                <Text.BodySm style={{ color: theme.colors.text.secondary, marginTop: theme.spacing[1] }}>
                  {item.lessonCount} lekcji
                </Text.BodySm>
              </View>
              <Badge
                label={item.currentEstimatePercent === null ? '—' : `${item.currentEstimatePercent.toFixed(0)}%`}
                variant={
                  item.currentEstimatePercent === null
                    ? 'neutral'
                    : item.currentEstimatePercent >= 50
                      ? 'success'
                      : 'warning'
                }
              />
            </Pressable>
          )}
        />
      )}

      <Pressable style={styles.fab} onPress={() => setCreateVisible(true)}>
        <Text.HeadlineMd style={{ color: theme.colors.brand.onBrand, lineHeight: 30 }}>+</Text.HeadlineMd>
      </Pressable>

      <CreateSubjectModal
        visible={createVisible}
        onClose={() => setCreateVisible(false)}
        onSubmit={async (name, description) => {
          await api.createSubject(name, description);
          setCreateVisible(false);
          invalidate(cacheKeys.subjects);
        }}
      />
    </View>
  );
}

function CreateSubjectModal({
  visible,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  onClose: () => void;
  onSubmit: (name: string, description?: string) => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  return (
    <ModalSheet visible={visible} onClose={onClose} title="Nowy przedmiot">
      <TextField label="Nazwa przedmiotu" placeholder="Nazwa przedmiotu" value={name} onChangeText={setName} />
      <TextField
        label="Opis (opcjonalnie)"
        placeholder="Opis (opcjonalnie)"
        value={description}
        onChangeText={setDescription}
      />
      <Button
        title="Utwórz"
        onPress={() => name.trim() && onSubmit(name.trim(), description.trim() || undefined)}
        fullWidth
      />
    </ModalSheet>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.surface.app },
  dailyCard: {
    margin: theme.spacing[4],
    backgroundColor: theme.colors.surface.inverse,
    borderRadius: theme.radius.lg,
    padding: theme.spacing[5],
  },
  subjectCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface.sunken,
    borderRadius: theme.radius.md,
    padding: theme.spacing[4],
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 28,
    width: 56,
    height: 56,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.brand.default,
    alignItems: 'center',
    justifyContent: 'center',
    ...theme.shadows.md,
  },
});
