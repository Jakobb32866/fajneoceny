import { useState } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { Plus } from 'lucide-react-native';
import { invalidate } from '../api/cache';
import { cacheKeys } from '../api/cacheKeys';
import { api } from '../api/client';
import { useCachedQuery } from '../hooks/useCachedQuery';
import { Badge } from '../components/ui/Badge';
import { CreateSubjectModal } from '../components/CreateSubjectModal';
import { Text } from '../components/ui/Text';
import { theme } from '../theme';
import type { RootStackParamList } from '../navigation/types';
import type { SubjectSummary } from '../api/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Subjects'>;

export function SubjectsScreen({ navigation }: Props) {
  const [createVisible, setCreateVisible] = useState(false);
  const subjectsQuery = useCachedQuery<SubjectSummary[]>(cacheKeys.subjects, () => api.listSubjects());
  const subjects = subjectsQuery.data ?? (subjectsQuery.error ? [] : null);

  return (
    <View style={styles.container}>
      <View style={styles.content}>
      {subjects === null ? (
        <ActivityIndicator style={{ marginTop: 32 }} />
      ) : (
        <FlatList
          data={subjects}
          keyExtractor={(s) => s.id}
          contentContainerStyle={{ padding: theme.spacing[4], gap: theme.spacing[3] }}
          ListEmptyComponent={
            <Text.Body
              style={{ color: theme.colors.text.tertiary, textAlign: 'center', marginTop: theme.spacing[6] }}
            >
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
                label={
                  item.currentEstimatePercent === null ? '—' : `${item.currentEstimatePercent.toFixed(0)}%`
                }
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
        <Plus size={26} color={theme.colors.brand.onBrand} strokeWidth={2.5} />
      </Pressable>
      </View>

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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.surface.app },
  content: { flex: 1, width: '100%', maxWidth: theme.layout.contentMaxWidth, alignSelf: 'center' },
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
