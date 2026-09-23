import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, View } from 'react-native';
import { api } from '../api/client';
import { cacheKeys } from '../api/cacheKeys';
import { invalidate } from '../api/cache';
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
import type { AdminUserDetail, AdminUserListItem, AdminUserPage, ShareBan } from '../api/types';

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * Students of the university, with what they have published and their share
 * bans. Only SHARED lessons are ever listed — an admin has no view of
 * anyone's private notes.
 */
export function AdminUsersScreen() {
  const { scopedUniversityId: universityId } = useAdminAuth();

  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<AdminUserListItem | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setQuery(q), 400);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    setPage(1);
  }, [query, universityId]);

  const scope = universityId ?? 'none';

  const { data, loading, refetch } = useCachedQuery<AdminUserPage>(
    cacheKeys.adminUsers(scope, query, page),
    () => api.admin.listUsers({ universityId, q: query, page }),
    { enabled: !!universityId },
  );

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.surface.app }}>
      <AdminScopeBar />

      {!universityId ? (
        <AdminNoScopeNotice />
      ) : (
        <>
          <View style={{ paddingHorizontal: theme.spacing[4], paddingBottom: theme.spacing[2] }}>
            <TextField placeholder="Szukaj po nazwisku lub e-mailu…" value={q} onChangeText={setQ} />
          </View>

          {loading && !data ? (
            <ActivityIndicator style={{ marginTop: theme.spacing[8] }} />
          ) : (
            <FlatList
              data={data?.items ?? []}
              keyExtractor={(u) => u.id}
              contentContainerStyle={{ padding: theme.spacing[4], gap: theme.spacing[3] }}
              ListEmptyComponent={
                <Text.Body
                  style={{ color: theme.colors.text.tertiary, textAlign: 'center', marginTop: theme.spacing[6] }}
                >
                  Brak użytkowników.
                </Text.Body>
              }
              renderItem={({ item }) => (
                <Card style={{ gap: theme.spacing[2] }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing[2] }}>
                    <Text.BodyLg style={{ flex: 1, fontFamily: theme.font.family.sansSemibold }}>
                      {item.firstName} {item.lastName}
                    </Text.BodyLg>
                    {item.shareBlockedUntil ? <Badge label="Zablokowany" variant="danger" /> : null}
                  </View>
                  <Text.BodySm style={{ color: theme.colors.text.secondary }}>{item.email}</Text.BodySm>
                  <Text.Caption style={{ color: theme.colors.text.tertiary }}>
                    {item.sharedLessonCount} udostępnionych lekcji · ostatnie logowanie {formatDate(item.lastLoginAt)}
                  </Text.Caption>
                  <Button title="Szczegóły" size="sm" variant="ghost" onPress={() => setSelected(item)} />
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

      <UserDetailModal
        user={selected}
        universityId={universityId}
        onClose={() => setSelected(null)}
        onChanged={() => {
          invalidate(`admin/scope/${scope}`);
          refetch();
        }}
      />
    </View>
  );
}

function UserDetailModal({
  user,
  universityId,
  onClose,
  onChanged,
}: {
  user: AdminUserListItem | null;
  universityId: string | undefined;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [banHours, setBanHours] = useState(24);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scope = universityId ?? 'none';

  const { data: detail, refetch: refetchDetail } = useCachedQuery<AdminUserDetail>(
    cacheKeys.adminUser(scope, user?.id ?? 'none'),
    () => api.admin.getUser(user!.id, universityId),
    { enabled: !!user && !!universityId },
  );

  const { data: bans, refetch: refetchBans } = useCachedQuery<ShareBan[]>(
    cacheKeys.adminUserBans(scope, user?.id ?? 'none'),
    () => api.admin.listShareBans(user!.id, universityId),
    { enabled: !!user && !!universityId },
  );

  if (!user) return null;

  async function issueBan() {
    if (!user) return;
    setBusy(true);
    setError(null);
    try {
      await api.admin.issueShareBan(user.id, { hours: banHours, reason: reason.trim() }, universityId);
      setReason('');
      refetchDetail();
      refetchBans();
      onChanged();
    } catch {
      setError('Nie udało się nałożyć blokady.');
    } finally {
      setBusy(false);
    }
  }

  async function liftBan() {
    if (!user) return;
    setBusy(true);
    setError(null);
    try {
      await api.admin.liftShareBan(user.id, universityId);
      refetchDetail();
      refetchBans();
      onChanged();
    } catch {
      setError('Nie udało się zdjąć blokady.');
    } finally {
      setBusy(false);
    }
  }

  const activeBan = bans?.find((b) => b.isActive);

  return (
    <ModalSheet visible={!!user} title={`${user.firstName} ${user.lastName}`} onClose={onClose}>
      <View style={{ gap: theme.spacing[4] }}>
        {error ? <Banner message={error} variant="danger" /> : null}

        <Text.BodySm style={{ color: theme.colors.text.secondary }}>{user.email}</Text.BodySm>

        {activeBan ? (
          <View style={{ gap: theme.spacing[2] }}>
            <Banner
              message={`Udostępnianie zablokowane do ${formatDate(activeBan.expiresAt)} — ${activeBan.reason}`}
              variant="warning"
            />
            <Button title="Zdejmij blokadę" size="sm" variant="ghost" loading={busy} onPress={liftBan} />
          </View>
        ) : (
          <View style={{ gap: theme.spacing[2] }}>
            <Text.Caption style={{ color: theme.colors.text.secondary }}>Zablokuj udostępnianie na</Text.Caption>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing[2] }}>
              {[24, 72, 168, 720].map((h) => (
                <Chip
                  key={h}
                  label={h >= 168 ? `${h / 24} dni` : `${h} h`}
                  selected={banHours === h}
                  onPress={() => setBanHours(h)}
                />
              ))}
            </View>
            <TextField label="Powód" value={reason} onChangeText={setReason} placeholder="np. spam w Społeczności" />
            <Button
              title="Zablokuj udostępnianie"
              size="sm"
              variant="danger"
              loading={busy}
              disabled={!reason.trim()}
              onPress={issueBan}
            />
          </View>
        )}

        <View style={{ gap: theme.spacing[2] }}>
          <Text.Caption style={{ color: theme.colors.text.secondary }}>
            Udostępnione lekcje ({detail?.sharedLessons.length ?? 0})
          </Text.Caption>
          {(detail?.sharedLessons ?? []).map((l) => (
            <Text.BodySm key={l.id}>
              {l.title} · {l.courseName}
            </Text.BodySm>
          ))}
          {detail && detail.sharedLessons.length === 0 ? (
            <Text.BodySm style={{ color: theme.colors.text.tertiary }}>
              Nic nie udostępnił. Prywatne notatki nie są widoczne dla administratora.
            </Text.BodySm>
          ) : null}
        </View>

        {bans && bans.length > 0 ? (
          <View style={{ gap: theme.spacing[2] }}>
            <Text.Caption style={{ color: theme.colors.text.secondary }}>Historia blokad</Text.Caption>
            {bans.map((b) => (
              <Text.BodySm key={b.id} style={{ color: theme.colors.text.tertiary }}>
                {formatDate(b.startsAt)} · {b.hours} h · {b.reason}
                {b.liftedAt ? ' (zdjęta)' : ''}
              </Text.BodySm>
            ))}
          </View>
        ) : null}
      </View>
    </ModalSheet>
  );
}
