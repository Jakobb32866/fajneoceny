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
import { RichNoteEditor } from '../components/RichNoteEditor';
import { confirmAsync } from '../utils/confirm';
import type { RootStackParamList } from '../navigation/types';
import type { Difficulty, LessonDetail } from '../api/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Lesson'>;

const DIFFICULTIES: { value: Difficulty; label: string }[] = [
  { value: 'Easy', label: 'Łatwy' },
  { value: 'Medium', label: 'Średni' },
  { value: 'Hard', label: 'Ciężki' },
];

/** Polish plural for "fiszka" (card): 1 fiszka, 2–4 fiszki, 5+ fiszek. */
function cardWord(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (n === 1) return 'fiszka';
  if (mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)) return 'fiszki';
  return 'fiszek';
}

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
      const deck = await api.createQuiz(lessonId, count, difficulty);
      load();
      navigation.navigate('QuizPlayer', { title: deck.name, cards: deck.flashcards });
    } catch (e) {
      Alert.alert('Nie udało się utworzyć quizu', String(e));
    } finally {
      setGenerating(false);
      load();
    }
  };

  const createEmptyDeck = async () => {
    try {
      const deck = await api.createDeck(lessonId);
      navigation.navigate('DeckEditor', { deckId: deck.id, lessonId });
    } catch (e) {
      Alert.alert('Nie udało się utworzyć talii', String(e));
    }
  };

  const removeDeck = async (deckId: string, name: string) => {
    const ok = await confirmAsync('Usunąć talię?', `„${name}" i jej fiszki zostaną usunięte.`);
    if (ok) api.deleteDeck(deckId).then(load);
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
        <RichNoteEditor value={noteText} onChangeText={onChangeNote} placeholder="Pisz notatki z zajęć…" />
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
          <Text style={styles.sectionTitle}>Talie fiszek ({lesson.decks.length})</Text>
        </View>

        {lesson.decks.length === 0 ? (
          <Text style={styles.empty}>Brak talii — wygeneruj quiz lub utwórz talię ręcznie.</Text>
        ) : (
          lesson.decks.map((deck) => (
            <View key={deck.id} style={styles.deckCard}>
              <View style={styles.deckInfo}>
                <Text style={styles.deckName} numberOfLines={1}>
                  {deck.isAiGenerated ? '✨ ' : '✍️ '}
                  {deck.name}
                </Text>
                <Text style={styles.deckMeta}>
                  {deck.flashcards.length} {cardWord(deck.flashcards.length)}
                </Text>
              </View>
              <View style={styles.deckActions}>
                <TouchableOpacity
                  disabled={deck.flashcards.length === 0}
                  onPress={() => navigation.navigate('QuizPlayer', { title: deck.name, cards: deck.flashcards })}
                >
                  <Text style={[styles.deckAction, deck.flashcards.length === 0 && styles.deckActionDisabled]}>
                    ▶ Powtórz
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => navigation.navigate('DeckEditor', { deckId: deck.id, lessonId })}>
                  <Text style={styles.deckAction}>Edytuj</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => removeDeck(deck.id, deck.name)}>
                  <Text style={[styles.deckAction, styles.deckActionDanger]}>Usuń</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}

        <View style={styles.deckCreateRow}>
          <TouchableOpacity
            style={[styles.generateButton, styles.deckCreateButton]}
            disabled={generating}
            onPress={() => setQuizModalVisible(true)}
          >
            <Text style={styles.generateButtonText}>{generating ? 'Generuję…' : '✨ Wygeneruj quiz (AI)'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.newDeckButton, styles.deckCreateButton]} onPress={createEmptyDeck}>
            <Text style={styles.newDeckButtonText}>+ Nowa talia</Text>
          </TouchableOpacity>
        </View>
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
  linkAction: { color: '#2563eb', fontWeight: '600' },
  empty: { color: '#999' },
  sourceRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  sourceIcon: { fontSize: 16 },
  sourceTitle: { flex: 1, fontSize: 14 },
  deckCard: {
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    gap: 8,
  },
  deckInfo: { gap: 2 },
  deckName: { fontSize: 15, fontWeight: '700', color: '#111827' },
  deckMeta: { fontSize: 12, color: '#6b7280' },
  deckActions: { flexDirection: 'row', gap: 18, alignItems: 'center' },
  deckAction: { fontSize: 13, fontWeight: '600', color: '#2563eb' },
  deckActionDisabled: { color: '#9ca3af' },
  deckActionDanger: { color: '#dc2626' },
  deckCreateRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  deckCreateButton: { flex: 1 },
  generateButton: { backgroundColor: '#111827', borderRadius: 12, padding: 14 },
  generateButtonText: { color: 'white', fontWeight: '700', textAlign: 'center' },
  newDeckButton: { backgroundColor: '#eef2ff', borderRadius: 12, padding: 14 },
  newDeckButtonText: { color: '#3730a3', fontWeight: '700', textAlign: 'center' },
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
