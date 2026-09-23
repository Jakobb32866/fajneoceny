import { ScrollView, View } from 'react-native';
import { useAdminAuth } from '../auth/AdminAuthContext';
import { useCachedQuery } from '../hooks/useCachedQuery';
import { api } from '../api/client';
import { cacheKeys } from '../api/cacheKeys';
import { Chip } from './ui/Chip';
import { Text } from './ui/Text';
import { theme } from '../theme';
import type { AdminUniversity } from '../api/types';

/**
 * Shows which university the admin is acting on.
 *
 * A normal admin has exactly one and cannot change it, so this is just a
 * label. A super admin works across all of them and must pick one before any
 * university-scoped screen can load — the backend refuses a scoped request
 * that names no university rather than silently acting server-wide.
 */
export function AdminScopeBar() {
  const { admin, isSuperAdmin, scopedUniversityId, selectUniversity } = useAdminAuth();

  const { data: universities } = useCachedQuery<AdminUniversity[]>(
    cacheKeys.adminUniversities,
    () => api.admin.listUniversities(),
    { enabled: isSuperAdmin },
  );

  if (!isSuperAdmin) {
    return (
      <View style={{ paddingHorizontal: theme.spacing[4], paddingVertical: theme.spacing[2] }}>
        <Text.BodySm style={{ color: theme.colors.text.secondary }}>
          {admin?.universityName ?? 'Brak przypisanej uczelni — skontaktuj się z super administratorem.'}
        </Text.BodySm>
      </View>
    );
  }

  return (
    <View style={{ paddingVertical: theme.spacing[2], gap: theme.spacing[2] }}>
      <Text.Caption style={{ color: theme.colors.text.secondary, paddingHorizontal: theme.spacing[4] }}>
        Uczelnia
      </Text.Caption>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0 }}
        contentContainerStyle={{ alignItems: 'center', paddingHorizontal: theme.spacing[4], gap: theme.spacing[2] }}
      >
        {(universities ?? []).map((u) => (
          <Chip
            key={u.id}
            label={u.shortName ?? u.name}
            selected={u.id === scopedUniversityId}
            onPress={() => selectUniversity(u.id === scopedUniversityId ? undefined : u.id)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

/** Placeholder shown by scoped screens when a super admin hasn't picked a university yet. */
export function AdminNoScopeNotice() {
  return (
    <View style={{ padding: theme.spacing[6], alignItems: 'center' }}>
      <Text.Body style={{ color: theme.colors.text.tertiary, textAlign: 'center' }}>
        Wybierz uczelnię powyżej, aby zobaczyć jej dane.
      </Text.Body>
    </View>
  );
}
