import type { Difficulty, FlashcardDto } from '../api/types';

export type RootStackParamList = {
  Dashboard: undefined;
  Subjects: undefined;
  Subject: { subjectId: string; subjectName: string };
  Lesson: { lessonId: string; lessonTitle: string };
  QuizPlayer: { title: string; cards: FlashcardDto[] };
  DeckEditor: { deckId: string; lessonId: string };
  DailyFlashcards: undefined;
  Settings: undefined;
  CommunityLesson: { lessonId: string; title: string };
};

export type QuizConfig = { count: number; difficulty: Difficulty };
