import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Quill from 'quill';
import 'quill/dist/quill.snow.css';
import { theme } from '../theme';

/**
 * Web-only rich text editor built on Quill, so formatting is true WYSIWYG and
 * "type-forward" (click a style, then everything you type keeps that style until
 * you toggle it off — the editor's native behavior). Content is stored as HTML.
 *
 * Metro serves this file only on web; iOS/Android use the plain
 * RichNoteEditor.tsx, so Quill is never bundled for native.
 */

export interface RichNoteEditorProps {
  value: string;
  onChangeText: (html: string) => void;
  placeholder?: string;
}

// Inline SVGs (lucide geometry) so the web build has no react-native-svg
// dependency in the DOM tree; stroke inherits the button's `currentColor`.
function MaximizeIcon() {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="15 3 21 3 21 9" />
      <polyline points="9 21 3 21 3 15" />
      <line x1="21" y1="3" x2="14" y2="10" />
      <line x1="3" y1="21" x2="10" y2="14" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

const TOOLBAR = [
  [{ header: [1, 2, false] }],
  ['bold', 'italic', 'underline'],
  [{ list: 'ordered' }, { list: 'bullet' }],
  ['blockquote'],
  ['clean'],
];

/**
 * One Quill instance bound to a host div. Kept controlled from the outside: it
 * emits on edit and re-syncs when `value` changes externally (but never while
 * focused, to avoid resetting the caret). Two of these can coexist — the inline
 * editor and the fullscreen one — sharing the same parent value.
 */
function QuillHost({ value, onChangeText, placeholder }: RichNoteEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const quillRef = useRef<Quill | null>(null);
  const lastEmitted = useRef<string>(value);
  const applyingExternal = useRef(false);

  useEffect(() => {
    if (!hostRef.current || quillRef.current) return;
    const quill = new Quill(hostRef.current, {
      theme: 'snow',
      placeholder: placeholder ?? 'Pisz notatki…',
      modules: { toolbar: TOOLBAR },
    });
    quillRef.current = quill;

    if (value) {
      applyingExternal.current = true;
      quill.clipboard.dangerouslyPasteHTML(value);
      applyingExternal.current = false;
    }
    lastEmitted.current = quill.getText().trim() ? quill.root.innerHTML : '';

    quill.on('text-change', () => {
      if (applyingExternal.current) return;
      const html = quill.getText().trim().length === 0 ? '' : quill.root.innerHTML;
      lastEmitted.current = html;
      onChangeText(html);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const quill = quillRef.current;
    if (!quill) return;
    if (value !== lastEmitted.current && !quill.hasFocus()) {
      applyingExternal.current = true;
      quill.setContents([]);
      if (value) quill.clipboard.dangerouslyPasteHTML(value);
      applyingExternal.current = false;
      lastEmitted.current = value;
    }
  }, [value]);

  return <div ref={hostRef} />;
}

export function RichNoteEditor({ value, onChangeText, placeholder }: RichNoteEditorProps) {
  const [fullscreen, setFullscreen] = useState(false);

  return (
    <>
      <div className="rne-root" style={styles.wrapper}>
        <button
          type="button"
          title="Pełny ekran"
          onClick={() => setFullscreen(true)}
          style={styles.fullscreenButton}
        >
          <MaximizeIcon />
        </button>
        <QuillHost value={value} onChangeText={onChangeText} placeholder={placeholder} />
      </div>

      {/* Portal to <body> so the fixed overlay escapes React Navigation's screen
          transforms (a transformed ancestor would otherwise trap position:fixed). */}
      {fullscreen &&
        createPortal(
          <div className="rne-root rne-overlay" style={styles.overlay}>
            <button
              type="button"
              title="Zamknij pełny ekran"
              onClick={() => setFullscreen(false)}
              style={styles.fullscreenButton}
            >
              <CloseIcon />
            </button>
            <QuillHost value={value} onChangeText={onChangeText} placeholder={placeholder} />
          </div>,
          document.body,
        )}
    </>
  );
}

// Layout glue so the Quill container fills the card (and the whole screen in
// fullscreen). Injected once. Quill's own DOM/classes are untouched — only
// the color/spacing *values* below are pulled from theme tokens, interpolated
// into the CSS string since theme values are TS constants, not CSS variables.
const globalCss = `
.rne-root { position: relative; display: flex; flex-direction: column; }
.rne-root .ql-toolbar.ql-snow {
  border: none;
  border-bottom: 1px solid ${theme.colors.border.default};
  padding-right: 44px; /* room for the fullscreen button */
}
.rne-root .ql-container.ql-snow { border: none; font-size: ${theme.font.size.bodySm}px; }
.rne-root .ql-editor { min-height: 150px; }
.rne-root .ql-editor.ql-blank::before { color: ${theme.colors.text.tertiary}; font-style: normal; }
.rne-overlay .ql-container.ql-snow { flex: 1; overflow-y: auto; }
.rne-overlay .ql-editor { min-height: 100%; }
`;

if (typeof document !== 'undefined' && !document.getElementById('rne-global-css')) {
  const styleEl = document.createElement('style');
  styleEl.id = 'rne-global-css';
  styleEl.textContent = globalCss;
  document.head.appendChild(styleEl);
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    border: `1px solid ${theme.colors.border.default}`,
    borderRadius: theme.radius.md,
    overflow: 'hidden',
    background: theme.colors.surface.card,
  },
  overlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 1000,
    background: theme.colors.surface.card,
  },
  fullscreenButton: {
    position: 'absolute',
    top: 6,
    right: 8,
    width: 30,
    height: 30,
    borderRadius: theme.radius.sm,
    border: 'none',
    background: theme.colors.surface.sunken,
    color: theme.colors.text.secondary,
    fontSize: 15,
    cursor: 'pointer',
    zIndex: 2,
  },
};
