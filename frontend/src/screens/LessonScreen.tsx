import { useEffect, useRef, useState } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  TouchableOpacity,
  View,
} from 'react-native';
import { Pencil, PenLine, Play, Sparkles, Trash2 } from 'lucide-react-native';
import { getCached, invalidate, setCached } from '../api/cache';
import { cacheKeys } from '../api/cacheKeys';
import { recordLessonVisit } from '../api/recents';
import { api } from '../api/client';
import { ApiError } from '../api/errors';
import { useCachedQuery } from '../hooks/useCachedQuery';
import { RichNoteEditor } from '../components/RichNoteEditor';
import { RenameModal } from '../components/RenameModal';
import { Banner } from '../components/ui/Banner';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Chip } from '../components/ui/Chip';
import { ModalSheet } from '../components/ui/ModalSheet';
import { TextField } from '../components/ui/Input';
import { Text } from '../components/ui/Text';
import { theme } from '../theme';
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
  const [noteText, setNoteText] = useState('');
  const [quizModalVisible, setQuizModalVisible] = useState(false);
  const [renameVisible, setRenameVisible] = useState(false);
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

  const renameLesson = async (title: string) => {
    setRenameVisible(false);
    try {
      await api.updateLesson(lessonId, title);
      // Write through so the header updates immediately, then refresh the lists
      // that show this lesson's title elsewhere.
      const cached = getCached<LessonDetail>(lessonKey);
      if (cached) setCached(lessonKey, { ...cached, title });
      invalidate('subject'); // every subject's lesson list
      invalidate(cacheKeys.subjects);
      invalidate(cacheKeys.dashboardFallbackLessons);
    } catch (e) {
      Alert.alert('Nie udało się zmienić nazwy', String(e));
    }
  };

  const deleteLesson = async () => {
    if (!lesson) return;
    const ok = await confirmAsync(
      'Usunąć lekcję?',
      `„${lesson.title}" wraz z notatkami i fiszkami zostanie trwale usunięta.`,
    );
    if (!ok) return;
    try {
      await api.deleteLesson(lessonId);
      invalidate('subject'); // every subject's lesson list
      invalidate(cacheKeys.subjects);
      invalidate(cacheKeys.dailySummary);
      invalidate(cacheKeys.dashboardFallbackLessons);
      navigation.goBack();
    } catch (e) {
      Alert.alert('Nie udało się usunąć lekcji', String(e));
    }
  };

  const toggleShare = async (next: boolean) => {
    try {
      if (next) {
        await api.shareLesson(lessonId);
      } else {
        await api.unshareLesson(lessonId);
      }
      const cached = getCached<LessonDetail>(lessonKey);
      if (cached) setCached(lessonKey, { ...cached, isShared: next });
      // No courseId is available here to target a single community list, so
      // sweep every cached community entry — it's just a background refetch.
      invalidate('community');
    } catch (e) {
      if (e instanceof ApiError && e.status === 400) {
        Alert.alert('Nie można udostępnić', 'Dodaj treść notatki lub talię z fiszkami.');
      } else {
        Alert.alert('Nie udało się zmienić udostępniania', String(e));
      }
    }
  };

  const syncFork = async () => {
    const ok = await confirmAsync(
      'Zsynchronizować z oryginałem?',
      'Obecna treść notatki i talie w tej lekcji zostaną zastąpione wersją autora.',
      'Synchronizuj',
    );
    if (!ok) return;
    try {
      const result = await api.syncFork(lessonId);
      setCached(lessonKey, result);
      // Re-seed the note editor from the synced content on the next render.
      seeded.current = false;
    } catch (e) {
      Alert.alert('Nie udało się zsynchronizować', String(e));
    }
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
      contentContainerStyle={{
        padding: theme.spacing[4],
        gap: theme.spacing[5],
        width: '100%',
        maxWidth: theme.layout.contentMaxWidth,
        alignSelf: 'center',
      }}
    >
      <View style={styles.titleRow}>
        <Text.HeadlineLg style={{ flex: 1 }}>{lesson.title}</Text.HeadlineLg>
        <TouchableOpacity
          onPress={() => setRenameVisible(true)}
          accessibilityRole="button"
          accessibilityLabel="Zmień nazwę lekcji"
          hitSlop={8}
          style={styles.titleAction}
        >
          <Pencil size={20} color={theme.colors.text.secondary} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={deleteLesson}
          accessibilityRole="button"
          accessibilityLabel="Usuń lekcję"
          hitSlop={8}
          style={styles.titleAction}
        >
          <Trash2 size={20} color={theme.colors.status.danger} />
        </TouchableOpacity>
      </View>

      {lesson.forkedFrom && (
        <Card style={styles.forkBanner}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text.BodySm style={{ fontFamily: theme.font.family.sansSemibold }}>
              Zapisano od {lesson.forkedFrom.authorName}
            </Text.BodySm>
            {!lesson.forkedFrom.originalStillShared && (
              <Text.Caption>Oryginał nie jest już dostępny.</Text.Caption>
            )}
          </View>
          {lesson.forkedFrom.hasNewerVersion && (
            <Button title="Synchronizuj" variant="ghost" size="sm" onPress={syncFork} />
          )}
        </Card>
      )}

      {/* canShare goes false when a moderator locked this lesson or banned the
          author from sharing. Without this the share card would simply vanish
          and the student would never learn why. */}
      {!lesson.canShare && (lesson.moderationLockReason || lesson.shareBlockedUntil) && (
        <Card style={styles.shareCard}>
          <Banner
            message={
              lesson.moderationLockReason
                ? `Lekcja została ukryta przez moderatora: ${lesson.moderationLockReason}. Nie możesz udostępnić jej ponownie, dopóki moderator nie zdejmie blokady.`
                : `Udostępnianie zablokowane do ${formatBlockDate(lesson.shareBlockedUntil!)}${
                    lesson.shareBlockReason ? ` — ${lesson.shareBlockReason}` : ''
                  }.`
            }
            variant="warning"
          />
        </Card>
      )}

      {lesson.canShare && (
        <Card style={styles.shareCard}>
          <View style={styles.shareRow}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text.Body style={{ fontFamily: theme.font.family.sansSemibold }}>
                Udostępnij w Społeczności
              </Text.Body>
              <Text.Caption>
                Studenci Twojego przedmiotu zobaczą tytuł, notatkę i talie tej lekcji.
              </Text.Caption>
            </View>
            <Switch value={lesson.isShared} onValueChange={toggleShare} />
          </View>
          {lesson.isShared && (
            <View style={styles.shareStatusRow}>
              <Text.BodySm style={{ fontFamily: theme.font.family.sansSemibold }}>
                ♥ {lesson.likeCount}
              </Text.BodySm>
              <Text.BodySm style={{ color: theme.colors.text.secondary }}>
                Widoczna dla studentów tego przedmiotu
              </Text.BodySm>
            </View>
          )}
        </Card>
      )}

      <View>
        <Text.Title style={styles.sectionTitle}>Notatki</Text.Title>
        <RichNoteEditor value={noteText} onChangeText={onChangeNote} placeholder="Pisz notatki z zajęć…" />
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

      <RenameModal
        visible={renameVisible}
        title="Zmień nazwę lekcji"
        label="Tytuł lekcji"
        initialValue={lesson.title}
        onClose={() => setRenameVisible(false)}
        onSubmit={renameLesson}
      />
      <QuizConfigModal
        visible={quizModalVisible}
        onClose={() => setQuizModalVisible(false)}
        onSubmit={createQuiz}
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.surface.app },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surface.app,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing[2] },
  titleAction: { padding: theme.spacing[1] },
  forkBanner: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing[3] },
  shareCard: { gap: theme.spacing[2] },
  shareRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing[3] },
  shareStatusRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing[2] },
  sectionTitle: { marginBottom: theme.spacing[2] },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing[2],
  },
  empty: { color: theme.colors.text.tertiary },
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

/** "do 24 marca, 18:00" — a ban expiry is only useful with the time of day. */
function formatBlockDate(iso: string): string {
  return new Date(iso).toLocaleString('pl-PL', {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });
}
