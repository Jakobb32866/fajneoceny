/**
 * Shared layout constraints. `contentMaxWidth` is the same cap the dashboard's
 * desktop bento grid uses, so every screen's content lines up to the same
 * column on wide viewports instead of stretching edge to edge.
 */
export const layout = {
  contentMaxWidth: 1040,
} as const;
