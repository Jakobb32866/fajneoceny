import { useState } from 'react';
import { ActivityIndicator, FlatList, View } from 'react-native';
import { api } from '../api/client';
import { cacheKeys } from '../api/cacheKeys';
import { ApiError } from '../api/errors';
import { useAdminAuth } from '../auth/AdminAuthContext';
import { useCachedQuery } from '../hooks/useCachedQuery';
import { Badge } from '../components/ui/Badge';
import { Banner } from '../components/ui/Banner';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Chip } from '../components/ui/Chip';
import { TextField } from '../components/ui/Input';
import { ModalSheet } from '../components/ui/ModalSheet';
import { Text } from '../components/ui/Text';
import { theme } from '../theme';
import { confirmAsync } from '../utils/confirm';
import type { AdminAccount, AdminUniversity } from '../api/types';

/**
 * Super-admin only: the admin roster.
 *
 * "Removing" an admin disables the account rather than deleting the row —
 * the audit log records who did what by id alone, so destroying the row would
 * erase the trail of everything that admin ever did.
 */
export function AdminAdminsScreen() {
  const { admin: me } = useAdminAuth();
  const [editing, setEditing] = useState<AdminAccount | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data, loading, refetch } = useCachedQuery<AdminAccount[]>(
    cacheKeys.adminAdmins,
    () => api.admin.listAdmins(),
  );

  async function disable(account: AdminAccount) {
    const ok = await confirmAsync(
      'Wyłączyć konto administratora?',
      `${account.email} straci dostęp natychmiast. Historia jego działań zostanie zachowana.`,
      'Wyłącz',
    );
    if (!ok) return;

    setError(null);
    try {
      await api.admin.disableAdmin(account.id);
      refetch();
    } catch {
      setError('Nie udało się wyłączyć konta.');
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.surface.app }}>
      {error ? (
        <View style={{ padding: theme.spacing[4], paddingBottom: 0 }}>
          <Banner message={error} variant="danger" />
        </View>
      ) : null}

      {loading && !data ? (
        <ActivityIndicator style={{ marginTop: theme.spacing[8] }} />
      ) : (
        <FlatList
          data={data ?? []}
          keyExtractor={(a) => a.id}
          contentContainerStyle={{ padding: theme.spacing[4], gap: theme.spacing[3] }}
          ListHeaderComponent={<Button title="Dodaj administratora" size="sm" onPress={() => setCreating(true)} />}
          renderItem={({ item }) => (
            <Card style={{ gap: theme.spacing[2], opacity: item.isDisabled ? 0.6 : 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing[2] }}>
                <Text.BodyLg style={{ flex: 1, fontFamily: theme.font.family.sansSemibold }}>
                  {item.displayName}
                </Text.BodyLg>
                {item.role === 'SuperAdmin' ? <Badge label="Super admin" variant="brand" /> : null}
                {item.isDisabled ? <Badge label="Wyłączony" variant="neutral" /> : null}
              </View>
              <Text.BodySm style={{ color: theme.colors.text.secondary }}>{item.email}</Text.BodySm>
              <Text.Caption style={{ color: theme.colors.text.tertiary }}>
                {item.role === 'SuperAdmin'
                  ? 'Cały serwer'
                  : item.universityName ?? 'Brak przypisanej uczelni'}
              </Text.Caption>

              {item.id !== me?.id ? (
                <View style={{ flexDirection: 'row', gap: theme.spacing[2], flexWrap: 'wrap' }}>
                  <Button title="Edytuj" size="sm" variant="ghost" onPress={() => setEditing(item)} />
                  {!item.isDisabled ? (
                    <Button title="Wyłącz" size="sm" variant="danger" onPress={() => disable(item)} />
                  ) : null}
                </View>
              ) : (
                <Text.Caption style={{ color: theme.colors.text.tertiary }}>To Twoje konto.</Text.Caption>
              )}
            </Card>
          )}
        />
      )}

      <AdminModal
        account={editing}
        creating={creating}
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

function AdminModal({
  account,
  creating,
  onClose,
  onSaved,
}: {
  account: AdminAccount | null;
  creating: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const visible = creating || !!account;
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [universityId, setUniversityId] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [initialisedFor, setInitialisedFor] = useState<string | null>(null);

  const { data: universities } = useCachedQuery<AdminUniversity[]>(
    cacheKeys.adminUniversities,
    () => api.admin.listUniversities(),
    { enabled: visible },
  );

  const identity = creating ? 'new' : account?.id ?? null;
  if (visible && identity !== initialisedFor) {
    setInitialisedFor(identity);
    setEmail(account?.email ?? '');
    setDisplayName(account?.displayName ?? '');
    setPassword('');
    setUniversityId(account?.universityId ?? undefined);
    setError(null);
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      if (creating) {
        await api.admin.createAdmin({
          email: email.trim(),
          displayName: displayName.trim(),
          password,
          universityId,
        });
      } else if (account) {
        await api.admin.updateAdmin(account.id, {
          displayName: displayName.trim(),
          password: password || undefined,
          universityId,
        });
      }
      onSaved();
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 409
          ? 'Administrator o tym adresie już istnieje.'
          : 'Nie udało się zapisać konta.',
      );
    } finally {
      setBusy(false);
    }
  }

  const isSuper = account?.role === 'SuperAdmin';

  return (
    <ModalSheet
      visible={visible}
      title={creating ? 'Nowy administrator' : 'Edytuj administratora'}
      onClose={() => {
        setInitialisedFor(null);
        onClose();
      }}
    >
      <View style={{ gap: theme.spacing[3] }}>
        {error ? <Banner message={error} variant="danger" /> : null}

        {creating ? (
          <TextField
            label="E-mail"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />
        ) : (
          <Text.BodySm style={{ color: theme.colors.text.secondary }}>{email}</Text.BodySm>
        )}

        <TextField label="Nazwa wyświetlana" value={displayName} onChangeText={setDisplayName} />
        <TextField
          label={creating ? 'Hasło' : 'Nowe hasło (zostaw puste, by nie zmieniać)'}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        {isSuper ? (
          <Text.BodySm style={{ color: theme.colors.text.tertiary }}>
            Super administrator działa na całym serwerze i nie jest przypisany do uczelni.
          </Text.BodySm>
        ) : (
          <View style={{ gap: theme.spacing[2] }}>
            <Text.Caption style={{ color: theme.colors.text.secondary }}>Uczelnia</Text.Caption>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing[2] }}>
              {(universities ?? []).map((u) => (
                <Chip
                  key={u.id}
                  label={u.shortName ?? u.name}
                  selected={universityId === u.id}
                  onPress={() => setUniversityId(universityId === u.id ? undefined : u.id)}
                />
              ))}
            </View>
            {!universityId ? (
              <Text.Caption style={{ color: theme.colors.text.tertiary }}>
                Bez przypisanej uczelni administrator nie zobaczy żadnych danych.
              </Text.Caption>
            ) : null}
          </View>
        )}

        <Button
          title="Zapisz"
          fullWidth
          loading={busy}
          disabled={!displayName.trim() || (creating && (!email.trim() || !password))}
          onPress={submit}
        />
      </View>
    </ModalSheet>
  );
}
