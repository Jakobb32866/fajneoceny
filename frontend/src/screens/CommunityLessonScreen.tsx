import { useState } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { ChevronDown, ChevronUp, Heart } from 'lucide-react-native';
import { getCached, invalidate, setCached } from '../api/cache';
import { cacheKeys } from '../api/cacheKeys';
import { api } from '../api/client';
import { ApiError } from '../api/errors';
import { useCachedQuery } from '../hooks/useCachedQuery';
import { RichNoteEditor } from '../components/RichNoteEditor';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Text } from '../components/ui/Text';
import { theme } from '../theme';
import type { RootStackParamList } from '../navigation/types';
import type { CommunityLessonDetail } from '../api/types';

type Props = NativeStackScreenProps<RootStackParamList, 'CommunityLesson'>;

/** Polish plural for "fiszka" (card): 1 fiszka, 2–4 fiszki, 5+ fiszek. */
function cardWord(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (n === 1) return 'fiszka';
  if (mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)) return 'fiszki';
  return 'fiszek';
}

export function CommunityLessonScreen({ route, navigation }: Props) {
  const { lessonId } = route.params;
  const key = cacheKeys.communityLesson(lessonId);
  const { data: lesson, error } = useCachedQuery<CommunityLessonDetail>(key, () => api.getCommunityLesson(lessonId));
  const [expandedDecks, setExpandedDecks] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);

  const toggleDeck = (deckId: string) => {
    setExpandedDecks((prev) => ({ ...prev, [deckId]: !prev[deckId] }));
  };

  const toggleLike = async () => {
    if (!lesson || lesson.isMine) return;
    const wasLiked = lesson.likedByMe;
    const prevCount = lesson.likeCount;
    setCached(key, { ...lesson, likedByMe: !wasLiked, likeCount: prevCount + (wasLiked ? -1 : 1) });
    try {
      const result = wasLiked
        ? await api.unlikeCommunityLesson(lessonId)
        : await api.likeCommunityLesson(lessonId);
      const current = getCached<CommunityLessonDetail>(key);
      if (current) setCached(key, { ...current, likeCount: result.likeCount, likedByMe: result.likedByMe });
    } catch (e) {
      const current = getCached<CommunityLessonDetail>(key);
      if (current) setCached(key, { ...current, likedByMe: wasLiked, likeCount: prevCount });
      Alert.alert('Nie udało się zapisać polubienia', String(e));
    }
  };

  const fork = async () => {
    setSaving(true);
    try {
      const result = await api.forkCommunityLesson(lessonId);
      invalidate(cacheKeys.subjectLessons(result.subjectId));
      invalidate(cacheKeys.subjects);
      navigation.replace('Lesson', { lessonId: result.id, lessonTitle: result.title });
    } catch (e) {
      Alert.alert('Nie udało się zapisać', String(e));
      setSaving(false);
    }
  };

  if (error instanceof ApiError && error.status === 404) {
    return (
      <View style={styles.center}>
        <Text.Body style={{ marginBottom: theme.spacing[4] }}>Ta notatka nie jest już dostępna.</Text.Body>
        <Button title="Wróć" variant="ghost" onPress={() => navigation.goBack()} />
      </View>
    );
  }

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
      <View style={{ gap: theme.spacing[1] }}>
        <Text.HeadlineLg>{lesson.title}</Text.HeadlineLg>
        <Text.BodySm style={{ color: theme.colors.text.secondary }}>Autor: {lesson.authorName}</Text.BodySm>
        <Pressable
          disabled={lesson.isMine}
          onPress={toggleLike}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: theme.spacing[1] }}
        >
          <Heart
            size={18}
            color={lesson.likedByMe ? theme.colors.status.danger : theme.colors.text.tertiary}
            fill={lesson.likedByMe ? theme.colors.status.danger : 'none'}
          />
          <Text.BodySm>{lesson.likeCount}</Text.BodySm>
        </Pressable>
      </View>

      <View>
        <Text.Title style={styles.sectionTitle}>Notatki</Text.Title>
        {lesson.noteContent ? (
          <RichNoteEditor value={lesson.noteContent} onChangeText={() => {}} readOnly />
        ) : (
          <Text.BodySm style={styles.empty}>Brak notatki</Text.BodySm>
        )}
      </View>

      <View>
        <Text.Title style={styles.sectionTitle}>Talie</Text.Title>
        {lesson.decks.length === 0 ? (
          <Text.BodySm style={styles.empty}>Brak talii.</Text.BodySm>
        ) : (
          lesson.decks.map((deck) => {
            const expanded = !!expandedDecks[deck.id];
            return (
              <Card key={deck.id} style={styles.deckCard}>
                <Pressable style={styles.deckHeader} onPress={() => toggleDeck(deck.id)}>
                  <Text.Body style={[styles.deckName, { flex: 1 }]} numberOfLines={1}>
                    {deck.name}
                  </Text.Body>
                  <Text.BodySm style={{ color: theme.colors.text.secondary }}>
                    {deck.flashcards.length} {cardWord(deck.flashcards.length)}
                  </Text.BodySm>
                  {expanded ? (
                    <ChevronUp size={18} color={theme.colors.text.secondary} />
                  ) : (
                    <ChevronDown size={18} color={theme.colors.text.secondary} />
                  )}
                </Pressable>

                {expanded && (
                  <View style={styles.cardList}>
                    {deck.flashcards.map((card) => (
                      <View key={card.id} style={styles.cardRow}>
                        <Text.BodySm style={styles.cardQuestion}>{card.question}</Text.BodySm>
                        <Text.BodySm style={{ color: theme.colors.text.secondary }}>{card.answer}</Text.BodySm>
                      </View>
                    ))}
                  </View>
                )}
              </Card>
            );
          })
        )}
      </View>

      {lesson.isMine ? (
        <Text.Caption>To Twoja udostępniona notatka.</Text.Caption>
      ) : (
        <Button title="Zapisz do moich notatek" onPress={fork} loading={saving} fullWidth />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.surface.app },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surface.app,
    padding: theme.spacing[4],
  },
  sectionTitle: { marginBottom: theme.spacing[2] },
  empty: { color: theme.colors.text.tertiary },
  deckCard: { marginBottom: theme.spacing[2] },
  deckHeader: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing[2] },
  deckName: { fontFamily: theme.font.family.sansSemibold },
  cardList: { marginTop: theme.spacing[3], gap: theme.spacing[3] },
  cardRow: {
    gap: 2,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border.default,
    paddingTop: theme.spacing[2],
  },
  cardQuestion: { fontFamily: theme.font.family.sansSemibold, color: theme.colors.text.primary },
});
