import { useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Check, CircleCheck, Trophy, X } from 'lucide-react-native';
import type { DailyCardDto, FlashcardDto, ReviewGrade, ReviewResult } from '../api/types';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { Text } from './ui/Text';
import { theme } from '../theme';

type AnyCard = DailyCardDto | FlashcardDto;

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function hasIntervals(card: AnyCard): card is DailyCardDto {
  return 'intervals' in card && !!(card as DailyCardDto).intervals;
}

interface Props {
  cards: AnyCard[];
  // Scheduled mode only. Returns the ReviewResult so the player can re-queue
  // cards still in learning/relearning. Not called in cram mode.
  onReview?: (cardId: string, grade: ReviewGrade) => Promise<ReviewResult | void>;
  onFinish?: () => void;
  // cram=true keeps the legacy 2-button self-graded local-replay loop and never
  // schedules. Default false = Anki-style 4-button scheduled review.
  cram?: boolean;
}

/**
 * Flashcard study player. In `cram` mode it's a Quizlet-style self-graded
 * stack with a client-side "wrong pile" replay loop (never touches the SRS
 * schedule). Otherwise it's an Anki-style 4-button scheduled review that
 * reports grades via `onReview` and re-queues cards still in a short
 * learning/relearning step so they resurface later in the same session.
 */
export function FlashcardPlayer({ cards, onReview, onFinish, cram = false }: Props) {
  if (cram) {
    return <CramFlashcardPlayer cards={cards} onFinish={onFinish} />;
  }
  return <ScheduledFlashcardPlayer cards={cards} onReview={onReview} onFinish={onFinish} />;
}

/** Quizlet-style self-graded stack, wrong answers replayed until mastered. */
function CramFlashcardPlayer({ cards, onFinish }: { cards: AnyCard[]; onFinish?: () => void }) {
  const [queue, setQueue] = useState(() => shuffle(cards));
  const [wrongPile, setWrongPile] = useState<AnyCard[]>([]);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [round, setRound] = useState(1);
  const [totalInRound, setTotalInRound] = useState(queue.length);

  const current = queue[index];

  const progressLabel = `Runda ${round} · ${Math.min(index + 1, totalInRound)}/${totalInRound}`;

  if (!current) {
    return (
      <View style={styles.center}>
        <Trophy size={40} color={theme.colors.accent.active} />
        <Text.HeadlineMd style={styles.doneText}>Wszystkie fiszki opanowane!</Text.HeadlineMd>
      </View>
    );
  }

  const advance = (correct: boolean) => {
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
      <Text.Mono style={styles.progress}>{progressLabel}</Text.Mono>

      <TouchableOpacity
        style={styles.cardTouchable}
        activeOpacity={0.85}
        onPress={() => setRevealed((r) => !r)}
      >
        <Card elevated style={styles.card}>
          <Text.Caption style={styles.cardLabel}>{revealed ? 'ODPOWIEDŹ' : 'PYTANIE'}</Text.Caption>
          <Text.HeadlineMd style={styles.cardText}>
            {revealed ? current.answer : current.question}
          </Text.HeadlineMd>
          {!revealed && <Text.BodySm style={styles.hint}>Dotknij, aby zobaczyć odpowiedź</Text.BodySm>}
        </Card>
      </TouchableOpacity>

      {revealed && (
        <View style={styles.actions}>
          <View style={styles.actionButton}>
            <Button
              title="Nie umiałem"
              icon={X}
              variant="danger"
              onPress={() => advance(false)}
              fullWidth
              size="lg"
            />
          </View>
          <View style={styles.actionButton}>
            <Button
              title="Umiałem"
              icon={Check}
              variant="primary"
              onPress={() => advance(true)}
              fullWidth
              size="lg"
            />
          </View>
        </View>
      )}
    </View>
  );
}

interface GradeButtonSpec {
  grade: ReviewGrade;
  label: string;
  bg: string;
  fg: string;
}

const GRADE_BUTTONS: GradeButtonSpec[] = [
  {
    grade: 'again',
    label: 'Jeszcze raz',
    bg: theme.colors.status.dangerSoft,
    fg: theme.colors.status.dangerStrong,
  },
  { grade: 'hard', label: 'Trudne', bg: theme.colors.surface.sunken, fg: theme.colors.text.secondary },
  { grade: 'good', label: 'Dobrze', bg: theme.colors.brand.default, fg: theme.colors.brand.onBrand },
  {
    grade: 'easy',
    label: 'Łatwe',
    bg: theme.colors.status.successSoft,
    fg: theme.colors.status.successStrong,
  },
];

const RE_QUEUE_OFFSET = 3;
const RE_QUEUE_DUE_WINDOW_MS = 20 * 60 * 1000;

