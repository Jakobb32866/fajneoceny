import { ScrollView, View } from 'react-native';
import { api } from '../api/client';
import { cacheKeys } from '../api/cacheKeys';
import { useAdminAuth } from '../auth/AdminAuthContext';
import { useCachedQuery } from '../hooks/useCachedQuery';
import { Card } from '../components/ui/Card';
import { Text } from '../components/ui/Text';
import { theme } from '../theme';
import type { AdminStats } from '../api/types';

/**
 * Admin landing screen. For a super admin it also carries the server-wide
 * usage stats; a normal admin sees just their scope.
 */
export function AdminHomeScreen() {
  const { admin, isSuperAdmin } = useAdminAuth();

  const { data: stats } = useCachedQuery<AdminStats>(
    cacheKeys.adminStats,
    () => api.admin.stats(),
    { enabled: isSuperAdmin, staleMs: 60_000 },
  );

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.surface.app }}
      contentContainerStyle={{ padding: theme.spacing[4], gap: theme.spacing[4] }}
    >
      <View style={{ gap: theme.spacing[1] }}>
        <Text.HeadlineMd>Cześć, {admin?.displayName}</Text.HeadlineMd>
        <Text.BodySm style={{ color: theme.colors.text.secondary }}>
          {isSuperAdmin ? 'Super administrator — cały serwer' : admin?.universityName ?? 'Brak przypisanej uczelni'}
        </Text.BodySm>
      </View>

      {isSuperAdmin ? (
        <View style={{ gap: theme.spacing[3] }}>
          <Text.Title>Statystyki</Text.Title>

          <Text.Caption style={{ color: theme.colors.text.tertiary }}>
            Liczniki udostępnień i logowań zbierane są od wdrożenia tej funkcji — wcześniejszych danych nie da się
            odtworzyć. Lekcja udostępniona i ponownie ukryta tego samego dnia liczy się raz.
          </Text.Caption>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing[3] }}>
            <StatTile label="Lekcje utworzone dziś" value={stats?.lessonsCreatedToday} />
            <StatTile label="Lekcje utworzone (7 dni)" value={stats?.lessonsCreatedLast7Days} />
            <StatTile label="Lekcje udostępnione dziś" value={stats?.lessonsSharedToday} />
            <StatTile label="Lekcje udostępnione (7 dni)" value={stats?.lessonsSharedLast7Days} />
            <StatTile label="Wszyscy użytkownicy" value={stats?.totalUsers} />
            <StatTile label="Aktywni dziś" value={stats?.activeUsersToday} />
            <StatTile label="Aktywni (7 dni)" value={stats?.activeUsersLast7Days} />
          </View>
        </View>
      ) : null}
    </ScrollView>
  );
}

function StatTile({ label, value }: { label: string; value: number | undefined }) {
  return (
    <Card style={{ minWidth: 150, flexGrow: 1, gap: theme.spacing[1] }}>
      <Text.HeadlineMd>{value ?? '—'}</Text.HeadlineMd>
      <Text.Caption style={{ color: theme.colors.text.secondary }}>{label}</Text.Caption>
    </Card>
  );
}
