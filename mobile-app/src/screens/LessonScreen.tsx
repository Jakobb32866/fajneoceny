import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as DocumentPicker from 'expo-document-picker';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { api } from '../api/client';
import type { RootStackParamList } from '../navigation/types';
import type { Difficulty, LessonDetail } from '../api/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Lesson'>;

const DIFFICULTIES: { value: Difficulty; label: string }[] = [
  { value: 'Easy', label: 'Łatwy' },
  { value: 'Medium', label: 'Średni' },
  { value: 'Hard', label: 'Ciężki' },
];

export function LessonScreen({ route, navigation }: Props) {
  const { lessonId, lessonTitle } = route.params;
  const [lesson, setLesson] = useState<LessonDetail | null>(null);
  const [noteText, setNoteText] = useState('');
  const [quizModalVisible, setQuizModalVisible] = useState(false);
  const [addLinkVisible, setAddLinkVisible] = useState(false);
  const [generating, setGenerating] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(() => {
    api.getLesson(lessonId).then((l) => {
      setLesson(l);
      setNoteText(l.noteContent ?? '');
    });
  }, [lessonId]);

  useFocusEffect(load);

  const onChangeNote = (text: string) => {
    setNoteText(text);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      api.saveNote(lessonId, text).catch(() => {});
    }, 800);
  };

  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
  }, []);

  const pickPdfSource = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: ['application/pdf'] });
    if (result.canceled) return;
    const file = result.assets[0];
    await api.addFileSource(lessonId, { uri: file.uri, name: file.name, mimeType: file.mimeType });
    load();
  };

  const createQuiz = async (count: number, difficulty: Difficulty) => {
    setQuizModalVisible(false);
    setGenerating(true);
    try {
      const cards = await api.createQuiz(lessonId, count, difficulty);
      navigation.navigate('QuizPlayer', { title: lessonTitle, cards });
    } catch (e) {
      Alert.alert('Nie udało się utworzyć quizu', String(e));
    } finally {
      setGenerating(false);
      load();
    }
  };

  if (!lesson) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, gap: 20 }}>
      <Text style={styles.title}>{lesson.title}</Text>

      <View>
        <Text style={styles.sectionTitle}>Notatki</Text>
        <TextInput
          style={styles.notesInput}
          multiline
          placeholder="Pisz notatki z zajęć…"
          value={noteText}
          onChangeText={onChangeNote}
        />
      </View>

      <View>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Źródła</Text>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <TouchableOpacity onPress={() => setAddLinkVisible(true)}>
              <Text style={styles.linkAction}>+ link</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={pickPdfSource}>
              <Text style={styles.linkAction}>+ PDF</Text>
            </TouchableOpacity>
          </View>
        </View>

        {lesson.sources.length === 0 ? (
          <Text style={styles.empty}>Brak źródeł</Text>
        ) : (
          lesson.sources.map((s) => (
            <TouchableOpacity
              key={s.id}
              style={styles.sourceRow}
              onPress={() => s.type !== 'Pdf' && Linking.openURL(s.location)}
              onLongPress={() => api.deleteSource(s.id).then(load)}
            >
              <Text style={styles.sourceIcon}>{s.type === 'Pdf' ? '📄' : '🔗'}</Text>
              <Text style={styles.sourceTitle} numberOfLines={1}>
                {s.title}
              </Text>
            </TouchableOpacity>
          ))
        )}
      </View>

      <View>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Fiszki ({lesson.flashcards.length})</Text>
        </View>

        {lesson.flashcards.length === 0 ? (
          <Text style={styles.empty}>Brak fiszek — wygeneruj quiz poniżej.</Text>
        ) : (
          <TouchableOpacity
            style={styles.reviewExistingButton}
            onPress={() => navigation.navigate('QuizPlayer', { title: lesson.title, cards: lesson.flashcards })}
          >
            <Text style={styles.reviewExistingText}>▶ Powtórz istniejące fiszki</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={styles.generateButton}
          disabled={generating}
          onPress={() => setQuizModalVisible(true)}
        >
          <Text style={styles.generateButtonText}>{generating ? 'Generuję…' : '✨ Wygeneruj nowy quiz'}</Text>
        </TouchableOpacity>
      </View>

      <QuizConfigModal
        visible={quizModalVisible}
        onClose={() => setQuizModalVisible(false)}
        onSubmit={createQuiz}
      />
      <AddLinkModal
        visible={addLinkVisible}
        onClose={() => setAddLinkVisible(false)}
        onSubmit={async (title, url, type) => {
          await api.addLinkSource(lessonId, title, url, type);
          setAddLinkVisible(false);
          load();
        }}
      />
    </ScrollView>
  );
}

