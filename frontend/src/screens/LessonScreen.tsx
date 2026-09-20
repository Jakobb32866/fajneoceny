import { useEffect, useRef, useState } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as DocumentPicker from 'expo-document-picker';
import {
  ActivityIndicator,
  Alert,
  Linking,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { FileText, Link as LinkIcon, PenLine, Play, Sparkles } from 'lucide-react-native';
import { getCached, invalidate, setCached } from '../api/cache';
import { cacheKeys } from '../api/cacheKeys';
import { recordLessonVisit } from '../api/recents';
import { api } from '../api/client';
import { useCachedQuery } from '../hooks/useCachedQuery';
import { RichNoteEditor } from '../components/RichNoteEditor';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Chip } from '../components/ui/Chip';
import { ModalSheet } from '../components/ui/ModalSheet';
import { TextField } from '../components/ui/Input';
import { Text } from '../components/ui/Text';
import { theme } from '../theme';
import { confirmAsync } from '../utils/confirm';
import type { RootStackParamList } from '../navigation/types';
import type { Difficulty, LessonDetail, SourceType } from '../api/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Lesson'>;

const DIFFICULTIES: { value: Difficulty; label: string }[] = [
  { value: 'Easy', label: 'Łatwy' },
  { value: 'Medium', label: 'Średni' },
  { value: 'Hard', label: 'Ciężki' },
];

