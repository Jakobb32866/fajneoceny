import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, View } from 'react-native';
import { api } from '../api/client';
import { cacheKeys } from '../api/cacheKeys';
import { invalidate } from '../api/cache';
import { ApiError } from '../api/errors';
import { useAdminAuth } from '../auth/AdminAuthContext';
import { useCachedQuery } from '../hooks/useCachedQuery';
import { AdminNoScopeNotice, AdminScopeBar } from '../components/AdminScopeBar';
import { Badge } from '../components/ui/Badge';
import { Banner } from '../components/ui/Banner';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Chip } from '../components/ui/Chip';
import { TextField } from '../components/ui/Input';
import { ModalSheet } from '../components/ui/ModalSheet';
import { Text } from '../components/ui/Text';
import { theme } from '../theme';
import type {
  AdminCourse,
  AdminLessonListItem,
  AdminLessonPage,
  AdminModeratedLesson,
  CommunitySort,
} from '../api/types';

const SORT_OPTIONS: { value: CommunitySort; label: string }[] = [
  { value: 'likes', label: 'Polubienia' },
  { value: 'published', label: 'Data publikacji' },
  { value: 'updated', label: 'Ostatnia zmiana' },
];

/**
 * The moderation feed: every shared lesson in the university, with the same
 * sort/search/paging behaviour students see in Społeczność, plus a course
 * filter and the takedown action.
 *
 * Only shared lessons appear here — a private lesson is never visible to an
 * admin, and a lesson disappears from this list the moment it is taken down.
 */
