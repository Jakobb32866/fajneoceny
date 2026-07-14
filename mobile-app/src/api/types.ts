export type GradeCategory = 'Project' | 'Exam' | 'Homework' | 'Other';
export type Difficulty = 'Easy' | 'Medium' | 'Hard';
export type SourceType = 'Pdf' | 'YoutubeLink' | 'Link';

export interface SubjectSummary {
  id: string;
  name: string;
  description: string | null;
  lessonCount: number;
  currentEstimatePercent: number | null;
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
