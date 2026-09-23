import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useAdminAuth } from '../auth/AdminAuthContext';
import { AdminHomeScreen } from '../screens/AdminHomeScreen';
import { AdminProposalsScreen } from '../screens/AdminProposalsScreen';
import { AdminCoursesScreen } from '../screens/AdminCoursesScreen';
import { AdminLessonsScreen } from '../screens/AdminLessonsScreen';
import { AdminUsersScreen } from '../screens/AdminUsersScreen';
import { AdminUniversitiesScreen } from '../screens/AdminUniversitiesScreen';
import { AdminAdminsScreen } from '../screens/AdminAdminsScreen';
import { Button } from './ui/Button';
import { Chip } from './ui/Chip';
import { Text } from './ui/Text';
import { theme } from '../theme';

type AdminTab = 'home' | 'proposals' | 'courses' | 'lessons' | 'users' | 'universities' | 'admins';

const BASE_TABS: { value: AdminTab; label: string }[] = [
  { value: 'home', label: 'Start' },
  { value: 'proposals', label: 'Zgłoszenia' },
  { value: 'courses', label: 'Przedmioty' },
  { value: 'lessons', label: 'Lekcje' },
  { value: 'users', label: 'Użytkownicy' },
];

const SUPER_TABS: { value: AdminTab; label: string }[] = [
  { value: 'universities', label: 'Uczelnie' },
  { value: 'admins', label: 'Administratorzy' },
];

/**
 * The admin area's own chrome. A plain tab switcher rather than a stack: an
 * admin moves between queues constantly, and there is nothing to go "back" to.
 */
export function AdminShell() {
  const { admin, isSuperAdmin, signOut } = useAdminAuth();
  const [tab, setTab] = useState<AdminTab>('home');

  const tabs = isSuperAdmin ? [...BASE_TABS, ...SUPER_TABS] : BASE_TABS;

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.surface.app }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing[3],
          paddingHorizontal: theme.spacing[4],
          paddingTop: theme.spacing[3],
        }}
      >
        <Text.Title style={{ flex: 1 }}>Panel administratora</Text.Title>
        <Text.Caption style={{ color: theme.colors.text.secondary }}>{admin?.email}</Text.Caption>
        <Button title="Wyloguj" size="sm" variant="ghost" onPress={signOut} />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0 }}
        contentContainerStyle={{
          alignItems: 'center',
          paddingHorizontal: theme.spacing[4],
          paddingVertical: theme.spacing[3],
          gap: theme.spacing[2],
        }}
      >
        {tabs.map((t) => (
          <Chip key={t.value} label={t.label} selected={tab === t.value} onPress={() => setTab(t.value)} />
        ))}
      </ScrollView>

      <View style={{ flex: 1 }}>
        {tab === 'home' && <AdminHomeScreen />}
        {tab === 'proposals' && <AdminProposalsScreen />}
        {tab === 'courses' && <AdminCoursesScreen />}
        {tab === 'lessons' && <AdminLessonsScreen />}
        {tab === 'users' && <AdminUsersScreen />}
        {tab === 'universities' && <AdminUniversitiesScreen />}
        {tab === 'admins' && <AdminAdminsScreen />}
      </View>
    </View>
  );
}
