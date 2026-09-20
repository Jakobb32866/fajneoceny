import { useState } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Alert, ActivityIndicator, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Volume2 } from 'lucide-react-native';
import { FlashcardPlayer } from '../components/FlashcardPlayer';
import { Text } from '../components/ui/Text';
import type { RootStackParamList } from '../navigation/types';
import { exportFlashcardsAudio } from '../utils/exportAudio';
import { theme } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'QuizPlayer'>;

const MAX_AUDIO_BATCH = 100;

export function QuizPlayerScreen({ route, navigation }: Props) {
  const { title, cards } = route.params;
  const [exporting, setExporting] = useState(false);

  const onExportAudio = async () => {
    setExporting(true);
    try {
      // The backend caps a single export at 100 cards (one file per batch,
      // never split within a batch) — chunk larger sets accordingly.
      for (let i = 0; i < cards.length; i += MAX_AUDIO_BATCH) {
        const batch = cards.slice(i, i + MAX_AUDIO_BATCH).map((c) => c.id);
        await exportFlashcardsAudio(batch);
      }
    } catch (e) {
      Alert.alert('Nie udało się wyeksportować audio', String(e));
    } finally {
      setExporting(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text.Title>{title}</Text.Title>
        <TouchableOpacity onPress={onExportAudio} disabled={exporting} hitSlop={8}>
          {exporting ? (
            <ActivityIndicator color={theme.colors.text.secondary} />
          ) : (
            <Volume2 size={24} color={theme.colors.text.primary} />
          )}
        </TouchableOpacity>
      </View>

      <FlashcardPlayer cards={cards} cram onFinish={() => navigation.goBack()} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.surface.app },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: theme.spacing[4],
    paddingTop: theme.spacing[2],
  },
});
