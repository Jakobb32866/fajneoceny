import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { api } from '../api/client';
import { confirmAsync } from '../utils/confirm';
import type { Difficulty, FlashcardDto } from '../api/types';
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

  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [cards, setCards] = useState<FlashcardDto[]>([]);
  const [index, setIndex] = useState(0);

  const cardTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const nameTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const questionRef = useRef<TextInput>(null);

  const load = useCallback(() => {
    setLoading(true);
    api
      .getLesson(lessonId)
      .then((lesson) => {
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
      })
      .finally(() => setLoading(false));
  }, [deckId, lessonId, navigation]);

  // Only load on first focus; re-focusing after edits shouldn't clobber unsaved
  // local state, so we guard with a ref.
  const loadedOnce = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (!loadedOnce.current) {
        loadedOnce.current = true;
        load();
      }
    }, [load]),
  );

  useEffect(
    () => () => {
      Object.values(cardTimers.current).forEach(clearTimeout);
      if (nameTimer.current) clearTimeout(nameTimer.current);
    },
    [],
  );

  const onChangeName = (text: string) => {
    setName(text);
    navigation.setOptions({ title: text || 'Edycja talii' });
    if (nameTimer.current) clearTimeout(nameTimer.current);
    nameTimer.current = setTimeout(() => {
      if (text.trim()) api.renameDeck(deckId, text.trim()).catch(() => {});
    }, 600);
  };

  const scheduleCardSave = (card: FlashcardDto) => {
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
    <ScrollView style={isWide ? styles.sidePanel : styles.bottomPanel} contentContainerStyle={{ padding: 8, gap: 6 }}>
      <Text style={styles.panelHeader}>Fiszki ({cards.length})</Text>
      {cards.map((c, i) => (
        <TouchableOpacity
          key={c.id}
          style={[styles.panelItem, i === index && styles.panelItemActive]}
          onPress={() => setIndex(i)}
        >
          <Text style={styles.panelIndex}>{i + 1}.</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.panelQuestion} numberOfLines={1}>
              {excerpt(c.question, '(brak pytania)')}
            </Text>
            <Text style={styles.panelAnswer} numberOfLines={1}>
              {excerpt(c.answer, '(brak odpowiedzi)')}
            </Text>
          </View>
        </TouchableOpacity>
      ))}
      <TouchableOpacity style={styles.panelAddButton} onPress={addCard}>
        <Text style={styles.panelAddText}>+ Dodaj fiszkę</Text>
      </TouchableOpacity>
    </ScrollView>
  );

  const editor = (
    <View style={styles.editorPane}>
      <View style={styles.deckNameRow}>
        <Text style={styles.label}>Nazwa talii</Text>
        <TextInput style={styles.deckNameInput} value={name} onChangeText={onChangeName} placeholder="Nazwa talii" />
      </View>

      {current ? (
        <ScrollView contentContainerStyle={{ gap: 14, paddingBottom: 24 }}>
          <View style={styles.navRow}>
            <TouchableOpacity
              disabled={index === 0}
              onPress={() => setIndex((i) => Math.max(0, i - 1))}
              style={styles.navButton}
            >
              <Text style={[styles.navArrow, index === 0 && styles.navArrowDisabled]}>‹</Text>
            </TouchableOpacity>
            <Text style={styles.navPosition}>
              {index + 1} / {cards.length}
            </Text>
            <TouchableOpacity
              disabled={index >= cards.length - 1}
              onPress={() => setIndex((i) => Math.min(cards.length - 1, i + 1))}
              style={styles.navButton}
            >
              <Text style={[styles.navArrow, index >= cards.length - 1 && styles.navArrowDisabled]}>›</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.faceCard}>
            <Text style={styles.faceLabel}>PYTANIE (przód)</Text>
            <TextInput
              ref={questionRef}
              style={styles.faceInput}
              multiline
              placeholder="Treść pytania…"
              value={current.question}
              onChangeText={(t) => updateCurrent({ question: t })}
              textAlignVertical="top"
            />
          </View>

          <View style={styles.faceCard}>
            <Text style={styles.faceLabel}>ODPOWIEDŹ (tył)</Text>
            <TextInput
              style={styles.faceInput}
              multiline
              placeholder="Treść odpowiedzi…"
              value={current.answer}
              onChangeText={(t) => updateCurrent({ answer: t })}
              textAlignVertical="top"
            />
          </View>

          <View style={styles.difficultyRow}>
            <Text style={styles.label}>Trudność</Text>
            <View style={styles.chipRow}>
              {DIFFICULTIES.map((d) => (
                <TouchableOpacity
                  key={d.value}
                  style={[styles.chip, current.difficulty === d.value && styles.chipSelected]}
                  onPress={() => updateCurrent({ difficulty: d.value })}
                >
                  <Text style={current.difficulty === d.value ? styles.chipTextSelected : styles.chipText}>
                    {d.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <TouchableOpacity style={styles.removeButton} onPress={removeCurrent}>
            <Text style={styles.removeButtonText}>🗑 Usuń tę fiszkę</Text>
          </TouchableOpacity>
        </ScrollView>
      ) : (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>Ta talia nie ma jeszcze fiszek.</Text>
          <TouchableOpacity style={styles.addFirstButton} onPress={addCard}>
            <Text style={styles.addFirstText}>+ Dodaj pierwszą fiszkę</Text>
          </TouchableOpacity>
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
  container: { flex: 1, backgroundColor: 'white' },
  containerWide: { flexDirection: 'row' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  editorPane: { flex: 1, padding: 16 },

  deckNameRow: { marginBottom: 12, gap: 4 },
  label: { fontSize: 12, color: '#6b7280', fontWeight: '600' },
  deckNameInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    padding: 10,
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },

  navRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 20 },
  navButton: { paddingHorizontal: 12 },
  navArrow: { fontSize: 30, color: '#2563eb', lineHeight: 34 },
  navArrowDisabled: { color: '#d1d5db' },
  navPosition: { fontSize: 14, fontWeight: '700', color: '#374151', minWidth: 64, textAlign: 'center' },

  faceCard: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 12, gap: 6, backgroundColor: '#fafafa' },
  faceLabel: { fontSize: 11, fontWeight: '800', color: '#9ca3af', letterSpacing: 0.5 },
  faceInput: { minHeight: 80, fontSize: 15, color: '#111827', padding: 0 },

  difficultyRow: { gap: 6 },
  chipRow: { flexDirection: 'row', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: '#f2f4f7' },
  chipSelected: { backgroundColor: '#111827' },
  chipText: { fontSize: 12, color: '#333' },
  chipTextSelected: { fontSize: 12, color: 'white' },

  removeButton: { borderRadius: 10, paddingVertical: 12, alignItems: 'center', backgroundColor: '#fef2f2' },
  removeButtonText: { color: '#dc2626', fontWeight: '700' },

  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  emptyText: { color: '#6b7280' },
  addFirstButton: { backgroundColor: '#111827', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 20 },
  addFirstText: { color: 'white', fontWeight: '700' },

  sidePanel: {
    width: 260,
    borderLeftWidth: 1,
    borderLeftColor: '#eee',
    backgroundColor: '#fbfbfb',
  },
  bottomPanel: {
    maxHeight: 220,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    backgroundColor: '#fbfbfb',
  },
  panelHeader: { fontSize: 12, fontWeight: '800', color: '#6b7280', paddingHorizontal: 4, paddingVertical: 4 },
  panelItem: {
    flexDirection: 'row',
    gap: 8,
    padding: 8,
    borderRadius: 8,
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#eee',
  },
  panelItemActive: { borderColor: '#2563eb', backgroundColor: '#eff6ff' },
  panelIndex: { fontSize: 12, color: '#9ca3af', fontWeight: '700' },
  panelQuestion: { fontSize: 13, color: '#111827', fontWeight: '600' },
  panelAnswer: { fontSize: 12, color: '#6b7280' },
  panelAddButton: {
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#c7d2fe',
    borderStyle: 'dashed',
    alignItems: 'center',
    marginTop: 2,
  },
  panelAddText: { color: '#3730a3', fontWeight: '700', fontSize: 13 },
});
