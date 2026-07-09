import { useEffect, useState } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { api } from '../api/client';
import { FlashcardPlayer } from '../components/FlashcardPlayer';
import type { RootStackParamList } from '../navigation/types';
import type { FlashcardDto } from '../api/types';

type Props = NativeStackScreenProps<RootStackParamList, 'DailyFlashcards'>;

export function DailyFlashcardsScreen({ navigation }: Props) {
  const [cards, setCards] = useState<FlashcardDto[] | null>(null);

  useEffect(() => {
    api.getDailyFlashcards(30).then(setCards).catch(() => setCards([]));
  }, []);

  if (cards === null) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  if (cards.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyText}>Brak fiszek na dziś — dodaj lekcje i wygeneruj quizy!</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlashcardPlayer cards={cards} onReview={(id, correct) => api.reviewFlashcard(id, correct).catch(() => {})} onFinish={() => navigation.goBack()} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'white' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  emptyText: { textAlign: 'center', color: '#666' },
});
