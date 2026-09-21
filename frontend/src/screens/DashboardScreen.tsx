import { useState } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { ArrowRight, Award, BookOpen, FileText, Layers, Plus, X } from 'lucide-react-native';
import { fetchCached, invalidate } from '../api/cache';
import { cacheKeys } from '../api/cacheKeys';
import { api } from '../api/client';
import { useRecents, type RecentLesson, type RecentSubject } from '../api/recents';
import { useCachedQuery } from '../hooks/useCachedQuery';
import { useAuth } from '../auth/AuthContext';
import { AppHeader } from '../components/AppHeader';
import { Badge } from '../components/ui/Badge';
import { CreateSubjectModal } from '../components/CreateSubjectModal';
import { Text } from '../components/ui/Text';
import { theme } from '../theme';
import type { RootStackParamList } from '../navigation/types';
import type { DailySummary, LessonSummary, SubjectSummary } from '../api/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Dashboard'>;
type Nav = Props['navigation'];

// Wide screens (tablet/desktop web) get a larger, spanning bento layout.
const WIDE_BREAKPOINT = 900;

interface RecentGrade {
  subjectId: string;
  subjectName: string;
  name: string;
  score: number;
  maxScore: number;
  date: string;
}

// Describes the daily-review backlog on the dashboard card. Acts as the app's
// "notification": a calm confirmation when clear, a plain count under the
// session size, and a warning once the backlog exceeds one session.
function dailySubtitle(summary: DailySummary | null): { text: string; warning: boolean } {
  if (summary === null) return { text: '…', warning: false };
  if (summary.dueCount === 0) {
    return summary.newAvailable > 0
      ? { text: 'Wszystko powtórzone — dostępne nowe fiszki', warning: false }
      : { text: 'Wszystko powtórzone', warning: false };
  }
  if (summary.dueCount > summary.dailySessionSize) {
    return { text: `${summary.dueCount} fiszek czeka — masz zaległości!`, warning: true };
  }
  return { text: `${summary.dueCount} ${pluralFiszki(summary.dueCount)} do powtórki dziś`, warning: false };
}

function pluralFiszki(n: number): string {
  if (n === 1) return 'fiszka';
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)) return 'fiszki';
  return 'fiszek';
}

