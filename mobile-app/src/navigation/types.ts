import type { Difficulty, FlashcardDto } from '../api/types';

export type RootStackParamList = {
  Dashboard: undefined;
  Subject: { subjectId: string; subjectName: string };
  Lesson: { lessonId: string; lessonTitle: string };
  QuizPlayer: { title: string; cards: FlashcardDto[] };
  DeckEditor: { deckId: string; lessonId: string };
  DailyFlashcards: undefined;
  Settings: undefined;
};

export type QuizConfig = { count: number; difficulty: Difficulty };
