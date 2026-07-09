import { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { FlashcardDto } from '../api/types';

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

interface Props {
  cards: FlashcardDto[];
  onReview?: (cardId: string, correct: boolean) => void;
  onFinish?: () => void;
}

/**
 * Quizlet-style self-graded flashcard stack: tap to reveal the answer, then
 * say whether you got it right. Wrong answers go into a "retry" pile that
 * gets reshuffled and replayed once the current pass ends, repeating until
 * every card in the set has been answered correctly at least once.
 */
export function FlashcardPlayer({ cards, onReview, onFinish }: Props) {
  const [queue, setQueue] = useState(() => shuffle(cards));
  const [wrongPile, setWrongPile] = useState<FlashcardDto[]>([]);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [round, setRound] = useState(1);
  const [totalInRound, setTotalInRound] = useState(queue.length);

  const current = queue[index];

  const progressLabel = useMemo(
    () => `Runda ${round} · ${Math.min(index + 1, totalInRound)}/${totalInRound}`,
    [round, index, totalInRound],
  );

  if (!current) {
    return (
      <View style={styles.center}>
        <Text style={styles.doneText}>🎉 Wszystkie fiszki opanowane!</Text>
      </View>
    );
  }

  const advance = (correct: boolean) => {
    onReview?.(current.id, correct);

    const nextWrongPile = correct ? wrongPile : [...wrongPile, current];
    const nextIndex = index + 1;

    if (nextIndex < queue.length) {
      setWrongPile(nextWrongPile);
      setIndex(nextIndex);
      setRevealed(false);
      return;
    }

    if (nextWrongPile.length > 0) {
      const nextQueue = shuffle(nextWrongPile);
      setQueue(nextQueue);
      setTotalInRound(nextQueue.length);
      setWrongPile([]);
      setIndex(0);
      setRevealed(false);
      setRound((r) => r + 1);
    } else {
      setQueue([]);
      onFinish?.();
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.progress}>{progressLabel}</Text>

      <TouchableOpacity style={styles.card} activeOpacity={0.85} onPress={() => setRevealed((r) => !r)}>
        <Text style={styles.cardLabel}>{revealed ? 'ODPOWIEDŹ' : 'PYTANIE'}</Text>
        <Text style={styles.cardText}>{revealed ? current.answer : current.question}</Text>
        {!revealed && <Text style={styles.hint}>Dotknij, aby zobaczyć odpowiedź</Text>}
      </TouchableOpacity>

      {revealed && (
        <View style={styles.actions}>
          <TouchableOpacity style={[styles.actionButton, styles.wrongButton]} onPress={() => advance(false)}>
            <Text style={styles.actionText}>✗ Nie umiałem</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionButton, styles.correctButton]} onPress={() => advance(true)}>
            <Text style={styles.actionText}>✓ Umiałem</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  doneText: { fontSize: 20, fontWeight: '600' },
  progress: { textAlign: 'center', color: '#666', fontWeight: '500' },
  card: {
    flex: 1,
    backgroundColor: '#f2f4f7',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  cardLabel: { color: '#8a8f98', fontWeight: '700', letterSpacing: 1 },
  cardText: { fontSize: 20, textAlign: 'center', fontWeight: '500' },
  hint: { color: '#8a8f98', marginTop: 8, fontSize: 12 },
  actions: { flexDirection: 'row', gap: 12 },
  actionButton: { flex: 1, paddingVertical: 16, borderRadius: 12, alignItems: 'center' },
  wrongButton: { backgroundColor: '#fde2e1' },
  correctButton: { backgroundColor: '#dcf5e3' },
  actionText: { fontWeight: '700', fontSize: 16 },
});
