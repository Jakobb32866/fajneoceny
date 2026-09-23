export type GradeCategory = 'Project' | 'Exam' | 'Homework' | 'Other';
export type Difficulty = 'Easy' | 'Medium' | 'Hard';

export interface UniversityDto {
  id: string;
  name: string;
  shortName: string | null;
}

export interface UniversityCourseDto {
  id: string;
  code: string | null;
  name: string;
}

export type CourseProposalStatus = 'Pending' | 'Approved' | 'Rejected';

export interface SubjectSummary {
  id: string;
  name: string;
  description: string | null;
  lessonCount: number;
  currentEstimatePercent: number | null;
  /** ISO timestamp; may be absent until the backend is rebuilt with this field. */
  createdAt?: string;
  universityCourseId: string | null;
  courseName: string | null;
  courseCode: string | null;
  proposalStatus: CourseProposalStatus | null;
}

export interface Subject {
  id: string;
  name: string;
  description: string | null;
  lessons: LessonSummary[];
  universityCourseId: string | null;
  courseName: string | null;
  courseCode: string | null;
  proposalStatus: CourseProposalStatus | null;
}

export interface LessonSummary {
  id: string;
  title: string;
  order: number;
  flashcardCount: number;
  /** ISO timestamp; may be absent until the backend is rebuilt with this field. */
  createdAt?: string;
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

export interface ForkedFromDto {
  lessonId: string;
  authorName: string;
  originalStillShared: boolean;
  hasNewerVersion: boolean;
}

export interface LessonDetail {
  id: string;
  title: string;
  order: number;
  noteContent: string | null;
  decks: DeckDto[];
  isShared: boolean;
  canShare: boolean;
  likeCount: number;
  forkedFrom: ForkedFromDto | null;
  /** Set when a moderator took this lesson down; the author cannot re-share it. */
  moderationLockReason: string | null;
  /** Set while the author is banned from sharing anything at all. */
  shareBlockedUntil: string | null;
  shareBlockReason: string | null;
}

export type CommunitySort = 'likes' | 'published' | 'updated';

export interface CommunityLessonListItem {
  id: string;
  title: string;
  authorName: string;
  likeCount: number;
  likedByMe: boolean;
  isMine: boolean;
  deckCount: number;
  cardCount: number;
  sharedAt: string;
  contentUpdatedAt: string;
}

export interface CommunityLessonPage {
  items: CommunityLessonListItem[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

export interface CommunityLessonDetail {
  id: string;
  title: string;
  noteContent: string | null;
  decks: DeckDto[];
  authorName: string;
  likeCount: number;
  likedByMe: boolean;
  isMine: boolean;
  sharedAt: string;
  contentUpdatedAt: string;
  courseId: string;
}

export interface LikeResult {
  likeCount: number;
  likedByMe: boolean;
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
  universityId: string | null;
  universityName: string | null;
  isRecognised: boolean;
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
}

export interface ForkResult extends LessonSummary {
  subjectId: string;
}

// ---------------------------------------------------------------------------
// Admin
//
// Admins are a separate account type from students: their own credentials,
// their own token, and no student data of their own. Everything below is
// reachable only with an admin token.
// ---------------------------------------------------------------------------

export type AdminRole = 'Admin' | 'SuperAdmin';

export interface AdminAccount {
  id: string;
  email: string;
  displayName: string;
  role: AdminRole;
  universityId: string | null;
  universityName: string | null;
  isDisabled: boolean;
}

export interface AdminLoginResponse {
  token: string;
  admin: AdminAccount;
}

export interface AdminProposal {
  id: string;
  name: string;
  status: CourseProposalStatus;
  proposerName: string;
  proposerEmail: string;
  createdAt: string;
  reviewedAt: string | null;
  reviewReason: string | null;
}

export interface AdminCourse {
  id: string;
  code: string | null;
  name: string;
  isArchived: boolean;
  subjectCount: number;
  sharedLessonCount: number;
}

export interface AdminLessonListItem {
  id: string;
  title: string;
  authorId: string;
  authorName: string;
  courseId: string;
  courseName: string;
  likeCount: number;
  deckCount: number;
  cardCount: number;
  sharedAt: string;
  contentUpdatedAt: string;
}

export interface AdminLessonPage {
  items: AdminLessonListItem[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

export interface AdminLessonDetail {
  id: string;
  title: string;
  noteContent: string | null;
  decks: DeckDto[];
  authorId: string;
  authorName: string;
  authorEmail: string;
  courseId: string;
  courseName: string;
  likeCount: number;
  sharedAt: string;
  contentUpdatedAt: string;
}

/** Metadata only — a taken-down lesson's content is not readable by admins. */
export interface AdminModeratedLesson {
  id: string;
  title: string;
  authorName: string;
  moderationLockedAt: string;
  moderationLockReason: string | null;
}

export interface AdminUserListItem {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  sharedLessonCount: number;
  lastLoginAt: string | null;
  createdAt: string;
  shareBlockedUntil: string | null;
}

export interface AdminUserPage {
  items: AdminUserListItem[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

export interface AdminUserDetail {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  createdAt: string;
  lastLoginAt: string | null;
  shareBlockedUntil: string | null;
  shareBlockReason: string | null;
  sharedLessons: AdminLessonListItem[];
}

export interface ShareBan {
  id: string;
  reason: string;
  hours: number;
  startsAt: string;
  expiresAt: string;
  liftedAt: string | null;
  isActive: boolean;
}

export interface AdminUniversity {
  id: string;
  name: string;
  shortName: string | null;
  isArchived: boolean;
  courseCount: number;
  userCount: number;
}

export interface AdminStats {
  lessonsCreatedToday: number;
  lessonsCreatedLast7Days: number;
  lessonsSharedToday: number;
  lessonsSharedLast7Days: number;
  totalUsers: number;
  activeUsersToday: number;
  activeUsersLast7Days: number;
}
