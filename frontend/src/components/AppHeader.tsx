import { useState } from 'react';
import { Modal, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronDown, LogOut, Settings } from 'lucide-react-native';
import { theme } from '../theme';
import { Logo } from './ui/Brand';
import { Text } from './ui/Text';

const WIDE_BREAKPOINT = 900;

/**
 * App header: brand lockup on the left, a greeting (wide screens only), and an
 * avatar that opens a dropdown with Ustawienia / Wyloguj. Rendered on the
 * dashboard on mobile, and app-wide in the desktop shell (App.tsx).
 */
export function AppHeader({
  firstName,
  onSettings,
  onSignOut,
}: {
  firstName: string;
  onSettings: () => void;
  onSignOut: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isWide = width >= WIDE_BREAKPOINT;
  const [menuOpen, setMenuOpen] = useState(false);
  const trimmed = firstName.trim();
  const initial = trimmed ? trimmed[0].toUpperCase() : '?';

  return (
    <View style={[styles.header, { paddingTop: insets.top + theme.spacing[2] }]}>
      <Logo size={30} />

      <View style={styles.right}>
        {trimmed && isWide ? (
          <Text.BodySm style={styles.greeting} numberOfLines={1}>
            Dobrze Cię widzieć {trimmed}!
          </Text.BodySm>
        ) : null}

        <Pressable
          onPress={() => setMenuOpen(true)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Menu konta"
          style={styles.avatarButton}
        >
          <View style={styles.avatar}>
            <Text.BodySm style={styles.avatarInitial}>{initial}</Text.BodySm>
          </View>
          <ChevronDown size={16} color={theme.colors.text.secondary} />
        </Pressable>
      </View>

      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <Pressable style={{ flex: 1 }} onPress={() => setMenuOpen(false)}>
          <View style={[styles.menu, { top: insets.top + 56 }]}>
            <MenuItem
              icon={Settings}
              label="Ustawienia"
              onPress={() => {
                setMenuOpen(false);
                onSettings();
              }}
            />
            <View style={styles.menuDivider} />
            <MenuItem
              icon={LogOut}
              label="Wyloguj"
              destructive
              onPress={() => {
                setMenuOpen(false);
                onSignOut();
              }}
            />
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

function MenuItem({
  icon: Icon,
  label,
  onPress,
  destructive = false,
}: {
  icon: typeof Settings;
  label: string;
  onPress: () => void;
  destructive?: boolean;
}) {
  const color = destructive ? theme.colors.status.danger : theme.colors.text.primary;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.menuItem, pressed && { backgroundColor: theme.colors.surface.sunken }]}
    >
      <Icon size={18} color={color} />
      <Text.Body style={{ color }}>{label}</Text.Body>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing[4],
    paddingBottom: theme.spacing[3],
    backgroundColor: theme.colors.surface.card,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border.default,
    gap: theme.spacing[3],
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[2],
    flexShrink: 1,
  },
  greeting: {
    color: theme.colors.text.secondary,
    flexShrink: 1,
  },
  avatarButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.brand.default,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    color: theme.colors.brand.onBrand,
    fontFamily: theme.font.family.sansSemibold,
  },
  menu: {
    position: 'absolute',
    right: theme.spacing[4],
    minWidth: 200,
    backgroundColor: theme.colors.surface.card,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border.default,
    paddingVertical: theme.spacing[1],
    ...theme.shadows.md,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[3],
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[4],
  },
  menuDivider: {
    height: 1,
    backgroundColor: theme.colors.border.default,
    marginVertical: theme.spacing[1],
  },
});
