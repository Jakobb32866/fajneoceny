import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Heart } from 'lucide-react-native';
import { api } from '../api/client';
import { cacheKeys } from '../api/cacheKeys';
import { getCached, setCached } from '../api/cache';
import { useCachedQuery } from '../hooks/useCachedQuery';
import { Badge } from './ui/Badge';
import { Chip } from './ui/Chip';
import { TextField } from './ui/Input';
import { Text } from './ui/Text';
import { theme } from '../theme';
import type { RootStackParamList } from '../navigation/types';
import type { CommunityLessonListItem, CommunityLessonPage, CommunitySort } from '../api/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const SORT_OPTIONS: { value: CommunitySort; label: string }[] = [
  { value: 'likes', label: 'Polubienia' },
  { value: 'published', label: 'Data publikacji' },
  { value: 'updated', label: 'Ostatnia zmiana' },
];

/** Polish plural for "fiszka" (card): 1 fiszka, 2–4 fiszki, 5+ fiszek. */
function cardWord(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (n === 1) return 'fiszka';
  if (mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)) return 'fiszki';
  return 'fiszek';
}

/** Polish plural for "talia" (deck): 1 talia, 2–4 talie, 5+ talii. */
function deckWord(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (n === 1) return 'talia';
  if (mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)) return 'talie';
  return 'talii';
}

function formatShortDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' });
  } catch {
    return '';
  }
}

export function CommunityLessonList({ courseId }: { courseId: string }) {
  const navigation = useNavigation<Nav>();
  const [sort, setSort] = useState<CommunitySort>('likes');
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);

  // Debounce the search box into `query`, which is what actually drives the fetch key.
  useEffect(() => {
    const timer = setTimeout(() => setQuery(q), 400);
    return () => clearTimeout(timer);
  }, [q]);

  // A new sort or search resets pagination back to the first page.
  useEffect(() => {
    setPage(1);
  }, [sort, query]);

  const key = cacheKeys.communityLessons(courseId, sort, query, page);
  const { data, loading } = useCachedQuery<CommunityLessonPage>(
    key,
    () => api.listCommunityLessons(courseId, { sort, q: query, page }),
    { staleMs: 60_000 },
  );

  const toggleLike = async (item: CommunityLessonListItem) => {
    if (item.isMine) return;
    const current = getCached<CommunityLessonPage>(key);
    if (!current) return;

    const wasLiked = item.likedByMe;
    const prevCount = item.likeCount;
    const optimistic = current.items.map((i) =>
      i.id === item.id ? { ...i, likedByMe: !wasLiked, likeCount: prevCount + (wasLiked ? -1 : 1) } : i,
    );
    setCached(key, { ...current, items: optimistic });

    try {
      const result = wasLiked
        ? await api.unlikeCommunityLesson(item.id)
        : await api.likeCommunityLesson(item.id);
      const latest = getCached<CommunityLessonPage>(key);
      if (latest) {
        setCached(key, {
          ...latest,
          items: latest.items.map((i) =>
            i.id === item.id ? { ...i, likeCount: result.likeCount, likedByMe: result.likedByMe } : i,
          ),
        });
      }
    } catch (e) {
      const latest = getCached<CommunityLessonPage>(key);
      if (latest) {
        setCached(key, {
          ...latest,
          items: latest.items.map((i) =>
            i.id === item.id ? { ...i, likedByMe: wasLiked, likeCount: prevCount } : i,
          ),
        });
      }
      Alert.alert('Nie udało się zapisać polubienia', String(e));
    }
  };

  return (
    <View style={{ flex: 1, width: '100%', maxWidth: theme.layout.contentMaxWidth, alignSelf: 'center' }}>
      <View
        style={{
          flexDirection: 'row',
          gap: theme.spacing[2],
          paddingHorizontal: theme.spacing[4],
          paddingTop: theme.spacing[3],
        }}
      >
        {SORT_OPTIONS.map((opt) => (
          <Chip
            key={opt.value}
            label={opt.label}
            selected={sort === opt.value}
            onPress={() => setSort(opt.value)}
          />
        ))}
      </View>

      <View style={{ paddingHorizontal: theme.spacing[4], paddingTop: theme.spacing[3] }}>
        <TextField placeholder="Szukaj po tytule…" value={q} onChangeText={setQ} />
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: theme.spacing[8] }} />
      ) : (
        <FlatList
          data={data?.items ?? []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: theme.spacing[4], gap: theme.spacing[3] }}
          ListEmptyComponent={
            <Text.Body
              style={{ color: theme.colors.text.tertiary, textAlign: 'center', marginTop: theme.spacing[6] }}
            >
              Nikt jeszcze nie udostępnił notatki w tym przedmiocie.
            </Text.Body>
          }
          renderItem={({ item }) => (
            <Pressable
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: theme.colors.surface.sunken,
                borderRadius: theme.radius.md,
                padding: theme.spacing[4],
                gap: theme.spacing[3],
              }}
              onPress={() => navigation.navigate('CommunityLesson', { lessonId: item.id, title: item.title })}
            >
              <View style={{ flex: 1, gap: theme.spacing[1] }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing[2] }}>
                  <Text.BodyLg
                    style={{ fontFamily: theme.font.family.sansSemibold, flexShrink: 1 }}
                    numberOfLines={1}
                  >
                    {item.title}
                  </Text.BodyLg>
                  {item.isMine ? <Badge label="Twoja" variant="brand" /> : null}
                </View>
                <Text.BodySm style={{ color: theme.colors.text.secondary }}>{item.authorName}</Text.BodySm>
                <Text.BodySm style={{ color: theme.colors.text.tertiary }}>
                  {item.deckCount} {deckWord(item.deckCount)} · {item.cardCount} {cardWord(item.cardCount)} ·{' '}
                  {formatShortDate(item.sharedAt)}
                </Text.BodySm>
              </View>
              <Pressable
                disabled={item.isMine}
                onPress={(e) => {
                  e.stopPropagation();
                  toggleLike(item);
                }}
                hitSlop={8}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
              >
                <Heart
                  size={18}
                  color={item.likedByMe ? theme.colors.status.danger : theme.colors.text.tertiary}
                  fill={item.likedByMe ? theme.colors.status.danger : 'none'}
                />
                <Text.BodySm>{item.likeCount}</Text.BodySm>
              </Pressable>
            </Pressable>
          )}
        />
      )}

      {data && data.totalPages > 1 ? (
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'center',
            alignItems: 'center',
            gap: theme.spacing[2],
            paddingVertical: theme.spacing[3],
          }}
        >
          <Pressable disabled={page <= 1} onPress={() => setPage((p) => p - 1)}>
            <Text.BodySm
              style={{
                color: page <= 1 ? theme.colors.text.tertiary : theme.colors.text.link,
                fontFamily: theme.font.family.sansSemibold,
              }}
            >
              ‹ Poprzednia
            </Text.BodySm>
          </Pressable>
          <Text.BodySm style={{ color: theme.colors.text.tertiary }}>
            · Strona {data.page} z {data.totalPages} ·
          </Text.BodySm>
          <Pressable disabled={page >= data.totalPages} onPress={() => setPage((p) => p + 1)}>
            <Text.BodySm
              style={{
                color: page >= data.totalPages ? theme.colors.text.tertiary : theme.colors.text.link,
                fontFamily: theme.font.family.sansSemibold,
              }}
            >
              Następna ›
            </Text.BodySm>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}
