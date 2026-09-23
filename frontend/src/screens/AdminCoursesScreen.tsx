import { useState } from 'react';
import { ActivityIndicator, FlatList, View } from 'react-native';
import { api } from '../api/client';
import { cacheKeys } from '../api/cacheKeys';
import { ApiError } from '../api/errors';
import { useAdminAuth } from '../auth/AdminAuthContext';
import { useCachedQuery } from '../hooks/useCachedQuery';
import { AdminNoScopeNotice, AdminScopeBar } from '../components/AdminScopeBar';
import { Badge } from '../components/ui/Badge';
import { Banner } from '../components/ui/Banner';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { TextField } from '../components/ui/Input';
import { ModalSheet } from '../components/ui/ModalSheet';
import { Text } from '../components/ui/Text';
import { theme } from '../theme';
import { confirmAsync } from '../utils/confirm';
import type { AdminCourse } from '../api/types';

/**
 * The university's course catalogue.
 *
 * Deleting is only offered when nothing references a course — subjects link
 * to courses with a restrict constraint, so a used course genuinely cannot be
 * removed. Archiving is the answer for everything else: it hides the course
 * from students without touching anyone's existing data.
 */
export function AdminCoursesScreen() {
  const { scopedUniversityId: universityId } = useAdminAuth();
  const [editing, setEditing] = useState<AdminCourse | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data, loading, refetch } = useCachedQuery<AdminCourse[]>(
    cacheKeys.adminCourses(universityId ?? 'none'),
    () => api.admin.listCourses(universityId),
    { enabled: !!universityId },
  );

  async function remove(course: AdminCourse) {
    const ok = await confirmAsync(
      'Usunąć przedmiot?',
      `«${course.name}» zostanie trwale usunięty. Tej operacji nie można cofnąć.`,
    );
    if (!ok) return;

    setError(null);
    try {
      await api.admin.deleteCourse(course.id, universityId);
      refetch();
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 409
          ? `«${course.name}» jest w użyciu i nie może zostać usunięty. Zarchiwizuj go zamiast tego.`
          : 'Nie udało się usunąć przedmiotu.',
      );
    }
  }

  async function toggleArchive(course: AdminCourse) {
    setError(null);
    try {
      await api.admin.updateCourse(course.id, { isArchived: !course.isArchived }, universityId);
      refetch();
    } catch {
      setError('Nie udało się zmienić statusu przedmiotu.');
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.surface.app }}>
      <AdminScopeBar />

      {error ? (
        <View style={{ paddingHorizontal: theme.spacing[4] }}>
          <Banner message={error} variant="danger" />
        </View>
      ) : null}

      {!universityId ? (
        <AdminNoScopeNotice />
      ) : loading && !data ? (
        <ActivityIndicator style={{ marginTop: theme.spacing[8] }} />
      ) : (
        <FlatList
          data={data ?? []}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ padding: theme.spacing[4], gap: theme.spacing[3] }}
          ListHeaderComponent={
            <Button title="Dodaj przedmiot" size="sm" onPress={() => setCreating(true)} />
          }
          ListEmptyComponent={
            <Text.Body style={{ color: theme.colors.text.tertiary, textAlign: 'center', marginTop: theme.spacing[6] }}>
              Brak przedmiotów w katalogu tej uczelni.
            </Text.Body>
          }
          renderItem={({ item }) => (
            <Card style={{ gap: theme.spacing[2], opacity: item.isArchived ? 0.6 : 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing[2] }}>
                <Text.BodyLg style={{ flex: 1, fontFamily: theme.font.family.sansSemibold }}>
                  {item.code ? `${item.code} · ${item.name}` : item.name}
                </Text.BodyLg>
                {item.isArchived ? <Badge label="Zarchiwizowany" variant="neutral" /> : null}
              </View>

              <Text.BodySm style={{ color: theme.colors.text.secondary }}>
                {item.subjectCount} przedmiotów studentów · {item.sharedLessonCount} udostępnionych lekcji
              </Text.BodySm>

              <View style={{ flexDirection: 'row', gap: theme.spacing[2], flexWrap: 'wrap' }}>
                <Button title="Edytuj" size="sm" variant="ghost" onPress={() => setEditing(item)} />
                <Button
                  title={item.isArchived ? 'Przywróć' : 'Archiwizuj'}
                  size="sm"
                  variant="ghost"
                  onPress={() => toggleArchive(item)}
                />
                {item.subjectCount === 0 ? (
                  <Button title="Usuń" size="sm" variant="danger" onPress={() => remove(item)} />
                ) : null}
              </View>
            </Card>
          )}
        />
      )}

      <CourseModal
        course={editing}
        creating={creating}
        universityId={universityId}
        onClose={() => {
          setEditing(null);
          setCreating(false);
        }}
        onSaved={() => {
          setEditing(null);
          setCreating(false);
          refetch();
        }}
      />
    </View>
  );
}

function CourseModal({
  course,
  creating,
  universityId,
  onClose,
  onSaved,
}: {
  course: AdminCourse | null;
  creating: boolean;
  universityId: string | undefined;
  onClose: () => void;
  onSaved: () => void;
}) {
  const visible = creating || !!course;
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [initialisedFor, setInitialisedFor] = useState<string | null>(null);

  // Seed the fields from the course being edited, once per open.
  const identity = creating ? 'new' : course?.id ?? null;
  if (visible && identity !== initialisedFor) {
    setInitialisedFor(identity);
    setName(course?.name ?? '');
    setCode(course?.code ?? '');
    setError(null);
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      if (creating) {
        await api.admin.createCourse({ name: name.trim(), code: code.trim() || undefined }, universityId);
      } else if (course) {
        await api.admin.updateCourse(course.id, { name: name.trim(), code: code.trim() }, universityId);
      }
      onSaved();
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 409
          ? 'Przedmiot o tej nazwie już istnieje na tej uczelni.'
          : 'Nie udało się zapisać przedmiotu.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalSheet
      visible={visible}
      title={creating ? 'Nowy przedmiot' : 'Edytuj przedmiot'}
      onClose={() => {
        setInitialisedFor(null);
        onClose();
      }}
    >
      <View style={{ gap: theme.spacing[3] }}>
        {error ? <Banner message={error} variant="danger" /> : null}
        <TextField label="Nazwa" value={name} onChangeText={setName} placeholder="np. Bazy danych" />
        <TextField
          label="Kod (opcjonalnie)"
          value={code}
          onChangeText={setCode}
          autoCapitalize="characters"
          placeholder="np. BDA"
        />
        <Button title="Zapisz" fullWidth loading={busy} disabled={!name.trim()} onPress={submit} />
      </View>
    </ModalSheet>
  );
}