// The dashboard has no dedicated "recent grades" endpoint, so it stitches one
// together from each subject's grade sheet. A subject that errors (or has no
// grades yet) simply contributes nothing rather than failing the whole tile.
async function fetchRecentGrades(subjects: SubjectSummary[]): Promise<RecentGrade[]> {
  const perSubject = await Promise.all(
    subjects.map(async (s): Promise<RecentGrade[]> => {
      try {
        const grades = await api.getGrades(s.id);
        return grades.components.flatMap((c) =>
          c.entries.map((e) => ({
            subjectId: s.id,
            subjectName: s.name,
            name: e.name,
            score: e.score,
            maxScore: e.maxScore,
            date: e.date,
          })),
        );
      } catch {
        return [];
      }
    }),
  );
  return perSubject.flat().sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

// Newest-first comparator. Prefers `createdAt` (once the backend exposes it);
// falls back to `order` (append-incremented) so it still degrades sensibly.
function byNewest(
  a: { createdAt?: string; order?: number },
  b: { createdAt?: string; order?: number },
): number {
  const ta = a.createdAt ? Date.parse(a.createdAt) : 0;
  const tb = b.createdAt ? Date.parse(b.createdAt) : 0;
  if (tb !== ta) return tb - ta;
  return (b.order ?? 0) - (a.order ?? 0);
}

// Fallback for the lesson tiles when the student hasn't opened any lessons yet:
// the most recently *added* lessons across all subjects. Reuses the per-subject
// lesson cache so an already-visited subject costs no extra request.
async function fetchLastAddedLessons(subjects: SubjectSummary[], need: number): Promise<RecentLesson[]> {
  const all: LessonSummary[] = [];
  for (const subject of subjects) {
    if (subject.lessonCount === 0) continue;
    try {
      const lessons = await fetchCached<LessonSummary[]>(cacheKeys.subjectLessons(subject.id), () =>
        api.listLessons(subject.id),
      );
      all.push(...lessons);
    } catch {
      // Skip subjects whose lessons can't be loaded.
    }
  }
  return all
    .sort(byNewest)
    .slice(0, need)
    .map((l) => ({ lessonId: l.id, lessonTitle: l.title, visitedAt: 0 }));
}

// Persists per-user dismissal of the "pick a university" notice. Web keeps it
// in localStorage (mirrors src/api/token.ts); native has no cheap sync
// storage for this low-stakes flag, so it just lives in memory for the
// session — the notice can reappear on the next app launch, which is fine.
const DISMISSED_KEY_PREFIX = 'fajneoceny_university_notice_dismissed_';
const inMemoryDismissed = new Set<string>();

function isUniversityNoticeDismissed(userId: string): boolean {
  if (Platform.OS === 'web') {
    return typeof localStorage !== 'undefined' && localStorage.getItem(DISMISSED_KEY_PREFIX + userId) === '1';
  }
  return inMemoryDismissed.has(userId);
}

function dismissUniversityNotice(userId: string): void {
  if (Platform.OS === 'web') {
    if (typeof localStorage !== 'undefined') localStorage.setItem(DISMISSED_KEY_PREFIX + userId, '1');
    return;
  }
  inMemoryDismissed.add(userId);
}

export function DashboardScreen({ navigation }: Props) {
  const [createVisible, setCreateVisible] = useState(false);
  const { user, signOut } = useAuth();
  const recents = useRecents();
  const [noticeDismissed, setNoticeDismissed] = useState(() => (user ? isUniversityNoticeDismissed(user.id) : true));
  const { width } = useWindowDimensions();
  const isWide = width >= WIDE_BREAKPOINT;

  const subjectsQuery = useCachedQuery<SubjectSummary[]>(cacheKeys.subjects, () => api.listSubjects());
  const summaryQuery = useCachedQuery<DailySummary>(cacheKeys.dailySummary, () => api.getDailySummary());

  const subjects = subjectsQuery.data ?? (subjectsQuery.error ? [] : null);
  const daily = dailySubtitle(summaryQuery.data ?? null);

  const gradesQuery = useCachedQuery<RecentGrade[]>(
    cacheKeys.dashboardGrades,
    () => fetchRecentGrades(subjects ?? []),
    { enabled: subjects !== null && subjects.length > 0 },
  );
  // No subjects at all ⇒ there can be no grades; otherwise wait for the fetch.
  const recentGrades = subjects !== null && subjects.length === 0 ? [] : (gradesQuery.data ?? null);

  // Lesson tiles: visited lessons first, topped up with the most recently added
  // lessons when there are fewer than two. Only fetch the fallback once recents
  // are hydrated (so we don't fetch, then immediately replace with restored
  // visits) and only when a slot actually needs filling.
  const lessonsNeeded = Math.max(0, 2 - recents.lessons.length);
  const fallbackLessonsQuery = useCachedQuery<RecentLesson[]>(
    cacheKeys.dashboardFallbackLessons,
    () => fetchLastAddedLessons(subjects ?? [], 2),
    { enabled: recents.hydrated && subjects !== null && subjects.length > 0 && lessonsNeeded > 0 },
  );

  const mergedLessons: RecentLesson[] = [...recents.lessons];
  const seenLessonIds = new Set(mergedLessons.map((l) => l.lessonId));
  for (const lesson of fallbackLessonsQuery.data ?? []) {
    if (mergedLessons.length >= 2) break;
    if (seenLessonIds.has(lesson.lessonId)) continue;
    mergedLessons.push(lesson);
    seenLessonIds.add(lesson.lessonId);
  }
  const lesson0 = mergedLessons[0];
  const lesson1 = mergedLessons[1];

  // Subject tile: last visited, else the most recently added subject.
  const fallbackSubject = subjects && subjects.length > 0 ? [...subjects].sort(byNewest)[0] : null;
  const recentSubject: RecentSubject | null =
    recents.subjects[0] ??
    (fallbackSubject
      ? { subjectId: fallbackSubject.id, subjectName: fallbackSubject.name, visitedAt: 0 }
      : null);
  // RecentSubject (persisted separately) doesn't carry course info, so look the
  // full summary up in the already-fetched subjects list for the tile's badge.
  const recentSubjectSummary = subjects?.find((s) => s.id === recentSubject?.subjectId) ?? null;

  const cards = {
    daily: (style: StyleProp<ViewStyle>) => (
      <DailyTile
        daily={daily}
        large={isWide}
        style={style}
        onPress={() => navigation.navigate('DailyFlashcards')}
      />
    ),
    lesson: (lesson: RecentLesson | undefined, style: StyleProp<ViewStyle>) => (
      <LessonSlot lesson={lesson} navigation={navigation} style={style} />
    ),
    subject: (style: StyleProp<ViewStyle>) => (
      <SubjectSlot subject={recentSubject} summary={recentSubjectSummary} navigation={navigation} style={style} />
    ),
    add: (style: StyleProp<ViewStyle>) => <AddTile style={style} onPress={() => setCreateVisible(true)} />,
    grades: (style: StyleProp<ViewStyle>) => (
      <GradesTile grades={recentGrades} style={style} onPress={() => navigation.navigate('Subjects')} />
    ),
    all: (style: StyleProp<ViewStyle>) => (
      <AllSubjectsTile subjects={subjects} style={style} onPress={() => navigation.navigate('Subjects')} />
    ),
  };

  return (
    <View style={styles.container}>
      {/* On desktop the header lives in the app shell (App.tsx); on mobile the
          dashboard shows it itself. */}
      {isWide ? null : (
        <AppHeader
          firstName={user?.firstName ?? ''}
          onSettings={() => navigation.navigate('Settings')}
          onSignOut={signOut}
        />
      )}

      {user && !user.universityId && !noticeDismissed ? (
        <UniversityNotice
          onGoToSettings={() => navigation.navigate('Settings')}
          onDismiss={() => {
            dismissUniversityNotice(user.id);
            setNoticeDismissed(true);
          }}
        />
      ) : null}

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {isWide ? (
          <View style={styles.deskWrap}>
            {/* Row 1: daily hero (wide) + add */}
            <View style={styles.deskRow}>
              {cards.daily([styles.deskCard, styles.deskHero, { flex: 2 }])}
              {cards.add([styles.deskCard, { flex: 1 }])}
            </View>

            {/* Row 2: Ostatni przedmiot spans two rows next to two stacked lessons */}
            <View style={styles.deskRow}>
              {cards.subject([styles.deskCard, { flex: 1 }])}
              <View style={[styles.deskColumn, { flex: 1 }]}>
                {cards.lesson(lesson0, [styles.deskCard, styles.deskLesson])}
                {cards.lesson(lesson1, [styles.deskCard, styles.deskLesson])}
              </View>
            </View>

            {/* Row 3: grades (wide) + all subjects */}
            <View style={styles.deskRow}>
              {cards.grades([styles.deskCard, { flex: 2 }])}
              {cards.all([styles.deskCard, styles.deskRowTile, { flex: 1 }])}
            </View>
          </View>
        ) : (
          <View style={styles.grid}>
            {cards.daily([styles.tileFull])}
            {cards.lesson(lesson0, [styles.tileHalf])}
            {cards.lesson(lesson1, [styles.tileHalf])}
            {cards.subject([styles.tileHalf])}
            {cards.add([styles.tileHalf])}
            {cards.grades([styles.tileFull])}
            {cards.all([styles.tileFull, styles.deskRowTile])}
          </View>
        )}
      </ScrollView>

      <CreateSubjectModal
        visible={createVisible}
        onClose={() => setCreateVisible(false)}
        subscribedCourseIds={(subjects ?? [])
          .map((s) => s.universityCourseId)
          .filter((id): id is string => id !== null)}
        onSubmit={async (input) => {
          await api.createSubject(input);
          setCreateVisible(false);
          invalidate(cacheKeys.subjects);
          invalidate(cacheKeys.myCourses);
        }}
      />
    </View>
  );
}

/* ------------------------------ Notices ---------------------------------- */

function UniversityNotice({
  onGoToSettings,
  onDismiss,
}: {
  onGoToSettings: () => void;
  onDismiss: () => void;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing[3],
        backgroundColor: theme.colors.accent.soft,
        borderRadius: theme.radius.md,
        paddingVertical: theme.spacing[3],
        paddingHorizontal: theme.spacing[4],
        marginHorizontal: theme.spacing[4],
        marginTop: theme.spacing[3],
      }}
    >
      <Text.BodySm style={{ flex: 1, color: theme.colors.accent.active }}>
        Wybierz uczelnię w ustawieniach, aby korzystać ze Społeczności.
      </Text.BodySm>
      <Pressable onPress={onGoToSettings} hitSlop={8}>
        <Text.BodySm style={{ color: theme.colors.accent.active, fontFamily: theme.font.family.sansSemibold }}>
          Przejdź
        </Text.BodySm>
      </Pressable>
      <Pressable onPress={onDismiss} hitSlop={8}>
        <X size={16} color={theme.colors.accent.active} />
      </Pressable>
    </View>
  );
}

