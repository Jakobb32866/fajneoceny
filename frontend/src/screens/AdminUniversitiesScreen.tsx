import { useState } from 'react';
import { ActivityIndicator, FlatList, View } from 'react-native';
import { api } from '../api/client';
import { cacheKeys } from '../api/cacheKeys';
import { ApiError } from '../api/errors';
import { useCachedQuery } from '../hooks/useCachedQuery';
import { Badge } from '../components/ui/Badge';
import { Banner } from '../components/ui/Banner';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { TextField } from '../components/ui/Input';
import { ModalSheet } from '../components/ui/ModalSheet';
import { Text } from '../components/ui/Text';
import { theme } from '../theme';
import { confirmAsync } from '../utils/confirm';
import type { AdminUniversity } from '../api/types';

/** Super-admin only: the catalogue of schools. */
export function AdminUniversitiesScreen() {
  const [editing, setEditing] = useState<AdminUniversity | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data, loading, refetch } = useCachedQuery<AdminUniversity[]>(
    cacheKeys.adminUniversities,
    () => api.admin.listUniversities(),
  );

  async function remove(university: AdminUniversity) {
    const ok = await confirmAsync(
      'Usunąć uczelnię?',
      `«${university.name}» zostanie trwale usunięta. Tej operacji nie można cofnąć.`,
    );
    if (!ok) return;

    setError(null);
    try {
      await api.admin.deleteUniversity(university.id);
      refetch();
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 409
          ? `«${university.name}» jest w użyciu i nie może zostać usunięta. Zarchiwizuj ją zamiast tego.`
          : 'Nie udało się usunąć uczelni.',
      );
    }
  }

  async function toggleArchive(university: AdminUniversity) {
    setError(null);
    try {
      await api.admin.updateUniversity(university.id, { isArchived: !university.isArchived });
      refetch();
    } catch {
      setError('Nie udało się zmienić statusu uczelni.');
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
          keyExtractor={(u) => u.id}
          contentContainerStyle={{ padding: theme.spacing[4], gap: theme.spacing[3] }}
          ListHeaderComponent={<Button title="Dodaj uczelnię" size="sm" onPress={() => setCreating(true)} />}
          renderItem={({ item }) => (
            <Card style={{ gap: theme.spacing[2], opacity: item.isArchived ? 0.6 : 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing[2] }}>
                <Text.BodyLg style={{ flex: 1, fontFamily: theme.font.family.sansSemibold }}>{item.name}</Text.BodyLg>
                {item.isArchived ? <Badge label="Zarchiwizowana" variant="neutral" /> : null}
              </View>
              <Text.BodySm style={{ color: theme.colors.text.secondary }}>
                {item.courseCount} przedmiotów · {item.userCount} użytkowników
              </Text.BodySm>
              <View style={{ flexDirection: 'row', gap: theme.spacing[2], flexWrap: 'wrap' }}>
                <Button title="Edytuj" size="sm" variant="ghost" onPress={() => setEditing(item)} />
                <Button
                  title={item.isArchived ? 'Przywróć' : 'Archiwizuj'}
                  size="sm"
                  variant="ghost"
                  onPress={() => toggleArchive(item)}
                />
                {item.userCount === 0 && item.courseCount === 0 ? (
                  <Button title="Usuń" size="sm" variant="danger" onPress={() => remove(item)} />
                ) : null}
              </View>
            </Card>
          )}
        />
      )}

      <UniversityModal
        university={editing}
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

function UniversityModal({
  university,
  creating,
  onClose,
  onSaved,
}: {
  university: AdminUniversity | null;
  creating: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const visible = creating || !!university;
  const [name, setName] = useState('');
  const [shortName, setShortName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [initialisedFor, setInitialisedFor] = useState<string | null>(null);

  const identity = creating ? 'new' : university?.id ?? null;
  if (visible && identity !== initialisedFor) {
    setInitialisedFor(identity);
    setName(university?.name ?? '');
    setShortName(university?.shortName ?? '');
    setError(null);
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      if (creating) {
        await api.admin.createUniversity({ name: name.trim(), shortName: shortName.trim() || undefined });
      } else if (university) {
        await api.admin.updateUniversity(university.id, { name: name.trim(), shortName: shortName.trim() });
      }
      onSaved();
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 409
          ? 'Uczelnia o tej nazwie już istnieje.'
          : 'Nie udało się zapisać uczelni.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalSheet
      visible={visible}
      title={creating ? 'Nowa uczelnia' : 'Edytuj uczelnię'}
      onClose={() => {
        setInitialisedFor(null);
        onClose();
      }}
    >
      <View style={{ gap: theme.spacing[3] }}>
        {error ? <Banner message={error} variant="danger" /> : null}
        <TextField label="Nazwa" value={name} onChangeText={setName} />
        <TextField label="Skrót (opcjonalnie)" value={shortName} onChangeText={setShortName} placeholder="np. PJATK" />
        <Button title="Zapisz" fullWidth loading={busy} disabled={!name.trim()} onPress={submit} />
      </View>
    </ModalSheet>
  );
}
