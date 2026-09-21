import { API_BASE_URL } from './config';
import { ApiError } from './errors';
import { clearToken, getTokenSync } from './token';
import type {
  AuthResponse,
  AuthUser,
  CommunityLessonDetail,
  CommunityLessonPage,
  CommunitySort,
  DailyCardDto,
  DailyResponse,
  DailySummary,
  DeckDto,
  Difficulty,
  FlashcardDto,
  ForkResult,
  GradeCategory,
  GradingComponentDto,
  LessonDetail,
  LessonSummary,
  LikeResult,
  ReviewGrade,
  ReviewResult,
  SrsSettings,
  Subject,
  SubjectGradesResponse,
  SubjectSummary,
  SyllabusUploadResult,
  UniversityCourseDto,
  UniversityDto,
} from './types';

// Registered by AuthContext so a 401 from any request (e.g. an expired token
// mid-session) can immediately drop the app back to the signed-out state.
let onUnauthorized: (() => void) | null = null;

export function setUnauthorizedHandler(handler: (() => void) | null) {
  onUnauthorized = handler;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getTokenSync();
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      ...(init?.body && !(init.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    if (response.status === 401) {
      await clearToken();
      onUnauthorized?.();
    }
    const text = await response.text().catch(() => '');
    throw new ApiError({
      status: response.status,
      method: init?.method ?? 'GET',
      path,
      body: text,
    });
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const api = {
  // Subjects
  listSubjects: () => request<SubjectSummary[]>('/api/subjects'),
  createSubject: (input: { name?: string; description?: string; universityCourseId?: string; proposeAsCourse?: boolean }) =>
    request<Subject>('/api/subjects', { method: 'POST', body: JSON.stringify(input) }),
  getSubject: (id: string) => request<Subject>(`/api/subjects/${id}`),
  updateSubject: (id: string, name: string, description?: string) =>
    request<void>(`/api/subjects/${id}`, { method: 'PUT', body: JSON.stringify({ name, description }) }),
  deleteSubject: (id: string) => request<void>(`/api/subjects/${id}`, { method: 'DELETE' }),

  uploadSyllabus: async (subjectId: string, file: { uri: string; name: string; mimeType?: string }) => {
    const form = new FormData();
    // @ts-expect-error React Native's FormData accepts this file-uri shape.
    form.append('file', { uri: file.uri, name: file.name, type: file.mimeType ?? 'application/octet-stream' });
    return request<SyllabusUploadResult>(`/api/subjects/${subjectId}/syllabus`, { method: 'POST', body: form });
  },

  uploadSyllabusText: (subjectId: string, text: string) =>
    request<SyllabusUploadResult>(`/api/subjects/${subjectId}/syllabus/text`, {
      method: 'POST',
      body: JSON.stringify({ text }),
    }),

  saveGradingScheme: (subjectId: string, components: { name: string; category: GradeCategory; weightPercent: number }[]) =>
    request<void>(`/api/subjects/${subjectId}/grading-scheme`, { method: 'PUT', body: JSON.stringify(components) }),

  getGrades: (subjectId: string) => request<SubjectGradesResponse>(`/api/subjects/${subjectId}/grades`),

  addGradingComponent: (subjectId: string, name: string, category: GradeCategory, weightPercent: number) =>
    request<GradingComponentDto>(`/api/subjects/${subjectId}/grades/components`, {
      method: 'POST',
      body: JSON.stringify({ name, category, weightPercent }),
    }),

  addGradeEntry: (componentId: string, name: string, score: number, maxScore: number) =>
    request<void>(`/api/subjects/grades/components/${componentId}/entries`, {
      method: 'POST',
      body: JSON.stringify({ name, score, maxScore }),
    }),

  deleteGradeEntry: (entryId: string) =>
    request<void>(`/api/subjects/grades/entries/${entryId}`, { method: 'DELETE' }),

  // Lessons
  listLessons: (subjectId: string) => request<LessonSummary[]>(`/api/subjects/${subjectId}/lessons`),
  createLesson: (subjectId: string, title: string) =>
    request<{ id: string }>(`/api/subjects/${subjectId}/lessons`, { method: 'POST', body: JSON.stringify({ title }) }),
  getLesson: (id: string) => request<LessonDetail>(`/api/lessons/${id}`),
  updateLesson: (id: string, title: string) =>
    request<void>(`/api/lessons/${id}`, { method: 'PUT', body: JSON.stringify({ title }) }),
  deleteLesson: (id: string) => request<void>(`/api/lessons/${id}`, { method: 'DELETE' }),

  saveNote: (lessonId: string, content: string) =>
    request<void>(`/api/lessons/${lessonId}/notes`, { method: 'PUT', body: JSON.stringify({ content }) }),

  // Decks
  createDeck: (lessonId: string, name?: string) =>
    request<DeckDto>(`/api/lessons/${lessonId}/decks`, {
      method: 'POST',
      body: JSON.stringify({ name: name ?? null }),
    }),

  renameDeck: (deckId: string, name: string) =>
    request<void>(`/api/decks/${deckId}`, { method: 'PUT', body: JSON.stringify({ name }) }),

  deleteDeck: (deckId: string) => request<void>(`/api/decks/${deckId}`, { method: 'DELETE' }),

  addCard: (deckId: string, question: string, answer: string, difficulty?: Difficulty) =>
    request<FlashcardDto>(`/api/decks/${deckId}/cards`, {
      method: 'POST',
      body: JSON.stringify({ question, answer, difficulty: difficulty ?? null }),
    }),

  updateCard: (cardId: string, question: string, answer: string, difficulty?: Difficulty) =>
    request<FlashcardDto>(`/api/flashcards/${cardId}`, {
      method: 'PUT',
      body: JSON.stringify({ question, answer, difficulty: difficulty ?? null }),
    }),

  deleteCard: (cardId: string) => request<void>(`/api/flashcards/${cardId}`, { method: 'DELETE' }),

  // Flashcards / quizzes
  createQuiz: (lessonId: string, count: number, difficulty: Difficulty) =>
    request<DeckDto>(`/api/lessons/${lessonId}/quiz`, {
      method: 'POST',
      body: JSON.stringify({ count, difficulty }),
    }),

  listLessonFlashcards: (lessonId: string) => request<FlashcardDto[]>(`/api/lessons/${lessonId}/flashcards`),

  reviewFlashcard: (id: string, grade: ReviewGrade) =>
    request<ReviewResult>(`/api/flashcards/${id}/review`, { method: 'POST', body: JSON.stringify({ grade }) }),

  // Today's session payload: due cards + capped new cards, plus backlog counts.
  getDailyFlashcards: (count?: number) =>
    request<DailyResponse>(`/api/flashcards/daily${count ? `?count=${count}` : ''}`),

  // Lightweight counts for the dashboard badge.
  getDailySummary: () => request<DailySummary>('/api/flashcards/daily/summary'),

  // "Review ahead": the next cards closest to being forgotten.
  getExtraFlashcards: (count: number, excludeIds: string[] = []) => {
    const params = new URLSearchParams({ count: String(count) });
    if (excludeIds.length) params.set('excludeIds', excludeIds.join(','));
    return request<DailyCardDto[]>(`/api/flashcards/extra?${params.toString()}`);
  },

  getStack: (params: { lessonId?: string; subjectId?: string } = {}) => {
    const query = new URLSearchParams(params as Record<string, string>).toString();
    return request<FlashcardDto[]>(`/api/flashcards/stack${query ? `?${query}` : ''}`);
  },

  exportAudioUrl: () => `${API_BASE_URL}/api/flashcards/export-audio`,

  // SRS settings (persisted server-side, synced across devices).
  getSrsSettings: () => request<SrsSettings>('/api/settings/srs'),
  updateSrsSettings: (settings: SrsSettings) =>
    request<SrsSettings>('/api/settings/srs', { method: 'PUT', body: JSON.stringify(settings) }),

  // Universities / community
  listUniversities: () => request<UniversityDto[]>('/api/universities'),
  listMyCourses: () => request<UniversityCourseDto[]>('/api/universities/mine/courses'),
  setUniversity: (universityId: string) =>
    request<AuthUser>('/api/settings/university', { method: 'PUT', body: JSON.stringify({ universityId }) }),

  shareLesson: (lessonId: string) => request<void>(`/api/lessons/${lessonId}/share`, { method: 'POST' }),
  unshareLesson: (lessonId: string) => request<void>(`/api/lessons/${lessonId}/share`, { method: 'DELETE' }),
  syncFork: (lessonId: string) => request<LessonDetail>(`/api/lessons/${lessonId}/sync-fork`, { method: 'POST' }),

  listCommunityLessons: (courseId: string, params: { sort: CommunitySort; q?: string; page?: number } = { sort: 'likes' }) => {
    const query = new URLSearchParams({
      sort: params.sort,
      ...(params.q ? { q: params.q } : {}),
      ...(params.page ? { page: String(params.page) } : {}),
    });
    return request<CommunityLessonPage>(`/api/community/courses/${courseId}/lessons?${query.toString()}`);
  },

  getCommunityLesson: (lessonId: string) => request<CommunityLessonDetail>(`/api/community/lessons/${lessonId}`),

  likeCommunityLesson: (lessonId: string) =>
    request<LikeResult>(`/api/community/lessons/${lessonId}/like`, { method: 'POST' }),
  unlikeCommunityLesson: (lessonId: string) =>
    request<LikeResult>(`/api/community/lessons/${lessonId}/like`, { method: 'DELETE' }),

  forkCommunityLesson: (lessonId: string) =>
    request<ForkResult>(`/api/community/lessons/${lessonId}/fork`, { method: 'POST' }),

  // Auth
  auth: {
    register: (data: { email: string; password: string; firstName: string; lastName: string; schoolName?: string; universityId?: string }) =>
      request<AuthResponse>('/api/auth/register', { method: 'POST', body: JSON.stringify(data) }),

    login: (email: string, password: string) =>
      request<AuthResponse>('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),

    google: (idToken: string, schoolName?: string, universityId?: string) =>
      request<AuthResponse>('/api/auth/google', { method: 'POST', body: JSON.stringify({ idToken, schoolName, universityId }) }),

    me: () => request<AuthUser>('/api/auth/me'),
  },
};