/* ------------------------------- Cards ---------------------------------- */

function DailyTile({
  daily,
  large,
  onPress,
  style,
}: {
  daily: { text: string; warning: boolean };
  large: boolean;
  onPress: () => void;
  style: StyleProp<ViewStyle>;
}) {
  const Title = large ? Text.HeadlineMd : Text.Title;
  return (
    <Pressable
      style={({ pressed }) => [styles.tile, styles.tileDark, style, pressed && styles.pressed]}
      onPress={onPress}
    >
      <View style={styles.dailyTitleRow}>
        <Layers size={large ? 24 : 20} color={theme.colors.text.inverse} />
        <Title style={{ color: theme.colors.text.inverse }}>Dzisiejsze fiszki</Title>
      </View>
      <Text.Body
        style={{
          color: daily.warning ? theme.colors.status.warning : theme.colors.text.inverseSecondary,
          marginTop: theme.spacing[1],
        }}
      >
        {daily.text}
      </Text.Body>
    </Pressable>
  );
}

function LessonSlot({
  lesson,
  navigation,
  style,
}: {
  lesson: RecentLesson | undefined;
  navigation: Nav;
  style: StyleProp<ViewStyle>;
}) {
  if (!lesson) {
    return (
      <EmptyTile
        icon={FileText}
        label="Ostatnia lekcja"
        hint="Otwórz lekcję, aby wróciła tutaj"
        style={style}
      />
    );
  }
  return (
    <Pressable
      style={({ pressed }) => [styles.tile, style, pressed && styles.pressed]}
      onPress={() =>
        navigation.navigate('Lesson', { lessonId: lesson.lessonId, lessonTitle: lesson.lessonTitle })
      }
    >
      <TileHeader icon={FileText} label="Ostatnia lekcja" />
      <Text.BodyLg style={styles.tileTitle} numberOfLines={2}>
        {lesson.lessonTitle}
      </Text.BodyLg>
    </Pressable>
  );
}

