import { useEffect, useRef, useState } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { PartyPopper } from 'lucide-react-native';
import { invalidate } from '../api/cache';
import { cacheKeys } from '../api/cacheKeys';
import { api } from '../api/client';
import { FlashcardPlayer } from '../components/FlashcardPlayer';
import { Button } from '../components/ui/Button';
import { Text } from '../components/ui/Text';
import type { RootStackParamList } from '../navigation/types';
import type { DailyCardDto, DailyResponse } from '../api/types';
import { theme } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'DailyFlashcards'>;

// How many "extra" (review-ahead) cards to fetch per tap.
const EXTRA_BATCH_SIZE = 10;
// Cap on how many due cards to pull in one "keep going" batch.
const DUE_BATCH_SIZE = 20;

type Phase = 'loading' | 'playing' | 'empty' | 'done';
type FetchingBatch = 'due' | 'extra' | null;

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

// Formats an ISO datetime into a friendly Polish string: "dziś o HH:MM",
// "jutro o HH:MM", or "DD.MM o HH:MM" for anything further out.
function formatNextDue(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`;

  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

  if (isSameDay(date, now)) return `dziś o ${time}`;

  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  if (isSameDay(date, tomorrow)) return `jutro o ${time}`;

  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)} o ${time}`;
}

export function DailyFlashcardsScreen({ navigation }: Props) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [daily, setDaily] = useState<DailyResponse | null>(null);
  const [sessionCards, setSessionCards] = useState<DailyCardDto[]>([]);
  const [seenIds, setSeenIds] = useState<Set<string>>(new Set());
  const [batchKey, setBatchKey] = useState(0);
  const [fetchingBatch, setFetchingBatch] = useState<FetchingBatch>(null);
  const [extraMessage, setExtraMessage] = useState<string | null>(null);

  // Deliberately NOT cached: replaying a cached daily payload would re-serve
  // cards the student already graded this session.
  useEffect(() => {
    api
      .getDailyFlashcards()
      .then((response) => {
        setDaily(response);
        if (response.cards.length === 0) {
          setPhase('empty');
        } else {
          setSessionCards(response.cards);
          setSeenIds(new Set(response.cards.map((c) => c.id)));
          setPhase('playing');
        }
      })
      .catch(() => {
        setDaily({ dueCount: 0, newAvailable: 0, newLimit: 0, nextDueAt: null, cards: [] });
        setPhase('empty');
      });
  }, []);

  // Reviews change the due counts the dashboard shows. Invalidating per card
  // would make the still-mounted dashboard refetch on every single grade, so
  // this fires once, on the way out.
  const reviewed = useRef(false);
  useEffect(
    () => () => {
      if (reviewed.current) invalidate(cacheKeys.dailySummary);
    },
    [],
  );

  const handleFinish = () => {
    setExtraMessage(null);
    setPhase('done');
  };

  const loadNextDue = async () => {
    if (!daily || fetchingBatch) return;
    setExtraMessage(null);
    setFetchingBatch('due');
    try {
      const remaining = Math.max(daily.dueCount - seenIds.size, 0);
      const count = Math.min(remaining, DUE_BATCH_SIZE) || DUE_BATCH_SIZE;
      const response = await api.getDailyFlashcards(count);
      const fresh = response.cards.filter((c) => !seenIds.has(c.id));
      if (fresh.length === 0) {
        setExtraMessage('Nic więcej do powtórki.');
        return;
      }
      setSeenIds((prev) => new Set([...prev, ...fresh.map((c) => c.id)]));
      setSessionCards(fresh);
      setBatchKey((k) => k + 1);
      setPhase('playing');
    } catch {
      setExtraMessage('Nie udało się pobrać kolejnych fiszek.');
    } finally {
      setFetchingBatch(null);
    }
  };

  const loadExtra = async () => {
    if (fetchingBatch) return;
    setExtraMessage(null);
    setFetchingBatch('extra');
    try {
      const extra = await api.getExtraFlashcards(EXTRA_BATCH_SIZE, Array.from(seenIds));
      if (extra.length === 0) {
        setExtraMessage('Nic więcej do powtórki.');
        return;
      }
      setSeenIds((prev) => new Set([...prev, ...extra.map((c) => c.id)]));
      setSessionCards(extra);
      setBatchKey((k) => k + 1);
      setPhase('playing');
    } catch {
      setExtraMessage('Nie udało się pobrać dodatkowych fiszek.');
    } finally {
      setFetchingBatch(null);
    }
  };

  if (phase === 'loading' || !daily) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.colors.brand.default} />
      </View>
    );
  }

  if (phase === 'empty') {
    return (
      <View style={styles.center}>
        <Text.Body style={styles.emptyText}>Brak fiszek na dziś</Text.Body>
        {daily.nextDueAt && (
          <Text.BodySm style={styles.emptySubText}>
            Następna powtórka: {formatNextDue(daily.nextDueAt)}
          </Text.BodySm>
        )}
        {extraMessage ? (
          <Text.BodySm style={styles.emptySubText}>{extraMessage}</Text.BodySm>
        ) : (
          <View style={styles.emptyActionWrap}>
            <Button
              title="+10 dodatkowych fiszek"
              variant="accent"
              loading={fetchingBatch === 'extra'}
              disabled={fetchingBatch !== null}
              onPress={loadExtra}
            />
          </View>
        )}
      </View>
    );
  }

  if (phase === 'done') {
    const remaining = Math.max(daily.dueCount - seenIds.size, 0);
    const nextBatchSize = Math.min(remaining, DUE_BATCH_SIZE);

    return (
      <View style={styles.center}>
        <PartyPopper size={40} color={theme.colors.accent.active} />
        <Text.HeadlineMd style={styles.doneTitle}>Sesja zakończona</Text.HeadlineMd>
        {extraMessage && <Text.BodySm style={styles.emptySubText}>{extraMessage}</Text.BodySm>}
        <View style={styles.doneActions}>
          {remaining > 0 && (
            <Button
              title={`Powtórz kolejne ${nextBatchSize}`}
              variant="primary"
              loading={fetchingBatch === 'due'}
              disabled={fetchingBatch !== null}
              onPress={loadNextDue}
              fullWidth
            />
          )}
          <Button
            title="+10 dodatkowych fiszek"
            variant="accent"
            loading={fetchingBatch === 'extra'}
            disabled={fetchingBatch !== null}
            onPress={loadExtra}
            fullWidth
          />
          <Button
            title="Wróć"
            variant="ghost"
            disabled={fetchingBatch !== null}
            onPress={() => navigation.goBack()}
            fullWidth
          />
        </View>
      </View>
    );
  }

  const showBacklogBanner = daily.dueCount > daily.cards.length;

  return (
    <View style={styles.container}>
      {showBacklogBanner && (
        <View style={styles.banner}>
          <Text.BodySm style={styles.bannerText}>
            Dziś do powtórki: {daily.dueCount} — ta sesja obejmuje {daily.cards.length}
          </Text.BodySm>
        </View>
      )}
      <FlashcardPlayer
        key={batchKey}
        cards={sessionCards}
        onReview={(id, grade) => {
          reviewed.current = true;
          return api.reviewFlashcard(id, grade);
        }}
        onFinish={handleFinish}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.surface.app },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing[6],
    gap: theme.spacing[3],
    backgroundColor: theme.colors.surface.app,
  },
  emptyText: { textAlign: 'center', color: theme.colors.text.tertiary },
  emptySubText: { textAlign: 'center', color: theme.colors.text.secondary },
  emptyActionWrap: { marginTop: theme.spacing[3] },
  doneTitle: { textAlign: 'center' },
  doneActions: { width: '100%', gap: theme.spacing[3], marginTop: theme.spacing[3] },
  banner: {
    backgroundColor: theme.colors.status.warningSoft,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.status.warning,
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[4],
  },
  bannerText: { textAlign: 'center', color: theme.colors.status.warningStrong },
});
