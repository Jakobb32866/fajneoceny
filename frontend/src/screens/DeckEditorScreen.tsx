import { useEffect, useRef, useState } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { Trash2 } from 'lucide-react-native';
import { invalidate } from '../api/cache';
import { cacheKeys } from '../api/cacheKeys';
import { api } from '../api/client';
import { useCachedQuery } from '../hooks/useCachedQuery';
import { confirmAsync } from '../utils/confirm';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Chip } from '../components/ui/Chip';
import { TextField } from '../components/ui/Input';
import { Text } from '../components/ui/Text';
import { theme } from '../theme';
import type { Difficulty, FlashcardDto, LessonDetail } from '../api/types';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'DeckEditor'>;

const DIFFICULTIES: { value: Difficulty; label: string }[] = [
  { value: 'Easy', label: 'Łatwy' },
  { value: 'Medium', label: 'Średni' },
  { value: 'Hard', label: 'Ciężki' },
];

const excerpt = (text: string, fallback: string) => {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return fallback;
  return clean.length > 34 ? `${clean.slice(0, 34)}…` : clean;
};

export function DeckEditorScreen({ route, navigation }: Props) {
  const { deckId, lessonId } = route.params;
  const { width } = useWindowDimensions();
  const isWide = width >= 720;

  const [name, setName] = useState('');
  const [cards, setCards] = useState<FlashcardDto[]>([]);
  const [index, setIndex] = useState(0);

  const cardTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const nameTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const questionRef = useRef<TextInput>(null);
  /** Set by any edit, so unmount knows whether other screens need refreshing. */
  const dirty = useRef(false);

  // Shares the lesson/{id} cache entry with LessonScreen, so arriving from
  // there costs no request at all.
  const { data: lesson, loading } = useCachedQuery<LessonDetail>(cacheKeys.lesson(lessonId), () =>
    api.getLesson(lessonId),
  );

  // Seed local state once. After that local state is authoritative — writes are
  // debounced and fire-and-forget, so re-seeding would clobber unsaved edits.
  const seeded = useRef(false);
  useEffect(() => {
    if (!lesson || seeded.current) return;
    seeded.current = true;

    const deck = lesson.decks.find((d) => d.id === deckId);
    if (!deck) {
      Alert.alert('Talia nie istnieje');
      navigation.goBack();
      return;
    }
    setName(deck.name);
    setCards(deck.flashcards);
    navigation.setOptions({ title: deck.name });
    setIndex((i) => Math.min(i, Math.max(0, deck.flashcards.length - 1)));
  }, [lesson, deckId, navigation]);

  useEffect(
    () => () => {
      Object.values(cardTimers.current).forEach(clearTimeout);
      if (nameTimer.current) clearTimeout(nameTimer.current);
      // Invalidate on the way out, not per keystroke: this screen subscribes to
      // the same cache key, so invalidating mid-edit would trigger a refetch of
      // its own data on every debounced save.
      if (dirty.current) {
        invalidate(cacheKeys.lesson(lessonId));
        invalidate(cacheKeys.subjects);
        invalidate(cacheKeys.dailySummary);
      }
    },
    [lessonId],
  );

  const onChangeName = (text: string) => {
    setName(text);
    dirty.current = true;
    navigation.setOptions({ title: text || 'Edycja talii' });
    if (nameTimer.current) clearTimeout(nameTimer.current);
    nameTimer.current = setTimeout(() => {
      if (text.trim()) api.renameDeck(deckId, text.trim()).catch(() => {});
    }, 600);
  };

  const scheduleCardSave = (card: FlashcardDto) => {
    dirty.current = true;
    if (cardTimers.current[card.id]) clearTimeout(cardTimers.current[card.id]);
    cardTimers.current[card.id] = setTimeout(() => {
      api.updateCard(card.id, card.question, card.answer, card.difficulty).catch(() => {});
    }, 600);
  };

  const updateCurrent = (patch: Partial<FlashcardDto>) => {
    setCards((prev) => {
      const next = [...prev];
      const merged = { ...next[index], ...patch };
      next[index] = merged;
      scheduleCardSave(merged);
      return next;
    });
  };

  const addCard = async () => {
    try {
      const created = await api.addCard(deckId, '', '', 'Medium');
      dirty.current = true;
      setCards((prev) => {
        const next = [...prev, created];
        setIndex(next.length - 1);
        return next;
      });
      requestAnimationFrame(() => questionRef.current?.focus());
    } catch (e) {
      Alert.alert('Nie udało się dodać fiszki', String(e));
    }
  };

  const removeCurrent = async () => {
    const card = cards[index];
    if (!card) return;
    const ok = await confirmAsync('Usunąć fiszkę?', 'Tej operacji nie można cofnąć.');
    if (!ok) return;
    if (cardTimers.current[card.id]) clearTimeout(cardTimers.current[card.id]);
    dirty.current = true;
    api.deleteCard(card.id).catch(() => {});
    setCards((prev) => {
      const next = prev.filter((c) => c.id !== card.id);
      setIndex((i) => Math.max(0, Math.min(i, next.length - 1)));
      return next;
    });
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  const current = cards[index];

  const cardList = (
    <ScrollView
      style={isWide ? styles.sidePanel : styles.bottomPanel}
      contentContainerStyle={{ padding: theme.spacing[2], gap: theme.spacing[2] }}
    >
      <Text.Caption style={{ paddingHorizontal: theme.spacing[1], paddingVertical: theme.spacing[1] }}>
        Fiszki ({cards.length})
      </Text.Caption>
      {cards.map((c, i) => (
        <Pressable
          key={c.id}
          style={[styles.panelItem, i === index && styles.panelItemActive]}
          onPress={() => setIndex(i)}
        >
          <Text.BodySm
            style={{ color: theme.colors.text.tertiary, fontFamily: theme.font.family.sansSemibold }}
          >
            {i + 1}.
          </Text.BodySm>
          <View style={{ flex: 1 }}>
            <Text.BodySm style={{ fontFamily: theme.font.family.sansSemibold }} numberOfLines={1}>
              {excerpt(c.question, '(brak pytania)')}
            </Text.BodySm>
            <Text.Caption numberOfLines={1}>{excerpt(c.answer, '(brak odpowiedzi)')}</Text.Caption>
          </View>
        </Pressable>
      ))}
      <Button title="+ Dodaj fiszkę" variant="ghost" onPress={addCard} fullWidth />
    </ScrollView>
  );

  const editor = (
    <View style={styles.editorPane}>
      <TextField label="Nazwa talii" value={name} onChangeText={onChangeName} placeholder="Nazwa talii" />

      {current ? (
        <ScrollView
          contentContainerStyle={{ gap: theme.spacing[4], paddingTop: theme.spacing[3], paddingBottom: 24 }}
        >
          <View style={styles.navRow}>
            <Button
              title="‹"
              variant="ghost"
              size="sm"
              disabled={index === 0}
              onPress={() => setIndex((i) => Math.max(0, i - 1))}
            />
            <Text.BodySm
              style={{
                color: theme.colors.text.secondary,
                fontFamily: theme.font.family.sansSemibold,
                minWidth: 64,
                textAlign: 'center',
              }}
            >
              {index + 1} / {cards.length}
            </Text.BodySm>
            <Button
              title="›"
              variant="ghost"
              size="sm"
              disabled={index >= cards.length - 1}
              onPress={() => setIndex((i) => Math.min(cards.length - 1, i + 1))}
            />
          </View>

          <Card>
            <Text.Caption style={{ letterSpacing: 0.5 }}>PYTANIE (przód)</Text.Caption>
            <TextInput
              ref={questionRef}
              style={styles.faceInput}
              multiline
              placeholder="Treść pytania…"
              placeholderTextColor={theme.colors.text.tertiary}
              value={current.question}
              onChangeText={(t) => updateCurrent({ question: t })}
              textAlignVertical="top"
            />
          </Card>

          <Card>
            <Text.Caption style={{ letterSpacing: 0.5 }}>ODPOWIEDŹ (tył)</Text.Caption>
            <TextInput
              style={styles.faceInput}
              multiline
              placeholder="Treść odpowiedzi…"
              placeholderTextColor={theme.colors.text.tertiary}
              value={current.answer}
              onChangeText={(t) => updateCurrent({ answer: t })}
              textAlignVertical="top"
            />
          </Card>

          <View style={{ gap: theme.spacing[2] }}>
            <Text.Caption style={{ color: theme.colors.text.secondary }}>Trudność</Text.Caption>
            <View style={{ flexDirection: 'row', gap: theme.spacing[2] }}>
              {DIFFICULTIES.map((d) => (
                <Chip
                  key={d.value}
                  label={d.label}
                  selected={current.difficulty === d.value}
                  onPress={() => updateCurrent({ difficulty: d.value })}
                />
              ))}
            </View>
          </View>

          <Button title="Usuń tę fiszkę" icon={Trash2} variant="danger" onPress={removeCurrent} fullWidth />
        </ScrollView>
      ) : (
        <View style={styles.emptyState}>
          <Text.Body style={{ color: theme.colors.text.secondary }}>
            Ta talia nie ma jeszcze fiszek.
          </Text.Body>
          <Button title="+ Dodaj pierwszą fiszkę" onPress={addCard} />
        </View>
      )}
    </View>
  );

  return (
    <View style={[styles.container, isWide && styles.containerWide]}>
      {editor}
      {cardList}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.surface.app },
  containerWide: { flexDirection: 'row' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  editorPane: { flex: 1, padding: theme.spacing[4] },

  navRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: theme.spacing[5] },

  faceInput: {
    minHeight: 80,
    fontSize: theme.font.size.bodyLg,
    fontFamily: theme.font.family.sans,
    color: theme.colors.text.primary,
    padding: 0,
    marginTop: theme.spacing[1],
    borderWidth: 0,
  },

  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: theme.spacing[3] },

  sidePanel: {
    width: 260,
    borderLeftWidth: 1,
    borderLeftColor: theme.colors.border.default,
    backgroundColor: theme.colors.surface.sunken,
  },
  bottomPanel: {
    maxHeight: 220,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border.default,
    backgroundColor: theme.colors.surface.sunken,
  },
  panelItem: {
    flexDirection: 'row',
    gap: theme.spacing[2],
    padding: theme.spacing[2],
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.surface.card,
    borderWidth: 1,
    borderColor: theme.colors.border.default,
  },
  panelItemActive: {
    borderColor: theme.colors.border.focus,
    backgroundColor: theme.colors.surface.accentSoft,
  },
});