function QuizConfigModal({
  visible,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  onClose: () => void;
  onSubmit: (count: number, difficulty: Difficulty) => void;
}) {
  const [count, setCount] = useState('10');
  const [difficulty, setDifficulty] = useState<Difficulty>('Medium');

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.modalTitle}>Nowy quiz</Text>
          <Text style={styles.modalLabel}>Liczba pytań</Text>
          <TextInput style={styles.input} keyboardType="numeric" value={count} onChangeText={setCount} />
          <Text style={styles.modalLabel}>Trudność</Text>
          <View style={styles.chipRow}>
            {DIFFICULTIES.map((d) => (
              <TouchableOpacity
                key={d.value}
                style={[styles.chip, difficulty === d.value && styles.chipSelected]}
                onPress={() => setDifficulty(d.value)}
              >
                <Text style={difficulty === d.value ? styles.chipTextSelected : styles.chipText}>{d.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity
            style={styles.submitButton}
            onPress={() => Number(count) > 0 && onSubmit(Number(count), difficulty)}
          >
            <Text style={styles.submitText}>Generuj</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function AddLinkModal({
  visible,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  onClose: () => void;
  onSubmit: (title: string, url: string, type: 'YoutubeLink' | 'Link') => void;
}) {
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');

  const guessType = (u: string): 'YoutubeLink' | 'Link' =>
    /youtube\.com|youtu\.be/.test(u) ? 'YoutubeLink' : 'Link';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.modalTitle}>Nowe źródło (link)</Text>
          <TextInput style={styles.input} placeholder="Tytuł" value={title} onChangeText={setTitle} />
          <TextInput
            style={styles.input}
            placeholder="https://…"
            autoCapitalize="none"
            value={url}
            onChangeText={setUrl}
          />
          <TouchableOpacity
            style={styles.submitButton}
            onPress={() => title.trim() && url.trim() && onSubmit(title.trim(), url.trim(), guessType(url))}
          >
            <Text style={styles.submitText}>Dodaj</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'white' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 22, fontWeight: '700' },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginBottom: 8 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  notesInput: {
    minHeight: 120,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 12,
    padding: 12,
    textAlignVertical: 'top',
    fontSize: 14,
  },
  linkAction: { color: '#2563eb', fontWeight: '600' },
  empty: { color: '#999' },
  sourceRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  sourceIcon: { fontSize: 16 },
  sourceTitle: { flex: 1, fontSize: 14 },
  reviewExistingButton: { backgroundColor: '#eef2ff', borderRadius: 10, padding: 12, marginBottom: 8 },
  reviewExistingText: { color: '#3730a3', fontWeight: '600', textAlign: 'center' },
  generateButton: { backgroundColor: '#111827', borderRadius: 12, padding: 14 },
  generateButtonText: { color: 'white', fontWeight: '700', textAlign: 'center' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 24 },
  modalCard: { backgroundColor: 'white', borderRadius: 16, padding: 20, gap: 10 },
  modalTitle: { fontSize: 17, fontWeight: '700', marginBottom: 4 },
  modalLabel: { fontSize: 12, color: '#666' },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 10, fontSize: 14 },
  chipRow: { flexDirection: 'row', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: '#f2f4f7' },
  chipSelected: { backgroundColor: '#111827' },
  chipText: { fontSize: 12, color: '#333' },
  chipTextSelected: { fontSize: 12, color: 'white' },
  submitButton: { backgroundColor: '#111827', borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 4 },
  submitText: { color: 'white', fontWeight: '700' },
});