/** Anki-style 4-button scheduled review; reports grades via onReview. */
function ScheduledFlashcardPlayer({
  cards,
  onReview,
  onFinish,
}: {
  cards: AnyCard[];
  onReview?: (cardId: string, grade: ReviewGrade) => Promise<ReviewResult | void>;
  onFinish?: () => void;
}) {
  const [queue, setQueue] = useState<AnyCard[]>(cards);
  const [revealed, setRevealed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [reviewedCount, setReviewedCount] = useState(0);

  const current = queue[0];

  if (!current) {
    return (
      <View style={styles.center}>
        <CircleCheck size={40} color={theme.colors.status.success} />
        <Text.HeadlineMd style={styles.doneText}>Powtórka zakończona!</Text.HeadlineMd>
        {reviewedCount > 0 && (
          <Text.BodySm style={styles.doneSubtext}>
            Przejrzano {reviewedCount} {reviewedCount === 1 ? 'fiszkę' : 'fiszek'}
          </Text.BodySm>
        )}
      </View>
    );
  }

  const progressLabel = `Do powtórki: ${queue.length}`;

  const handleGrade = async (grade: ReviewGrade) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const result = await onReview?.(current.id, grade);
      const rest = queue.slice(1);
      let nextQueue = rest;

      if (
        result &&
        (result.phase === 'Learning' || result.phase === 'Relearning') &&
        new Date(result.due).getTime() - Date.now() <= RE_QUEUE_DUE_WINDOW_MS
      ) {
        const requeued = { ...current, intervals: result.intervals } as AnyCard;
        const insertAt = Math.min(RE_QUEUE_OFFSET, rest.length);
        nextQueue = [...rest.slice(0, insertAt), requeued, ...rest.slice(insertAt)];
      }

      setReviewedCount((c) => c + 1);
      setQueue(nextQueue);
      setRevealed(false);

      if (nextQueue.length === 0) {
        onFinish?.();
      }
    } finally {
      setSubmitting(false);
    }
  };

  const intervals = hasIntervals(current) ? current.intervals : null;

  return (
    <View style={styles.container}>
      <Text.Mono style={styles.progress}>{progressLabel}</Text.Mono>

      <TouchableOpacity
        style={styles.cardTouchable}
        activeOpacity={0.85}
        onPress={() => setRevealed((r) => !r)}
      >
        <Card elevated style={styles.card}>
          <Text.Caption style={styles.cardLabel}>{revealed ? 'ODPOWIEDŹ' : 'PYTANIE'}</Text.Caption>
          <Text.HeadlineMd style={styles.cardText}>
            {revealed ? current.answer : current.question}
          </Text.HeadlineMd>
          {!revealed && <Text.BodySm style={styles.hint}>Dotknij, aby zobaczyć odpowiedź</Text.BodySm>}
        </Card>
      </TouchableOpacity>

      {revealed && (
        <View style={styles.gradeRow}>
          {GRADE_BUTTONS.map((spec) => (
            <TouchableOpacity
              key={spec.grade}
              style={[styles.gradeButton, { backgroundColor: spec.bg, opacity: submitting ? 0.6 : 1 }]}
              activeOpacity={0.85}
              disabled={submitting}
              onPress={() => handleGrade(spec.grade)}
            >
              <Text.Body style={[styles.gradeButtonLabel, { color: spec.fg }]}>{spec.label}</Text.Body>
              {intervals && (
                <Text.Caption style={[styles.gradeButtonInterval, { color: spec.fg }]}>
                  {intervals[spec.grade]}
                </Text.Caption>
              )}
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    maxWidth: theme.layout.contentMaxWidth,
    alignSelf: 'center',
    padding: theme.spacing[4],
    gap: theme.spacing[4],
    backgroundColor: theme.colors.surface.app,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing[2],
    padding: theme.spacing[6],
  },
  doneText: { textAlign: 'center' },
  doneSubtext: { textAlign: 'center' },
  progress: { textAlign: 'center', color: theme.colors.text.secondary },
  cardTouchable: { flex: 1 },
  card: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing[3],
    padding: theme.spacing[6],
  },
  cardLabel: { letterSpacing: 1, textAlign: 'center' },
  cardText: { textAlign: 'center' },
  hint: { color: theme.colors.text.tertiary, marginTop: theme.spacing[2], textAlign: 'center' },
  actions: { flexDirection: 'row', gap: theme.spacing[3] },
  actionButton: { flex: 1 },
  gradeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing[3] },
  gradeButton: {
    flexBasis: '47%',
    flexGrow: 1,
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[3],
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing[1],
  },
  gradeButtonLabel: { fontFamily: theme.font.family.sansSemibold, textAlign: 'center' },
  gradeButtonInterval: { textAlign: 'center' },
});
