import { FilePen, FileText, Headphones, Repeat, type LucideIcon } from 'lucide-react-native';
import { View } from 'react-native';
import { theme } from '../theme';
import { Text } from './ui/Text';

/**
 * The "Trzy kroki. Zero zarwanych nocy." section from the marketing landing
 * page (landing/index.html #jak-to-dziala), condensed to a vertical list of
 * icon + title rows — no descriptions. Shown beside the login form on wide
 * screens and below it on mobile.
 */

type Feature = { icon: LucideIcon; title: string };

const FEATURES: Feature[] = [
  { icon: FilePen, title: 'Twórz i porządkuj notatki' },
  { icon: Repeat, title: 'Powtarzasz tylko to, co zaraz zapomnisz' },
  { icon: Headphones, title: 'Ucz się jak chcesz — audio albo klasycznie' },
  { icon: FileText, title: 'Zawsze wiesz, na czym stoisz' },
];

function FeatureRow({ icon: Icon, title }: Feature) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing[4] }}>
      <View
        style={{
          width: 48,
          height: 48,
          borderRadius: theme.radius.md,
          backgroundColor: theme.colors.surface.accentSoft,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon size={24} color={theme.colors.accent.active} strokeWidth={2} />
      </View>
      <Text.Title style={{ flex: 1, fontFamily: theme.font.family.sansMedium }}>{title}</Text.Title>
    </View>
  );
}

export function LoginFeatures() {
  return (
    <View style={{ gap: theme.spacing[6] }}>
      <View style={{ gap: theme.spacing[2] }}>
        {/* Eyebrow: Manrope semibold + wide tracking + uppercase, matching
            landing .eyebrow (font-sans, not mono). */}
        <Text.Caption
          style={{
            fontFamily: theme.font.family.sansSemibold,
            color: theme.colors.text.accent,
            letterSpacing: theme.font.tracking.wide,
            textTransform: 'uppercase',
          }}
        >
          Jak to działa
        </Text.Caption>
        <Text.HeadlineMd>Cztery kroki. Zero zarwanych nocy.</Text.HeadlineMd>
      </View>

      <View style={{ gap: theme.spacing[5] }}>
        {FEATURES.map((feature) => (
          <FeatureRow key={feature.title} {...feature} />
        ))}
      </View>
    </View>
  );
}