function SubjectSlot({
  subject,
  summary,
  navigation,
  style,
}: {
  subject: RecentSubject | null;
  summary: SubjectSummary | null;
  navigation: Nav;
  style: StyleProp<ViewStyle>;
}) {
  if (!subject) {
    return (
      <EmptyTile
        icon={BookOpen}
        label="Ostatni przedmiot"
        hint="Otwórz przedmiot, aby wrócił tutaj"
        style={style}
      />
    );
  }
  return (
    <Pressable
      style={({ pressed }) => [styles.tile, style, pressed && styles.pressed]}
      onPress={() =>
        navigation.navigate('Subject', { subjectId: subject.subjectId, subjectName: subject.subjectName })
      }
    >
      <TileHeader icon={BookOpen} label="Ostatni przedmiot" />
      <Text.HeadlineMd
        style={[styles.tileTitle, { fontFamily: theme.font.family.sansSemibold }]}
        numberOfLines={4}
      >
        {subject.subjectName}
      </Text.HeadlineMd>
      <SubjectCourseBadge summary={summary} />
    </Pressable>
  );
}

/** Subtle badge shown when a subject is linked to a university course, or its
 * "propose as missing course" is still pending review. */
function SubjectCourseBadge({ summary }: { summary: SubjectSummary | null }) {
  if (!summary) return null;
  if (summary.universityCourseId) {
    return (
      <Badge
        label={summary.courseCode ?? 'Uczelniany'}
        variant="brand"
        style={{ marginTop: theme.spacing[2] }}
      />
    );
  }
  if (summary.proposalStatus === 'Pending') {
    return <Badge label="Oczekuje" variant="warning" style={{ marginTop: theme.spacing[2] }} />;
  }
  return null;
}