const SOURCE_TYPE_LABEL: Record<SourceType, string> = {
  Pdf: 'PDF',
  YoutubeLink: 'YouTube',
  Link: 'Link',
};

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
  const [noteText, setNoteText] = useState('');
  const [quizModalVisible, setQuizModalVisible] = useState(false);
  const [addLinkVisible, setAddLinkVisible] = useState(false);
  const [generating, setGenerating] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const lessonKey = cacheKeys.lesson(lessonId);
  const { data: lesson } = useCachedQuery<LessonDetail>(lessonKey, () => api.getLesson(lessonId));
  const reloadLesson = () => invalidate(lessonKey);

  // Surface this lesson in the dashboard's "recently visited" bento tiles.
  useEffect(() => {
    recordLessonVisit(lessonId, lessonTitle);
  }, [lessonId, lessonTitle]);

  // Seed the editor from the server exactly once per mount. Re-seeding on a
  // background revalidation would drop whatever the student typed in the 800ms
  // before the debounced save fires.
  const seeded = useRef(false);
  useEffect(() => {
    if (lesson && !seeded.current) {
      seeded.current = true;
      setNoteText(lesson.noteContent ?? '');
    }
  }, [lesson]);

  const onChangeNote = (text: string) => {
    setNoteText(text);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      api
        .saveNote(lessonId, text)
        .then(() => {
          // Write through instead of invalidating: the note we just saved is
          // the freshest copy, and a refetch here could race the next keystroke.
          const cached = getCached<LessonDetail>(lessonKey);
          if (cached) setCached(lessonKey, { ...cached, noteContent: text });
        })
        .catch(() => {});
    }, 800);
  };

  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    },
    [],
  );

  const pickPdfSource = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: ['application/pdf'] });
    if (result.canceled) return;
    const file = result.assets[0];
    await api.addFileSource(lessonId, { uri: file.uri, name: file.name, mimeType: file.mimeType });
    reloadLesson();
  };

  const createQuiz = async (count: number, difficulty: Difficulty) => {
    setQuizModalVisible(false);
    setGenerating(true);
    try {
      const deck = await api.createQuiz(lessonId, count, difficulty);
      navigation.navigate('QuizPlayer', { title: deck.name, cards: deck.flashcards });
    } catch (e) {
      Alert.alert('Nie udało się utworzyć quizu', String(e));
    } finally {
      setGenerating(false);
      // New cards change the lesson's deck list, the subject's flashcardCount
      // and the daily pool.
      reloadLesson();
      invalidate(cacheKeys.dailySummary);
    }
  };

  const createEmptyDeck = async () => {
    try {
      const deck = await api.createDeck(lessonId);
      reloadLesson();
      navigation.navigate('DeckEditor', { deckId: deck.id, lessonId });
    } catch (e) {
      Alert.alert('Nie udało się utworzyć talii', String(e));
    }
  };

  const removeDeck = async (deckId: string, name: string) => {
    const ok = await confirmAsync('Usunąć talię?', `„${name}" i jej fiszki zostaną usunięte.`);
    if (ok) api.deleteDeck(deckId).then(reloadLesson);
  };

  if (!lesson) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.colors.accent.default} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: theme.spacing[4], gap: theme.spacing[5] }}
    >
      <Text.HeadlineLg>{lesson.title}</Text.HeadlineLg>

      <View>
        <Text.Title style={styles.sectionTitle}>Notatki</Text.Title>
        <RichNoteEditor value={noteText} onChangeText={onChangeNote} placeholder="Pisz notatki z zajęć…" />
      </View>

      <View>
        <View style={styles.sectionHeader}>
          <Text.Title>Źródła</Text.Title>
          <View style={{ flexDirection: 'row', gap: theme.spacing[3] }}>
            <TouchableOpacity onPress={() => setAddLinkVisible(true)}>
              <Text.BodySm style={styles.linkAction}>+ link</Text.BodySm>
            </TouchableOpacity>
            <TouchableOpacity onPress={pickPdfSource}>
              <Text.BodySm style={styles.linkAction}>+ PDF</Text.BodySm>
            </TouchableOpacity>
          </View>
        </View>

        {lesson.sources.length === 0 ? (
          <Text.BodySm style={styles.empty}>Brak źródeł</Text.BodySm>
        ) : (
          lesson.sources.map((s) => (
            <TouchableOpacity
              key={s.id}
              style={styles.sourceRow}
              onPress={() => s.type !== 'Pdf' && Linking.openURL(s.location)}
              onLongPress={() => api.deleteSource(s.id).then(reloadLesson)}
            >
              {s.type === 'Pdf' ? (
                <FileText size={18} color={theme.colors.text.secondary} />
              ) : (
                <LinkIcon size={18} color={theme.colors.text.secondary} />
              )}
              <Text.Body style={styles.sourceTitle} numberOfLines={1}>
                {s.title}
              </Text.Body>
              <Badge label={SOURCE_TYPE_LABEL[s.type]} variant="neutral" />
            </TouchableOpacity>
          ))
        )}
      </View>

      <View>
        <View style={styles.sectionHeader}>
          <Text.Title>Talie fiszek ({lesson.decks.length})</Text.Title>
        </View>

        {lesson.decks.length === 0 ? (
          <Text.BodySm style={styles.empty}>
            Brak talii — wygeneruj quiz lub utwórz talię ręcznie.
          </Text.BodySm>
        ) : (
          lesson.decks.map((deck) => (
            <Card key={deck.id} style={styles.deckCard}>
              <View style={styles.deckInfo}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing[2] }}>
                  {deck.isAiGenerated ? (
                    <Sparkles size={16} color={theme.colors.text.accent} />
                  ) : (
                    <PenLine size={16} color={theme.colors.text.secondary} />
                  )}
                  <Text.Body style={[styles.deckName, { flex: 1 }]} numberOfLines={1}>
                    {deck.name}
                  </Text.Body>
                </View>
                <Text.BodySm>
                  {deck.flashcards.length} {cardWord(deck.flashcards.length)}
                </Text.BodySm>
              </View>
              <View style={styles.deckActions}>
                <TouchableOpacity
                  disabled={deck.flashcards.length === 0}
                  onPress={() =>
                    navigation.navigate('QuizPlayer', { title: deck.name, cards: deck.flashcards })
                  }
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Play
                      size={13}
                      color={
                        deck.flashcards.length === 0 ? theme.colors.text.tertiary : theme.colors.text.link
                      }
                      fill={
                        deck.flashcards.length === 0 ? theme.colors.text.tertiary : theme.colors.text.link
                      }
                    />
                    <Text.BodySm
                      style={[styles.deckAction, deck.flashcards.length === 0 && styles.deckActionDisabled]}
                    >
                      Powtórz
                    </Text.BodySm>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => navigation.navigate('DeckEditor', { deckId: deck.id, lessonId })}
                >
                  <Text.BodySm style={styles.deckAction}>Edytuj</Text.BodySm>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => removeDeck(deck.id, deck.name)}>
                  <Text.BodySm style={[styles.deckAction, styles.deckActionDanger]}>Usuń</Text.BodySm>
                </TouchableOpacity>
              </View>
            </Card>
          ))
        )}

        <View style={styles.deckCreateRow}>
          <View style={styles.deckCreateButton}>
            <Button
              title={generating ? 'Generuję…' : 'Wygeneruj quiz (AI)'}
              icon={generating ? undefined : Sparkles}
              onPress={() => setQuizModalVisible(true)}
              disabled={generating}
              loading={generating}
              fullWidth
            />
          </View>
          <View style={styles.deckCreateButton}>
            <Button title="+ Nowa talia" variant="ghost" onPress={createEmptyDeck} fullWidth />
          </View>
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
          reloadLesson();
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
    <ModalSheet visible={visible} onClose={onClose} title="Nowy quiz">
      <TextField label="Liczba pytań" keyboardType="numeric" value={count} onChangeText={setCount} />
      <View style={{ gap: theme.spacing[2] }}>
        <Text.Caption>Trudność</Text.Caption>
        <View style={styles.chipRow}>
          {DIFFICULTIES.map((d) => (
            <Chip
              key={d.value}
              label={d.label}
              selected={difficulty === d.value}
              onPress={() => setDifficulty(d.value)}
            />
          ))}
        </View>
      </View>
      <Button
        title="Generuj"
        onPress={() => Number(count) > 0 && onSubmit(Number(count), difficulty)}
        disabled={!(Number(count) > 0)}
        fullWidth
      />
    </ModalSheet>
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
    <ModalSheet visible={visible} onClose={onClose} title="Nowe źródło (link)">
      <TextField placeholder="Tytuł" value={title} onChangeText={setTitle} />
      <TextField placeholder="https://…" autoCapitalize="none" value={url} onChangeText={setUrl} />
      <Button
        title="Dodaj"
        onPress={() => title.trim() && url.trim() && onSubmit(title.trim(), url.trim(), guessType(url))}
        disabled={!(title.trim() && url.trim())}
        fullWidth
      />
    </ModalSheet>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.surface.app },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surface.app,
  },
  sectionTitle: { marginBottom: theme.spacing[2] },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing[2],
  },
  linkAction: { color: theme.colors.text.link, fontFamily: theme.font.family.sansSemibold },
  empty: { color: theme.colors.text.tertiary },
  sourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[2],
    paddingVertical: theme.spacing[2],
  },
  sourceTitle: { flex: 1 },
  deckCard: { gap: theme.spacing[2], marginBottom: theme.spacing[2] },
  deckInfo: { gap: 2 },
  deckName: { fontFamily: theme.font.family.sansSemibold },
  deckActions: { flexDirection: 'row', gap: theme.spacing[4], alignItems: 'center' },
  deckAction: { color: theme.colors.text.link, fontFamily: theme.font.family.sansSemibold },
  deckActionDisabled: { color: theme.colors.text.tertiary },
  deckActionDanger: { color: theme.colors.status.danger },
  deckCreateRow: { flexDirection: 'row', gap: theme.spacing[2], marginTop: theme.spacing[1] },
  deckCreateButton: { flex: 1 },
  chipRow: { flexDirection: 'row', gap: theme.spacing[2] },
});