export function AdminLessonsScreen() {
  const { scopedUniversityId: universityId } = useAdminAuth();

  const [sort, setSort] = useState<CommunitySort>('likes');
  const [courseId, setCourseId] = useState<string>('');
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [tab, setTab] = useState<'shared' | 'moderated'>('shared');
  const [acting, setActing] = useState<AdminLessonListItem | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Debounce the search box, as CommunityLessonList does.
  useEffect(() => {
    const t = setTimeout(() => setQuery(q), 400);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    setPage(1);
  }, [sort, query, courseId, universityId]);

  const scope = universityId ?? 'none';

  const { data: courses } = useCachedQuery<AdminCourse[]>(
    cacheKeys.adminCourses(scope),
    () => api.admin.listCourses(universityId),
    { enabled: !!universityId },
  );

  const { data, loading, refetch } = useCachedQuery<AdminLessonPage>(
    cacheKeys.adminLessons(scope, courseId || 'all', sort, query, page),
    () => api.admin.listLessons({ universityId, courseId: courseId || undefined, sort, q: query, page }),
    { enabled: !!universityId && tab === 'shared', staleMs: 60_000 },
  );

  const { data: moderated, refetch: refetchModerated } = useCachedQuery<AdminModeratedLesson[]>(
    cacheKeys.adminModeratedLessons(scope),
    () => api.admin.listModeratedLessons(universityId),
    { enabled: !!universityId && tab === 'moderated' },
  );

  async function liftLock(lessonId: string) {
    setError(null);
    try {
      await api.admin.liftLessonLock(lessonId, universityId);
      refetchModerated();
    } catch {
      setError('Nie udało się zdjąć blokady.');
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.surface.app }}>
      <AdminScopeBar />

      <View style={{ flexDirection: 'row', gap: theme.spacing[2], paddingHorizontal: theme.spacing[4] }}>
        <Chip label="Udostępnione" selected={tab === 'shared'} onPress={() => setTab('shared')} />
        <Chip label="Zablokowane" selected={tab === 'moderated'} onPress={() => setTab('moderated')} />
      </View>

      {error ? (
        <View style={{ paddingHorizontal: theme.spacing[4], paddingTop: theme.spacing[2] }}>
          <Banner message={error} variant="danger" />
        </View>
      ) : null}

      {!universityId ? (
        <AdminNoScopeNotice />
      ) : tab === 'moderated' ? (
        <FlatList
          data={moderated ?? []}
          keyExtractor={(l) => l.id}
          contentContainerStyle={{ padding: theme.spacing[4], gap: theme.spacing[3] }}
          ListHeaderComponent={
            <Text.BodySm style={{ color: theme.colors.text.secondary }}>
              Treść zablokowanej lekcji nie jest widoczna dla administratora — pozostaje tylko to, co zapisano
              w chwili blokady.
            </Text.BodySm>
          }
          ListEmptyComponent={
            <Text.Body style={{ color: theme.colors.text.tertiary, textAlign: 'center', marginTop: theme.spacing[6] }}>
              Brak zablokowanych lekcji.
            </Text.Body>
          }
          renderItem={({ item }) => (
            <Card style={{ gap: theme.spacing[2] }}>
              <Text.BodyLg style={{ fontFamily: theme.font.family.sansSemibold }}>{item.title}</Text.BodyLg>
              <Text.BodySm style={{ color: theme.colors.text.secondary }}>{item.authorName}</Text.BodySm>
              {item.moderationLockReason ? (
                <Text.BodySm style={{ color: theme.colors.text.tertiary }}>
                  Powód: {item.moderationLockReason}
                </Text.BodySm>
              ) : null}
              <Button title="Zdejmij blokadę" size="sm" variant="ghost" onPress={() => liftLock(item.id)} />
            </Card>
          )}
        />
      ) : (
        <>
          <View style={{ gap: theme.spacing[2], paddingTop: theme.spacing[2] }}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ flexGrow: 0 }}
              contentContainerStyle={{ alignItems: 'center', paddingHorizontal: theme.spacing[4], gap: theme.spacing[2] }}
            >
              {SORT_OPTIONS.map((o) => (
                <Chip key={o.value} label={o.label} selected={sort === o.value} onPress={() => setSort(o.value)} />
              ))}
            </ScrollView>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ flexGrow: 0 }}
              contentContainerStyle={{ alignItems: 'center', paddingHorizontal: theme.spacing[4], gap: theme.spacing[2] }}
            >
              <Chip label="Wszystkie przedmioty" selected={!courseId} onPress={() => setCourseId('')} />
              {(courses ?? []).map((c) => (
                <Chip
                  key={c.id}
                  label={c.code ?? c.name}
                  selected={courseId === c.id}
                  onPress={() => setCourseId(courseId === c.id ? '' : c.id)}
                />
              ))}
            </ScrollView>

            <View style={{ paddingHorizontal: theme.spacing[4] }}>
              <TextField placeholder="Szukaj po tytule…" value={q} onChangeText={setQ} />
            </View>
          </View>

          {loading && !data ? (
            <ActivityIndicator style={{ marginTop: theme.spacing[8] }} />
          ) : (
            <FlatList
              data={data?.items ?? []}
              keyExtractor={(l) => l.id}
              contentContainerStyle={{ padding: theme.spacing[4], gap: theme.spacing[3] }}
              ListEmptyComponent={
                <Text.Body
                  style={{ color: theme.colors.text.tertiary, textAlign: 'center', marginTop: theme.spacing[6] }}
                >
                  Brak udostępnionych lekcji.
                </Text.Body>
              }
              renderItem={({ item }) => (
                <Card style={{ gap: theme.spacing[2] }}>
                  <Text.BodyLg style={{ fontFamily: theme.font.family.sansSemibold }}>{item.title}</Text.BodyLg>
                  <Text.BodySm style={{ color: theme.colors.text.secondary }}>
                    {item.authorName} · {item.courseName}
                  </Text.BodySm>
                  <Text.Caption style={{ color: theme.colors.text.tertiary }}>
                    {item.likeCount} polubień · {item.deckCount} talie · {item.cardCount} fiszek
                  </Text.Caption>
                  <Button title="Ukryj lekcję" size="sm" variant="danger" onPress={() => setActing(item)} />
                </Card>
              )}
              ListFooterComponent={
                (data?.totalPages ?? 0) > 1 ? (
                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'center',
                      alignItems: 'center',
                      gap: theme.spacing[3],
                      paddingVertical: theme.spacing[4],
                    }}
                  >
                    <Button
                      title="Poprzednia"
                      size="sm"
                      variant="ghost"
                      disabled={page <= 1}
                      onPress={() => setPage((p) => Math.max(1, p - 1))}
                    />
                    <Text.BodySm style={{ color: theme.colors.text.secondary }}>
                      {data!.page} / {data!.totalPages}
                    </Text.BodySm>
                    <Button
                      title="Następna"
                      size="sm"
                      variant="ghost"
                      disabled={page >= (data?.totalPages ?? 1)}
                      onPress={() => setPage((p) => p + 1)}
                    />
                  </View>
                ) : null
              }
            />
          )}
        </>
      )}

      <TakedownModal
        lesson={acting}
        universityId={universityId}
        onClose={() => setActing(null)}
        onDone={() => {
          setActing(null);
          invalidate(`admin/scope/${scope}`);
          refetch();
        }}
      />
    </View>
  );
}