function AddTile({ onPress, style }: { onPress: () => void; style: StyleProp<ViewStyle> }) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.tile,
        styles.tileAccent,
        styles.tileCentered,
        style,
        pressed && styles.pressed,
      ]}
      onPress={onPress}
    >
      <View style={styles.addIcon}>
        <Plus size={22} color={theme.colors.accent.active} strokeWidth={2.5} />
      </View>
      <Text.BodyLg style={[styles.tileTitle, { color: theme.colors.accent.active }]}>
        Dodaj przedmiot
      </Text.BodyLg>
    </Pressable>
  );
}

function AllSubjectsTile({
  subjects,
  onPress,
  style,
}: {
  subjects: SubjectSummary[] | null;
  onPress: () => void;
  style: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable style={({ pressed }) => [styles.tile, style, pressed && styles.pressed]} onPress={onPress}>
      <View style={{ flex: 1 }}>
        <Text.BodyLg style={{ fontFamily: theme.font.family.sansSemibold }}>
          Zobacz wszystkie przedmioty
        </Text.BodyLg>
        {subjects !== null ? (
          <Text.BodySm style={{ color: theme.colors.text.secondary, marginTop: 2 }}>
            {subjects.length} {subjects.length === 1 ? 'przedmiot' : 'przedmiotów'}
          </Text.BodySm>
        ) : null}
      </View>
      <ArrowRight size={22} color={theme.colors.text.secondary} />
    </Pressable>
  );
}

