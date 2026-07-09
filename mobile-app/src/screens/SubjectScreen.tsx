import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as DocumentPicker from 'expo-document-picker';
import {
  ActivityIndicator,
  Alert,
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
import { GradeSheet } from '../components/GradeSheet';
import type { RootStackParamList } from '../navigation/types';
import type { LessonSummary } from '../api/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Subject'>;
type Tab = 'lessons' | 'grades';

export function SubjectScreen({ route, navigation }: Props) {
  const { subjectId, subjectName } = route.params;
  const [tab, setTab] = useState<Tab>('lessons');
  const [lessons, setLessons] = useState<LessonSummary[] | null>(null);
  const [createVisible, setCreateVisible] = useState(false);

  const load = useCallback(() => {
    api.listLessons(subjectId).then(setLessons).catch(() => setLessons([]));
  }, [subjectId]);

  useFocusEffect(load);

  const pickSyllabus = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: [
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ],
    });
    if (result.canceled) return;

    const file = result.assets[0];
    try {
      const uploadResult = await api.uploadSyllabus(subjectId, {
        uri: file.uri,
        name: file.name,
        mimeType: file.mimeType,
      });
      Alert.alert(
        'Zasady zaliczenia wczytane',
        `Znaleziono ${uploadResult.draftComponents.length} składników oceny. Sprawdź i popraw je w zakładce "Arkusz ocen".`,
      );
      setTab('grades');
    } catch (e) {
      Alert.alert('Nie udało się wczytać pliku', String(e));
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{subjectName}</Text>

      <View style={styles.tabBar}>
        <TouchableOpacity style={[styles.tab, tab === 'lessons' && styles.tabActive]} onPress={() => setTab('lessons')}>
          <Text style={tab === 'lessons' ? styles.tabTextActive : styles.tabText}>Lekcje</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, tab === 'grades' && styles.tabActive]} onPress={() => setTab('grades')}>
          <Text style={tab === 'grades' ? styles.tabTextActive : styles.tabText}>Arkusz ocen</Text>
        </TouchableOpacity>
      </View>

      {tab === 'lessons' ? (
        <>
          <TouchableOpacity style={styles.syllabusButton} onPress={pickSyllabus}>
            <Text style={styles.syllabusButtonText}>📄 Wczytaj zasady zaliczenia (PDF/Word)</Text>
          </TouchableOpacity>

          {lessons === null ? (
            <ActivityIndicator style={{ marginTop: 32 }} />
          ) : (
            <FlatList
              data={lessons}
              keyExtractor={(l) => l.id}
              contentContainerStyle={{ padding: 16, gap: 12 }}
              ListEmptyComponent={<Text style={styles.empty}>Brak lekcji — dodaj pierwszą poniżej.</Text>}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.lessonCard}
                  onPress={() => navigation.navigate('Lesson', { lessonId: item.id, lessonTitle: item.title })}
                >
                  <Text style={styles.lessonTitle}>{item.title}</Text>
                  <Text style={styles.lessonMeta}>{item.flashcardCount} fiszek</Text>
                </TouchableOpacity>
              )}
            />
          )}

          <TouchableOpacity style={styles.fab} onPress={() => setCreateVisible(true)}>
            <Text style={styles.fabText}>+</Text>
          </TouchableOpacity>

          <CreateLessonModal
            visible={createVisible}
            onClose={() => setCreateVisible(false)}
            onSubmit={async (title) => {
              await api.createLesson(subjectId, title);
              setCreateVisible(false);
              load();
            }}
          />
        </>
      ) : (
        <GradeSheet subjectId={subjectId} />
      )}
    </View>
  );
}

function CreateLessonModal({
  visible,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  onClose: () => void;
  onSubmit: (title: string) => void;
}) {
  const [title, setTitle] = useState('');

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.modalTitle}>Nowa lekcja</Text>
          <TextInput style={styles.input} placeholder="Tytuł lekcji" value={title} onChangeText={setTitle} />
          <TouchableOpacity style={styles.submitButton} onPress={() => title.trim() && onSubmit(title.trim())}>
            <Text style={styles.submitText}>Utwórz</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'white' },
  title: { fontSize: 22, fontWeight: '700', paddingHorizontal: 16, paddingTop: 16 },
  tabBar: { flexDirection: 'row', margin: 16, backgroundColor: '#f2f4f7', borderRadius: 12, padding: 4 },
  tab: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  tabActive: { backgroundColor: '#111827' },
  tabText: { color: '#555', fontWeight: '600' },
  tabTextActive: { color: 'white', fontWeight: '600' },
  syllabusButton: { marginHorizontal: 16, marginBottom: 8, backgroundColor: '#eef2ff', borderRadius: 10, padding: 12 },
  syllabusButtonText: { color: '#3730a3', fontWeight: '600', textAlign: 'center' },
  empty: { textAlign: 'center', color: '#999', marginTop: 24 },
  lessonCard: { backgroundColor: '#f2f4f7', borderRadius: 14, padding: 16 },
  lessonTitle: { fontSize: 16, fontWeight: '700' },
  lessonMeta: { color: '#666', marginTop: 2, fontSize: 13 },
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
