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
} as const;