function TakedownModal({
  lesson,
  universityId,
  onClose,
  onDone,
}: {
  lesson: AdminLessonListItem | null;
  universityId: string | undefined;
  onClose: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState('');
  const [banHours, setBanHours] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!lesson) return null;

  async function submit() {
    if (!lesson) return;
    setBusy(true);
    setError(null);
    try {
      await api.admin.takedownLesson(
        lesson.id,
        { reason: reason.trim(), banHours: banHours ?? undefined },
        universityId,
      );
      setReason('');
      setBanHours(null);
      onDone();
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 400
          ? 'Podaj powód — to jedyny zapis tego, dlaczego lekcja została ukryta.'
          : 'Nie udało się ukryć lekcji.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalSheet
      visible={!!lesson}
      title="Ukryj lekcję"
      onClose={() => {
        setReason('');
        setBanHours(null);
        setError(null);
        onClose();
      }}
    >
      <View style={{ gap: theme.spacing[4] }}>
        {error ? <Banner message={error} variant="danger" /> : null}

        <View style={{ gap: theme.spacing[1] }}>
          <Text.BodyLg style={{ fontFamily: theme.font.family.sansSemibold }}>{lesson.title}</Text.BodyLg>
          <Text.BodySm style={{ color: theme.colors.text.secondary }}>{lesson.authorName}</Text.BodySm>
        </View>

        <Banner
          message="Lekcja zniknie ze Społeczności, a autor nie będzie mógł udostępnić jej ponownie, dopóki nie zdejmiesz blokady. Po ukryciu jej treść przestaje być widoczna także dla administratorów — zostaje tylko powód wpisany poniżej."
          variant="warning"
        />

        <TextField
          label="Powód (wymagany)"
          value={reason}
          onChangeText={setReason}
          multiline
          placeholder="np. materiał chroniony prawem autorskim"
        />

        <View style={{ gap: theme.spacing[2] }}>
          <Text.Caption style={{ color: theme.colors.text.secondary }}>
            Dodatkowo zablokuj autorowi udostępnianie
          </Text.Caption>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing[2] }}>
            <Chip label="Nie" selected={banHours === null} onPress={() => setBanHours(null)} />
            {[24, 72, 168].map((h) => (
              <Chip
                key={h}
                label={h === 168 ? '7 dni' : `${h} h`}
                selected={banHours === h}
                onPress={() => setBanHours(h)}
              />
            ))}
          </View>
        </View>

        <Button
          title="Ukryj lekcję"
          variant="danger"
          fullWidth
          loading={busy}
          disabled={!reason.trim()}
          onPress={submit}
        />
      </View>
    </ModalSheet>
  );
}
