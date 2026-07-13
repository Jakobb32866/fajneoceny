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
  const [syllabusChooserVisible, setSyllabusChooserVisible] = useState(false);
  const [pasteVisible, setPasteVisible] = useState(false);

  const load = useCallback(() => {
    api.listLessons(subjectId).then(setLessons).catch(() => setLessons([]));
  }, [subjectId]);

  useFocusEffect(load);

  const onSyllabusLoaded = (count: number) => {
    Alert.alert(
      'Zasady zaliczenia wczytane',
      `Znaleziono ${count} składników oceny. Sprawdź i popraw je w zakładce "Arkusz ocen".`,
    );
    setTab('grades');
  };

  const pickSyllabusFile = async () => {
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
      onSyllabusLoaded(uploadResult.draftComponents.length);
    } catch (e) {
      Alert.alert('Nie udało się wczytać pliku', String(e));
    }
  };

  const submitPastedSyllabus = async (text: string) => {
    try {
      const uploadResult = await api.uploadSyllabusText(subjectId, text);
      setPasteVisible(false);
      onSyllabusLoaded(uploadResult.draftComponents.length);
    } catch (e) {
      Alert.alert('Nie udało się wczytać tekstu', String(e));
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
          <TouchableOpacity style={styles.syllabusButton} onPress={() => setSyllabusChooserVisible(true)}>
            <Text style={styles.syllabusButtonText}>📄 Wgraj zasady zaliczenia</Text>
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

          <SyllabusChooserModal
            visible={syllabusChooserVisible}
            onClose={() => setSyllabusChooserVisible(false)}
            onPickFile={() => {
              setSyllabusChooserVisible(false);
              pickSyllabusFile();
            }}
            onPasteText={() => {
              setSyllabusChooserVisible(false);
              setPasteVisible(true);
            }}
          />

          <PasteSyllabusModal
            visible={pasteVisible}
            onClose={() => setPasteVisible(false)}
            onSubmit={submitPastedSyllabus}
          />
        </>
      ) : (
        <GradeSheet subjectId={subjectId} />
      )}
    </View>
  );
}

function SyllabusChooserModal({
  visible,
  onClose,
  onPickFile,
  onPasteText,
}: {
  visible: boolean;
  onClose: () => void;
  onPickFile: () => void;
  onPasteText: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.modalTitle}>Wgraj zasady zaliczenia</Text>
          <TouchableOpacity style={styles.choiceButton} onPress={onPickFile}>
            <Text style={styles.choiceIcon}>📄</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.choiceTitle}>Wgraj plik z dysku</Text>
              <Text style={styles.choiceSubtitle}>PDF lub Word (.docx)</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity style={styles.choiceButton} onPress={onPasteText}>
            <Text style={styles.choiceIcon}>📋</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.choiceTitle}>Wklej tekst</Text>
              <Text style={styles.choiceSubtitle}>Skopiuj zasady z maila lub strony</Text>
            </View>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function PasteSyllabusModal({
  visible,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  onClose: () => void;
  onSubmit: (text: string) => void;
}) {
  const [text, setText] = useState('');

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.modalTitle}>Wklej zasady zaliczenia</Text>
          <TextInput
            style={styles.pasteInput}
            multiline
            textAlignVertical="top"
            placeholder="Wklej tutaj treść zasad zaliczenia…"
            value={text}
            onChangeText={setText}
          />
          <TouchableOpacity
            style={[styles.submitButton, !text.trim() && styles.submitButtonDisabled]}
            disabled={!text.trim()}
            onPress={() => text.trim() && onSubmit(text.trim())}
          >
            <Text style={styles.submitText}>Analizuj</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
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
  submitButtonDisabled: { backgroundColor: '#9ca3af' },
  submitText: { color: 'white', fontWeight: '700' },
  choiceButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    padding: 14,
  },
  choiceIcon: { fontSize: 22 },
  choiceTitle: { fontSize: 15, fontWeight: '700', color: '#111827' },
  choiceSubtitle: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  pasteInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    minHeight: 160,
  },
});
