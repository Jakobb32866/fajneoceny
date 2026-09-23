import { API_BASE_URL } from './config';
import { ApiError } from './errors';
import { clearToken, getTokenSync, type TokenKind } from './token';
import type {
  AuthResponse,
  AuthUser,
  CommunityLessonDetail,
  CommunityLessonPage,
  CommunitySort,
  CourseProposalStatus,
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
  AdminAccount,
  AdminCourse,
  AdminLessonDetail,
  AdminLessonPage,
  AdminLoginResponse,
  AdminModeratedLesson,
  AdminProposal,
  AdminStats,
  AdminUniversity,
  AdminUserDetail,
  AdminUserPage,
  ShareBan,
} from './types';

// Registered by AuthContext so a 401 from any request (e.g. an expired token
// mid-session) can immediately drop the app back to the signed-out state.
let onUnauthorized: (() => void) | null = null;
let onAdminUnauthorized: (() => void) | null = null;

export function setUnauthorizedHandler(handler: (() => void) | null) {
  onUnauthorized = handler;
}

export function setAdminUnauthorizedHandler(handler: (() => void) | null) {
  onAdminUnauthorized = handler;
}

/**
 * Admin and student routes use differently-signed tokens that the backend
 * refuses to accept for each other, so the token is chosen by path. Both can
 * be present at once — signing in as an admin does not end a student session
 * on the same device.
 */
function tokenKindFor(path: string): TokenKind {
  return path.startsWith('/api/admin') ? 'admin' : 'student';
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const kind = tokenKindFor(path);
  const token = getTokenSync(kind);
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      ...(init?.body && !(init.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    // 403 on an admin route means the token is valid but not an admin one
    // (or not a super-admin one) — that is an authorization failure to show,
    // not a reason to drop the session. Only 401 signs out.
    if (response.status === 401) {
      await clearToken(kind);
      if (kind === 'admin') onAdminUnauthorized?.();
      else onUnauthorized?.();
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


/** Builds a query string from the defined values only, so optional scope params stay absent. */
function adminQuery(options?: Record<string, string | number | undefined>): string {
  if (!options) return '';
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(options)) {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `?${query}` : '';
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
  // -------------------------------------------------------------------------
  // Admin
  //
  // Every path here starts with /api/admin, which is how the request layer
  // knows to send the admin token rather than the student one.
  //
  // University-scoped calls take an optional universityId: a normal admin's
  // scope is implied by their account and the parameter is ignored, while a
  // super admin MUST supply one (the backend 404s otherwise).
  // -------------------------------------------------------------------------
  admin: {
    login: (email: string, password: string) =>
      request<AdminLoginResponse>('/api/admin/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      }),

    me: () => request<AdminAccount>('/api/admin/me'),

    // Course proposals
    listProposals: (options?: { universityId?: string; status?: CourseProposalStatus }) =>
      request<AdminProposal[]>(`/api/admin/proposals${adminQuery(options)}`),

    approveProposal: (
      id: string,
      body: { courseId?: string; newCourseName?: string; newCourseCode?: string },
      universityId?: string,
    ) =>
      request<void>(`/api/admin/proposals/${id}/approve${adminQuery({ universityId })}`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),

    rejectProposal: (id: string, reason: string | undefined, universityId?: string) =>
      request<void>(`/api/admin/proposals/${id}/reject${adminQuery({ universityId })}`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      }),

    // Course catalogue
    listCourses: (universityId?: string) =>
      request<AdminCourse[]>(`/api/admin/courses${adminQuery({ universityId })}`),

    createCourse: (body: { name: string; code?: string }, universityId?: string) =>
      request<AdminCourse>(`/api/admin/courses${adminQuery({ universityId })}`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),

    updateCourse: (
      id: string,
      body: { name?: string; code?: string; isArchived?: boolean },
      universityId?: string,
    ) =>
      request<void>(`/api/admin/courses/${id}${adminQuery({ universityId })}`, {
        method: 'PUT',
        body: JSON.stringify(body),
      }),

    deleteCourse: (id: string, universityId?: string) =>
      request<void>(`/api/admin/courses/${id}${adminQuery({ universityId })}`, { method: 'DELETE' }),

    // Shared-lesson moderation
    listLessons: (options: {
      universityId?: string;
      courseId?: string;
      sort?: CommunitySort;
      q?: string;
      page?: number;
    }) => request<AdminLessonPage>(`/api/admin/lessons${adminQuery(options)}`),

    getLesson: (id: string, universityId?: string) =>
      request<AdminLessonDetail>(`/api/admin/lessons/${id}${adminQuery({ universityId })}`),

    listModeratedLessons: (universityId?: string) =>
      request<AdminModeratedLesson[]>(`/api/admin/lessons/moderated${adminQuery({ universityId })}`),

    takedownLesson: (id: string, body: { reason: string; banHours?: number }, universityId?: string) =>
      request<void>(`/api/admin/lessons/${id}/takedown${adminQuery({ universityId })}`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),

    liftLessonLock: (id: string, universityId?: string) =>
      request<void>(`/api/admin/lessons/${id}/takedown${adminQuery({ universityId })}`, { method: 'DELETE' }),

    // Users & share bans
    listUsers: (options: { universityId?: string; q?: string; page?: number }) =>
      request<AdminUserPage>(`/api/admin/users${adminQuery(options)}`),

    getUser: (id: string, universityId?: string) =>
      request<AdminUserDetail>(`/api/admin/users/${id}${adminQuery({ universityId })}`),

    listShareBans: (userId: string, universityId?: string) =>
      request<ShareBan[]>(`/api/admin/users/${userId}/share-bans${adminQuery({ universityId })}`),

    issueShareBan: (userId: string, body: { hours: number; reason: string }, universityId?: string) =>
      request<void>(`/api/admin/users/${userId}/share-ban${adminQuery({ universityId })}`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),

    liftShareBan: (userId: string, universityId?: string) =>
      request<void>(`/api/admin/users/${userId}/share-ban${adminQuery({ universityId })}`, { method: 'DELETE' }),

    // Super admin only
    listUniversities: () => request<AdminUniversity[]>('/api/admin/universities'),

    createUniversity: (body: { name: string; shortName?: string }) =>
      request<AdminUniversity>('/api/admin/universities', { method: 'POST', body: JSON.stringify(body) }),

    updateUniversity: (id: string, body: { name?: string; shortName?: string; isArchived?: boolean }) =>
      request<void>(`/api/admin/universities/${id}`, { method: 'PUT', body: JSON.stringify(body) }),

    deleteUniversity: (id: string) =>
      request<void>(`/api/admin/universities/${id}`, { method: 'DELETE' }),

    listAdmins: () => request<AdminAccount[]>('/api/admin/admins'),

    createAdmin: (body: { email: string; displayName: string; password: string; universityId?: string }) =>
      request<AdminAccount>('/api/admin/admins', { method: 'POST', body: JSON.stringify(body) }),

    updateAdmin: (
      id: string,
      body: { displayName?: string; password?: string; universityId?: string; isDisabled?: boolean },
    ) => request<void>(`/api/admin/admins/${id}`, { method: 'PUT', body: JSON.stringify(body) }),

    disableAdmin: (id: string) => request<void>(`/api/admin/admins/${id}`, { method: 'DELETE' }),

    stats: () => request<AdminStats>('/api/admin/stats'),
  },

};
