import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { api } from '../api/client';
import type { RootStackParamList } from '../navigation/types';
import type { SubjectSummary } from '../api/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Dashboard'>;

export function DashboardScreen({ navigation }: Props) {
  const [subjects, setSubjects] = useState<SubjectSummary[] | null>(null);
  const [createVisible, setCreateVisible] = useState(false);

  const load = useCallback(() => {
    api.listSubjects().then(setSubjects).catch(() => setSubjects([]));
  }, []);

  useFocusEffect(load);

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.dailyCard} onPress={() => navigation.navigate('DailyFlashcards')}>
        <Text style={styles.dailyTitle}>📚 Dzisiejsze fiszki</Text>
        <Text style={styles.dailySubtitle}>30 kart dobranych na dziś</Text>
      </TouchableOpacity>

      {subjects === null ? (
        <ActivityIndicator style={{ marginTop: 32 }} />
      ) : (
        <FlatList
          data={subjects}
          keyExtractor={(s) => s.id}
          contentContainerStyle={{ padding: 16, gap: 12 }}
          ListEmptyComponent={<Text style={styles.empty}>Brak przedmiotów — dodaj pierwszy poniżej.</Text>}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.subjectCard}
              onPress={() => navigation.navigate('Subject', { subjectId: item.id, subjectName: item.name })}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.subjectName}>{item.name}</Text>
                <Text style={styles.subjectMeta}>{item.lessonCount} lekcji</Text>
              </View>
              <View style={styles.gradeBadge}>
                <Text style={styles.gradeBadgeText}>
                  {item.currentEstimatePercent === null ? '—' : `${item.currentEstimatePercent.toFixed(0)}%`}
                </Text>
              </View>
            </TouchableOpacity>
          )}
        />
      )}

      <TouchableOpacity style={styles.fab} onPress={() => setCreateVisible(true)}>
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>

      <CreateSubjectModal
        visible={createVisible}
        onClose={() => setCreateVisible(false)}
        onSubmit={async (name, description) => {
          await api.createSubject(name, description);
          setCreateVisible(false);
          load();
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
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.modalTitle}>Nowy przedmiot</Text>
          <TextInput style={styles.input} placeholder="Nazwa przedmiotu" value={name} onChangeText={setName} />
          <TextInput
            style={styles.input}
            placeholder="Opis (opcjonalnie)"
            value={description}
            onChangeText={setDescription}
          />
          <TouchableOpacity
            style={styles.submitButton}
            onPress={() => name.trim() && onSubmit(name.trim(), description.trim() || undefined)}
          >
            <Text style={styles.submitText}>Utwórz</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'white' },
  dailyCard: { margin: 16, backgroundColor: '#111827', borderRadius: 16, padding: 20 },
  dailyTitle: { color: 'white', fontSize: 18, fontWeight: '700' },
  dailySubtitle: { color: '#9ca3af', marginTop: 4 },
  empty: { textAlign: 'center', color: '#999', marginTop: 24 },
  subjectCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f2f4f7',
    borderRadius: 14,
    padding: 16,
  },
  subjectName: { fontSize: 16, fontWeight: '700' },
  subjectMeta: { color: '#666', marginTop: 2, fontSize: 13 },
  gradeBadge: { backgroundColor: 'white', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  gradeBadgeText: { fontWeight: '700' },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 28,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
  },
  fabText: { color: 'white', fontSize: 28, lineHeight: 30 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 24 },
  modalCard: { backgroundColor: 'white', borderRadius: 16, padding: 20, gap: 12 },
  modalTitle: { fontSize: 17, fontWeight: '700' },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 10, fontSize: 14 },
  submitButton: { backgroundColor: '#111827', borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 4 },
  submitText: { color: 'white', fontWeight: '700' },
});