// Cross-subject "last grades" digest. grades === null while it loads, [] when
// the student has no grades recorded anywhere yet.
function GradesTile({
  grades,
  onPress,
  style,
}: {
  grades: RecentGrade[] | null;
  onPress: () => void;
  style: StyleProp<ViewStyle>;
}) {
  const top = grades?.slice(0, 3) ?? [];
  return (
    <Pressable style={({ pressed }) => [styles.tile, style, pressed && styles.pressed]} onPress={onPress}>
      <TileHeader icon={Award} label="Ostatnie oceny" />
      {grades === null ? (
        <Text.BodySm style={{ color: theme.colors.text.tertiary }}>Wczytywanie…</Text.BodySm>
      ) : top.length === 0 ? (
        <Text.BodySm style={{ color: theme.colors.text.tertiary }}>
          Brak ocen jeszcze — wgraj zasady zaliczenia i dodaj pierwszą ocenę.
        </Text.BodySm>
      ) : (
        <View style={{ gap: theme.spacing[2], marginTop: theme.spacing[1] }}>
          {top.map((g, i) => {
            const pct = g.maxScore > 0 ? Math.round((g.score / g.maxScore) * 100) : null;
            return (
              <View key={`${g.subjectId}-${i}`} style={styles.gradeRow}>
                <View style={{ flex: 1 }}>
                  <Text.BodySm numberOfLines={1} style={{ fontFamily: theme.font.family.sansSemibold }}>
                    {g.name}
                  </Text.BodySm>
                  <Text.Caption numberOfLines={1} style={{ color: theme.colors.text.tertiary }}>
                    {g.subjectName}
                  </Text.Caption>
                </View>
                <Text.BodySm
                  style={{ fontFamily: theme.font.family.mono, color: theme.colors.text.secondary }}
                >
                  {g.score}/{g.maxScore}
                </Text.BodySm>
                {pct !== null ? (
                  <Badge label={`${pct}%`} variant={pct >= 50 ? 'success' : 'warning'} />
                ) : null}
              </View>
            );
          })}
        </View>
      )}
    </Pressable>
  );
}

function TileHeader({ icon: Icon, label }: { icon: typeof FileText; label: string }) {
  return (
    <View style={styles.tileHeader}>
      <Icon size={18} color={theme.colors.text.accent} />
      <Text.Caption style={{ color: theme.colors.text.secondary }}>{label}</Text.Caption>
    </View>
  );
}

function EmptyTile({
  icon,
  label,
  hint,
  style,
}: {
  icon: typeof FileText;
  label: string;
  hint: string;
  style: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.tile, styles.tileEmpty, style]}>
      <TileHeader icon={icon} label={label} />
      <Text.BodySm style={{ color: theme.colors.text.tertiary }}>{hint}</Text.BodySm>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.surface.app },
  scroll: { padding: theme.spacing[4], paddingBottom: theme.spacing[8] },

  // Mobile: single wrap grid.
  grid: {
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing[3],
  },
  tileFull: { flexBasis: '100%' },
  tileHalf: { flexGrow: 1, flexBasis: '46%', minWidth: 150, minHeight: 108 },

  // Desktop: larger, spanning bento.
  deskWrap: {
    width: '100%',
    maxWidth: 1040,
    alignSelf: 'center',
    gap: theme.spacing[4],
  },
  deskRow: { flexDirection: 'row', alignItems: 'stretch', gap: theme.spacing[4] },
  deskColumn: { gap: theme.spacing[4] },
  deskCard: { padding: theme.spacing[5] },
  deskHero: { minHeight: 168 },
  // Sized by minHeight (not flex:1, whose basis:0 would collapse the column's
  // intrinsic height) so the neighbouring subject tile stretches to match the
  // two stacked lessons — the "1 col × 2 rows" span.
  deskLesson: { minHeight: 104 },
  deskRowTile: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing[3] },

  tile: {
    backgroundColor: theme.colors.surface.card,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border.default,
    padding: theme.spacing[4],
    justifyContent: 'space-between',
    ...theme.shadows.sm,
  },
  tileDark: { backgroundColor: theme.colors.surface.inverse, borderColor: theme.colors.surface.inverse },
  tileAccent: { backgroundColor: theme.colors.accent.soft, borderColor: theme.colors.accent.soft },
  tileCentered: { justifyContent: 'center', alignItems: 'flex-start' },
  tileEmpty: {
    backgroundColor: theme.colors.surface.sunken,
    borderStyle: 'dashed',
    borderColor: theme.colors.border.strong,
    shadowOpacity: 0,
    elevation: 0,
  },
  tileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[2],
    marginBottom: theme.spacing[2],
  },
  tileTitle: { fontFamily: theme.font.family.sansSemibold, marginTop: theme.spacing[2] },
  pressed: { opacity: 0.7 },
  addIcon: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surface.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gradeRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing[3] },
  dailyTitleRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing[2] },
});
