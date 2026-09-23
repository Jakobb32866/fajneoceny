import { useState } from 'react';
import { ActivityIndicator, FlatList, View } from 'react-native';
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
import type { AdminCourse, AdminProposal, CourseProposalStatus } from '../api/types';

const STATUS_TABS: { value: CourseProposalStatus; label: string }[] = [
  { value: 'Pending', label: 'Oczekujące' },
  { value: 'Approved', label: 'Zatwierdzone' },
  { value: 'Rejected', label: 'Odrzucone' },
];

/**
 * The course-proposal queue: students propose a course, an admin turns it
 * into a real catalogue entry or rejects it.
 *
 * Approving offers the university's existing courses first, because linking
 * to one is what stops near-duplicates ("Bazy danych" / "Bazy Danych") from
 * splitting a community feed in two.
 */
export function AdminProposalsScreen() {
  const { scopedUniversityId } = useAdminAuth();
  const [status, setStatus] = useState<CourseProposalStatus>('Pending');
  const [reviewing, setReviewing] = useState<AdminProposal | null>(null);

  const universityId = scopedUniversityId;
  const key = cacheKeys.adminProposals(universityId ?? 'none', status);

  const { data, loading, refetch } = useCachedQuery<AdminProposal[]>(
    key,
    () => api.admin.listProposals({ universityId, status }),
    { enabled: !!universityId },
  );

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.surface.app }}>
      <AdminScopeBar />

      <View style={{ flexDirection: 'row', gap: theme.spacing[2], paddingHorizontal: theme.spacing[4] }}>
        {STATUS_TABS.map((tab) => (
          <Chip
            key={tab.value}
            label={tab.label}
            selected={status === tab.value}
            onPress={() => setStatus(tab.value)}
          />
        ))}
      </View>

      {!universityId ? (
        <AdminNoScopeNotice />
      ) : loading && !data ? (
        <ActivityIndicator style={{ marginTop: theme.spacing[8] }} />
      ) : (
        <FlatList
          data={data ?? []}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ padding: theme.spacing[4], gap: theme.spacing[3] }}
          ListEmptyComponent={
            <Text.Body style={{ color: theme.colors.text.tertiary, textAlign: 'center', marginTop: theme.spacing[6] }}>
              {status === 'Pending' ? 'Brak zgłoszeń do rozpatrzenia.' : 'Brak zgłoszeń w tej kategorii.'}
            </Text.Body>
          }
          renderItem={({ item }) => (
            <Card style={{ gap: theme.spacing[2] }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing[2] }}>
                <Text.BodyLg style={{ flex: 1, fontFamily: theme.font.family.sansSemibold }}>{item.name}</Text.BodyLg>
                {item.status !== 'Pending' ? (
                  <Badge
                    label={item.status === 'Approved' ? 'Zatwierdzone' : 'Odrzucone'}
                    variant={item.status === 'Approved' ? 'success' : 'danger'}
                  />
                ) : null}
              </View>

              <Text.BodySm style={{ color: theme.colors.text.secondary }}>
                {item.proposerName} · {item.proposerEmail}
              </Text.BodySm>

              {item.reviewReason ? (
                <Text.BodySm style={{ color: theme.colors.text.tertiary }}>Powód: {item.reviewReason}</Text.BodySm>
              ) : null}

              {item.status === 'Pending' ? (
                <Button title="Rozpatrz" size="sm" onPress={() => setReviewing(item)} />
              ) : null}
            </Card>
          )}
        />
      )}

      <ReviewProposalModal
        proposal={reviewing}
        universityId={universityId}
        onClose={() => setReviewing(null)}
        onDone={() => {
          setReviewing(null);
          invalidate(`admin/scope/${universityId}`);
          refetch();
        }}
      />
    </View>
  );
}

function ReviewProposalModal({
  proposal,
  universityId,
  onClose,
  onDone,
}: {
  proposal: AdminProposal | null;
  universityId: string | undefined;
  onClose: () => void;
  onDone: () => void;
}) {
  const [mode, setMode] = useState<'approve' | 'reject'>('approve');
  const [linkedCourseId, setLinkedCourseId] = useState<string | null>(null);
  const [newCourseCode, setNewCourseCode] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: courses } = useCachedQuery<AdminCourse[]>(
    cacheKeys.adminCourses(universityId ?? 'none'),
    () => api.admin.listCourses(universityId),
    { enabled: !!universityId && !!proposal },
  );

  if (!proposal) return null;

  async function submit() {
    if (!proposal) return;
    setBusy(true);
    setError(null);
    try {
      if (mode === 'approve') {
        await api.admin.approveProposal(
          proposal.id,
          linkedCourseId
            ? { courseId: linkedCourseId }
            : { newCourseName: proposal.name, newCourseCode: newCourseCode.trim() || undefined },
          universityId,
        );
      } else {
        await api.admin.rejectProposal(proposal.id, reason.trim() || undefined, universityId);
      }
      reset();
      onDone();
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 409
          ? 'Przedmiot o tej nazwie już istnieje — wybierz go z listy poniżej.'
          : 'Nie udało się zapisać decyzji.',
      );
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setMode('approve');
    setLinkedCourseId(null);
    setNewCourseCode('');
    setReason('');
    setError(null);
  }

  return (
    <ModalSheet
      visible={!!proposal}
      title={proposal.name}
      onClose={() => {
        reset();
        onClose();
      }}
    >
      <View style={{ gap: theme.spacing[4] }}>
        {error ? <Banner message={error} variant="danger" /> : null}

        <View style={{ flexDirection: 'row', gap: theme.spacing[2] }}>
          <Chip label="Zatwierdź" selected={mode === 'approve'} onPress={() => setMode('approve')} />
          <Chip label="Odrzuć" selected={mode === 'reject'} onPress={() => setMode('reject')} />
        </View>

        {mode === 'approve' ? (
          <View style={{ gap: theme.spacing[3] }}>
            <Text.BodySm style={{ color: theme.colors.text.secondary }}>
              Podłącz do istniejącego przedmiotu, jeśli to ten sam — dzięki temu notatki nie rozdzielą się na dwa
              osobne strumienie.
            </Text.BodySm>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing[2] }}>
              <Chip
                label="Utwórz nowy"
                selected={linkedCourseId === null}
                onPress={() => setLinkedCourseId(null)}
              />
              {(courses ?? [])
                .filter((c) => !c.isArchived)
                .map((c) => (
                  <Chip
                    key={c.id}
                    label={c.code ? `${c.code} · ${c.name}` : c.name}
                    selected={linkedCourseId === c.id}
                    onPress={() => setLinkedCourseId(c.id)}
                  />
                ))}
            </View>

            {linkedCourseId === null ? (
              <TextField
                label="Kod przedmiotu (opcjonalnie)"
                value={newCourseCode}
                onChangeText={setNewCourseCode}
                autoCapitalize="characters"
                placeholder="np. BSI"
              />
            ) : null}
          </View>
        ) : (
          <TextField
            label="Powód odrzucenia (opcjonalnie)"
            value={reason}
            onChangeText={setReason}
            multiline
            placeholder="np. taki przedmiot nie istnieje na tej uczelni"
          />
        )}

        <Button
          title={mode === 'approve' ? 'Zatwierdź zgłoszenie' : 'Odrzuć zgłoszenie'}
          variant={mode === 'approve' ? 'primary' : 'danger'}
          fullWidth
          loading={busy}
          onPress={submit}
        />
      </View>
    </ModalSheet>
  );
}
