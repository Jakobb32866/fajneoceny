export type GradeCategory = 'Project' | 'Exam' | 'Homework' | 'Other';
export type Difficulty = 'Easy' | 'Medium' | 'Hard';
export type SourceType = 'Pdf' | 'YoutubeLink' | 'Link';

export interface SubjectSummary {
  id: string;
  name: string;
  description: string | null;
  lessonCount: number;
  currentEstimatePercent: number | null;
  /** ISO timestamp; may be absent until the backend is rebuilt with this field. */
  createdAt?: string;
}

export interface Subject {
  id: string;
  name: string;
  description: string | null;
  lessons: LessonSummary[];
}

export interface LessonSummary {
  id: string;
  title: string;
  order: number;
  flashcardCount: number;
  /** ISO timestamp; may be absent until the backend is rebuilt with this field. */
  createdAt?: string;
}

export interface SourceDto {
  id: string;
  title: string;
  type: SourceType;
  location: string;
}

export interface FlashcardDto {
  id: string;
  question: string;
  answer: string;
  difficulty: Difficulty;
}

// Anki-style four-button grades and scheduling shapes.
export type ReviewGrade = 'again' | 'hard' | 'good' | 'easy';
export type CardPhase = 'New' | 'Learning' | 'Review' | 'Relearning';

// Pre-formatted next-interval labels per grade (e.g. "10 min", "3 dni").
export interface IntervalPreview {
  again: string;
  hard: string;
  good: string;
  easy: string;
}

// A flashcard enriched with the projected intervals for each grade button.
export interface DailyCardDto extends FlashcardDto {
  phase: CardPhase;
  intervals: IntervalPreview;
}

export interface DailyResponse {
  dueCount: number;
  newAvailable: number;
  newLimit: number;
  nextDueAt: string | null;
  cards: DailyCardDto[];
}

export interface DailySummary {
  dueCount: number;
  newAvailable: number;
  newLimit: number;
  dailySessionSize: number;
}

export interface ReviewResult {
  phase: CardPhase;
  due: string;
  intervalDays: number;
  lapses: number;
  intervals: IntervalPreview;
}

// Mirrors the backend SrsSettingsDto (all user-tunable scheduler knobs).
export interface SrsSettings {
  dailySessionSize: number;
  newCardsPerDay: number;
  learningStepsMinutes: string;
  relearningStepsMinutes: string;
  graduatingIntervalDays: number;
  easyIntervalDays: number;
  startingEase: number;
  easyBonus: number;
  hardMultiplier: number;
  lapseNewIntervalMultiplier: number;
  minimumIntervalDays: number;
  maximumIntervalDays: number;
  timezone: string;
  dayRolloverHour: number;
}

export interface DeckDto {
  id: string;
  name: string;
  isAiGenerated: boolean;
  difficulty: Difficulty | null;
  flashcards: FlashcardDto[];
}

export interface LessonDetail {
  id: string;
  title: string;
  order: number;
  noteContent: string | null;
  sources: SourceDto[];
  decks: DeckDto[];
}

export interface DraftGradingComponent {
  name: string;
  category: GradeCategory;
  weightPercent: number;
}

export interface SyllabusUploadResult {
  subjectId: string;
  rawTextPreview: string;
  draftComponents: DraftGradingComponent[];
}

export interface GradeEntryDto {
  id: string;
  name: string;
  score: number;
  maxScore: number;
  date: string;
}

export interface GradingComponentDto {
  id: string;
  name: string;
  category: GradeCategory;
  weightPercent: number;
  isAdHoc: boolean;
  averageScorePercent: number | null;
  entries: GradeEntryDto[];
}

export interface SubjectGradesResponse {
  currentEstimatePercent: number | null;
  provisionalFinalPercent: number;
  totalWeightPercent: number;
  components: GradingComponentDto[];
}

export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  schoolName: string;
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
}
