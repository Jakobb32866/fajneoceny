import type { NavigationContainerRefWithCurrent } from '@react-navigation/native';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BookOpen, CircleUserRound, House, type LucideIcon } from 'lucide-react-native';
import { theme } from '../theme';
import { Text } from './ui/Text';
import type { RootStackParamList } from '../navigation/types';

type RouteKey = keyof RootStackParamList;

interface NavItem {
  key: 'Dashboard' | 'Subjects' | 'Settings';
  label: string;
  icon: LucideIcon;
}

const ITEMS: NavItem[] = [
  { key: 'Dashboard', label: 'Podgląd', icon: House },
  { key: 'Subjects', label: 'Przedmioty', icon: BookOpen },
  // Routes to Settings for now; will point at a Profile screen once it exists.
  { key: 'Settings', label: 'Profil', icon: CircleUserRound },
];

// Maps every route to the nav item that should light up while it's open, so a
// detail screen (Subject, Lesson…) keeps its section highlighted.
const ACTIVE_GROUP: Partial<Record<RouteKey, NavItem['key']>> = {
  Dashboard: 'Dashboard',
  DailyFlashcards: 'Dashboard',
  Subjects: 'Subjects',
  Subject: 'Subjects',
  Lesson: 'Subjects',
  DeckEditor: 'Subjects',
  QuizPlayer: 'Subjects',
  Settings: 'Settings',
};

/**
 * Persistent primary navigation, shown on every authenticated screen: a bottom
 * bar on mobile (icons only) and a top bar on desktop/tablet (icon + label).
 * Lives outside the stack, so it navigates through the container ref.
 */
export function AppNav({
  navRef,
  routeName,
  variant,
}: {
  navRef: NavigationContainerRefWithCurrent<RootStackParamList>;
  routeName: string | undefined;
  variant: 'top' | 'bottom';
}) {
  const insets = useSafeAreaInsets();
  const isTop = variant === 'top';
  const activeKey = routeName ? ACTIVE_GROUP[routeName as RouteKey] : undefined;

  return (
    <View
      style={[
        isTop ? styles.topBar : styles.bottomBar,
        !isTop && { paddingBottom: Math.max(insets.bottom, theme.spacing[2]) },
      ]}
    >
      <View style={isTop ? styles.topInner : styles.bottomInner}>
        {ITEMS.map((item) => {
          const active = activeKey === item.key;
          const color = active ? theme.colors.accent.active : theme.colors.text.secondary;
          return (
            <Pressable
              key={item.key}
              onPress={() => navRef.navigate(item.key)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={item.label}
              style={[styles.item, isTop && styles.itemTop, isTop && active && styles.itemTopActive]}
            >
              <item.icon size={isTop ? 20 : 24} color={color} strokeWidth={active ? 2.4 : 2} />
              {isTop ? (
                <Text.BodySm style={{ color, fontFamily: theme.font.family.sansSemibold }}>
                  {item.label}
                </Text.BodySm>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: {
    backgroundColor: theme.colors.surface.card,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border.default,
    paddingHorizontal: theme.spacing[4],
  },
  topInner: {
    width: '100%',
    maxWidth: 1040,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[2],
    paddingVertical: theme.spacing[2],
  },
  bottomBar: {
    backgroundColor: theme.colors.surface.card,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border.default,
    paddingTop: theme.spacing[2],
  },
  bottomInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  item: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemTop: {
    flexDirection: 'row',
    gap: theme.spacing[2],
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.radius.md,
  },
  itemTopActive: {
    backgroundColor: theme.colors.accent.soft,
  },
});
