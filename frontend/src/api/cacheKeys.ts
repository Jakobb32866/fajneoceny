/**
 * Cache key vocabulary. Defined in one place so reads and invalidations can't
 * drift apart — a typo'd key silently caches forever.
 *
 * Keys are slash-separated so `invalidate(cacheKeys.subject(id))` sweeps every
 * resource nested under a subject in one call (see invalidate() in cache.ts).
 */
export const cacheKeys = {
  subjects: 'subjects',
  subject: (subjectId: string) => `subject/${subjectId}`,
  subjectGrades: (subjectId: string) => `subject/${subjectId}/grades`,
  subjectLessons: (subjectId: string) => `subject/${subjectId}/lessons`,
  lesson: (lessonId: string) => `lesson/${lessonId}`,
  srsSettings: 'settings/srs',
  dailySummary: 'daily/summary',
  /** Cross-subject grade digest shown on the dashboard bento grid. */
  dashboardGrades: 'dashboard/grades',
  /** Fallback "last added" lessons for the dashboard when there are no recents. */
  dashboardFallbackLessons: 'dashboard/fallback-lessons',
  universities: 'universities',
  myCourses: 'universities/mine/courses',
  communityCourse: (courseId: string) => `community/course/${courseId}`,
  communityLessons: (courseId: string, sort: string, q: string, page: number) =>
    `community/course/${courseId}/lessons/${sort}/${encodeURIComponent(q)}/${page}`,
  communityLesson: (lessonId: string) => `community/lesson/${lessonId}`,

  /**
   * Admin keys all sit under `admin/` so signing out of the admin panel can
   * sweep them with a single invalidate('admin') — an admin's view is
   * per-account and must not survive into the next session.
   *
   * University-scoped keys embed the scope, because a super admin switches
   * between schools and the two views must not share a cache entry.
   */
  adminMe: 'admin/me',
  adminScope: (universityId: string) => `admin/scope/${universityId}`,
  adminProposals: (universityId: string, status: string) =>
    `admin/scope/${universityId}/proposals/${status}`,
  adminCourses: (universityId: string) => `admin/scope/${universityId}/courses`,
  adminLessons: (universityId: string, courseId: string, sort: string, q: string, page: number) =>
    `admin/scope/${universityId}/lessons/${courseId}/${sort}/${encodeURIComponent(q)}/${page}`,
  adminLesson: (lessonId: string) => `admin/lesson/${lessonId}`,
  adminModeratedLessons: (universityId: string) => `admin/scope/${universityId}/moderated`,
  adminUsers: (universityId: string, q: string, page: number) =>
    `admin/scope/${universityId}/users/${encodeURIComponent(q)}/${page}`,
  adminUser: (universityId: string, userId: string) => `admin/scope/${universityId}/user/${userId}`,
  adminUserBans: (universityId: string, userId: string) =>
    `admin/scope/${universityId}/user/${userId}/bans`,
  adminUniversities: 'admin/universities',
  adminAdmins: 'admin/admins',
  adminStats: 'admin/stats',
} as const;
