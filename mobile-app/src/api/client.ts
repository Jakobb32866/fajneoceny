import { API_BASE_URL } from './config';
import { clearToken, getTokenSync } from './token';
import type {
  AuthResponse,
  AuthUser,
  DeckDto,
  Difficulty,
  FlashcardDto,
  GradeCategory,
  GradingComponentDto,
  LessonDetail,
  LessonSummary,
  Subject,
  SubjectGradesResponse,
  SubjectSummary,
  SyllabusUploadResult,
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
    throw new Error(`${init?.method ?? 'GET'} ${path} failed: ${response.status} ${text}`);
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const api = {
  // Subjects
  listSubjects: () => request<SubjectSummary[]>('/api/subjects'),
  createSubject: (name: string, description?: string) =>
    request<Subject>('/api/subjects', { method: 'POST', body: JSON.stringify({ name, description }) }),
  getSubject: (id: string) => request<Subject>(`/api/subjects/${id}`),
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
  deleteLesson: (id: string) => request<void>(`/api/lessons/${id}`, { method: 'DELETE' }),

  saveNote: (lessonId: string, content: string) =>
    request<void>(`/api/lessons/${lessonId}/notes`, { method: 'PUT', body: JSON.stringify({ content }) }),

  addLinkSource: (lessonId: string, title: string, url: string, type: 'YoutubeLink' | 'Link') =>
    request<void>(`/api/lessons/${lessonId}/sources/link`, {
      method: 'POST',
      body: JSON.stringify({ title, url, type }),
    }),

  addFileSource: async (lessonId: string, file: { uri: string; name: string; mimeType?: string }) => {
    const form = new FormData();
    // @ts-expect-error React Native's FormData accepts this file-uri shape.
    form.append('file', { uri: file.uri, name: file.name, type: file.mimeType ?? 'application/octet-stream' });
    return request<void>(`/api/lessons/${lessonId}/sources/file`, { method: 'POST', body: form });
  },

  deleteSource: (id: string) => request<void>(`/api/sources/${id}`, { method: 'DELETE' }),

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

  reviewFlashcard: (id: string, correct: boolean) =>
    request<void>(`/api/flashcards/${id}/review`, { method: 'POST', body: JSON.stringify({ correct }) }),

  getDailyFlashcards: (count = 30) => request<FlashcardDto[]>(`/api/flashcards/daily?count=${count}`),

  getStack: (params: { lessonId?: string; subjectId?: string } = {}) => {
    const query = new URLSearchParams(params as Record<string, string>).toString();
    return request<FlashcardDto[]>(`/api/flashcards/stack${query ? `?${query}` : ''}`);
  },

  exportAudioUrl: () => `${API_BASE_URL}/api/flashcards/export-audio`,

  // Auth
  auth: {
    register: (data: { email: string; password: string; firstName: string; lastName: string; schoolName: string }) =>
      request<AuthResponse>('/api/auth/register', { method: 'POST', body: JSON.stringify(data) }),

    login: (email: string, password: string) =>
      request<AuthResponse>('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),

    google: (idToken: string, schoolName?: string) =>
      request<AuthResponse>('/api/auth/google', { method: 'POST', body: JSON.stringify({ idToken, schoolName }) }),

    me: () => request<AuthUser>('/api/auth/me'),
  },
};
