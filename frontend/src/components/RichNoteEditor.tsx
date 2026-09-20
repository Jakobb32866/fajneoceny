import { useMemo, useRef, useState } from 'react';
import {
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type NativeSyntheticEvent,
  type TextInputSelectionChangeEventData,
} from 'react-native';
import { Maximize2, Quote, Square, SquareCheck, X, type LucideIcon } from 'lucide-react-native';
import { theme } from '../theme';

type Selection = { start: number; end: number };

type FormatKind = 'bold' | 'italic' | 'code' | 'h1' | 'h2' | 'bullet' | 'ordered' | 'quote' | 'checkbox';

const INLINE_FORMATS: Record<'bold' | 'italic' | 'code', string> = {
  bold: '**',
  italic: '*',
  code: '`',
};

const LINE_PREFIXES: Record<'h1' | 'h2' | 'bullet' | 'ordered' | 'quote' | 'checkbox', string> = {
  h1: '# ',
  h2: '## ',
  bullet: '- ',
  ordered: '1. ',
  quote: '> ',
  checkbox: '- [ ] ',
};

const TOOLBAR: { kind: FormatKind; label?: string; icon?: LucideIcon; hint: string }[] = [
  { kind: 'bold', label: 'B', hint: 'Pogrubienie' },
  { kind: 'italic', label: 'I', hint: 'Kursywa' },
  { kind: 'code', label: '</>', hint: 'Kod' },
  { kind: 'h1', label: 'H1', hint: 'Nagłówek' },
  { kind: 'h2', label: 'H2', hint: 'Podnagłówek' },
  { kind: 'bullet', label: '•', hint: 'Lista' },
  { kind: 'ordered', label: '1.', hint: 'Lista numerowana' },
  { kind: 'checkbox', icon: SquareCheck, hint: 'Zadanie' },
  { kind: 'quote', icon: Quote, hint: 'Cytat' },
];

/** Apply an inline wrap (bold/italic/code) around the current selection. */
function applyInline(text: string, sel: Selection, marker: string): { text: string; sel: Selection } {
  const before = text.slice(0, sel.start);
  const selected = text.slice(sel.start, sel.end);
  const after = text.slice(sel.end);

  // Toggle off if the selection is already wrapped.
  if (selected.startsWith(marker) && selected.endsWith(marker) && selected.length >= marker.length * 2) {
    const inner = selected.slice(marker.length, selected.length - marker.length);
    return {
      text: before + inner + after,
      sel: { start: sel.start, end: sel.start + inner.length },
    };
  }

  const placeholder = selected.length ? selected : 'tekst';
  const next = before + marker + placeholder + marker + after;
  return {
    text: next,
    sel: {
      start: sel.start + marker.length,
      end: sel.start + marker.length + placeholder.length,
    },
  };
}

/** Toggle a line prefix (heading/list/quote/checkbox) on every line the selection touches. */
function applyLinePrefix(text: string, sel: Selection, prefix: string): { text: string; sel: Selection } {
  const lineStart = text.lastIndexOf('\n', sel.start - 1) + 1;
  let lineEnd = text.indexOf('\n', sel.end);
  if (lineEnd === -1) lineEnd = text.length;

  const block = text.slice(lineStart, lineEnd);
  const lines = block.split('\n');
  // If every non-empty line already has the prefix, strip it; otherwise add it.
  const allPrefixed = lines.every((l) => l.length === 0 || l.startsWith(prefix));
  const updated = lines
    .map((l) => {
      if (l.length === 0) return l;
      return allPrefixed
        ? l.slice(prefix.length)
        : prefix + l.replace(/^(\s*)([-*>#]+\s|\d+\.\s|\[[ x]\]\s)?/, '$1');
    })
    .join('\n');

  const next = text.slice(0, lineStart) + updated + text.slice(lineEnd);
  const delta = updated.length - block.length;
  return { text: next, sel: { start: lineStart, end: lineEnd + delta } };
}

// ---------- Markdown preview renderer ----------

function renderInline(line: string, keyBase: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  // Match **bold**, *italic*, `code`.
  const regex = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let i = 0;
  while ((match = regex.exec(line)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(<Text key={`${keyBase}-t${i}`}>{line.slice(lastIndex, match.index)}</Text>);
    }
    const token = match[0];
    if (token.startsWith('**')) {
      nodes.push(
        <Text key={`${keyBase}-b${i}`} style={pv.bold}>
          {token.slice(2, -2)}
        </Text>,
      );
    } else if (token.startsWith('`')) {
      nodes.push(
        <Text key={`${keyBase}-c${i}`} style={pv.code}>
          {token.slice(1, -1)}
        </Text>,
      );
    } else {
      nodes.push(
        <Text key={`${keyBase}-i${i}`} style={pv.italic}>
          {token.slice(1, -1)}
        </Text>,
      );
    }
    lastIndex = regex.lastIndex;
    i += 1;
  }
  if (lastIndex < line.length) {
    nodes.push(<Text key={`${keyBase}-tend`}>{line.slice(lastIndex)}</Text>);
  }
  return nodes;
}

function MarkdownPreview({ text }: { text: string }) {
  const lines = text.length ? text.split('\n') : [];
  if (lines.length === 0) {
    return <Text style={pv.placeholder}>Podgląd pojawi się tutaj…</Text>;
  }
  let orderedCounter = 0;
  return (
    <View style={{ gap: 6 }}>
      {lines.map((raw, idx) => {
        const key = `l${idx}`;
        if (raw.trim().length === 0) {
          orderedCounter = 0;
          return <View key={key} style={{ height: 8 }} />;
        }
        if (raw.startsWith('## ')) {
          return (
            <Text key={key} style={pv.h2}>
              {renderInline(raw.slice(3), key)}
            </Text>
          );
        }
        if (raw.startsWith('# ')) {
          return (
            <Text key={key} style={pv.h1}>
              {renderInline(raw.slice(2), key)}
            </Text>
          );
        }
        if (raw.startsWith('> ')) {
          return (
            <View key={key} style={pv.quoteRow}>
              <View style={pv.quoteBar} />
              <Text style={pv.quoteText}>{renderInline(raw.slice(2), key)}</Text>
            </View>
          );
        }
        const checkbox = raw.match(/^- \[( |x)\] (.*)$/);
        if (checkbox) {
          const checked = checkbox[1] === 'x';
          return (
            <View key={key} style={pv.listRow}>
              {checked ? (
                <SquareCheck size={16} color="#2563eb" style={pv.checkboxIcon} />
              ) : (
                <Square size={16} color="#6b7280" style={pv.checkboxIcon} />
              )}
              <Text style={[pv.body, checked && pv.checkedText]}>{renderInline(checkbox[2], key)}</Text>
            </View>
          );
        }
        if (raw.startsWith('- ') || raw.startsWith('* ')) {
          return (
            <View key={key} style={pv.listRow}>
              <Text style={pv.bullet}>•</Text>
              <Text style={pv.body}>{renderInline(raw.slice(2), key)}</Text>
            </View>
          );
        }
        const ordered = raw.match(/^\d+\. (.*)$/);
        if (ordered) {
          orderedCounter += 1;
          return (
            <View key={key} style={pv.listRow}>
              <Text style={pv.orderedIndex}>{orderedCounter}.</Text>
              <Text style={pv.body}>{renderInline(ordered[1], key)}</Text>
            </View>
          );
        }
        orderedCounter = 0;
        return (
          <Text key={key} style={pv.body}>
            {renderInline(raw, key)}
          </Text>
        );
      })}
    </View>
  );
}

// ---------- Editor ----------

interface EditorBodyProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  mode: 'edit' | 'preview';
  onToggleMode: () => void;
  fullscreen: boolean;
  onToggleFullscreen: () => void;
}

function EditorBody({
  value,
  onChangeText,
  placeholder,
  mode,
  onToggleMode,
  fullscreen,
  onToggleFullscreen,
}: EditorBodyProps) {
  const inputRef = useRef<TextInput>(null);
  const selectionRef = useRef<Selection>({ start: value.length, end: value.length });
  // Controlled selection is only set right after a toolbar action, then released.
  const [controlledSelection, setControlledSelection] = useState<Selection | undefined>(undefined);

  const onSelectionChange = (e: NativeSyntheticEvent<TextInputSelectionChangeEventData>) => {
    selectionRef.current = e.nativeEvent.selection;
    if (controlledSelection) setControlledSelection(undefined);
  };

  const format = (kind: FormatKind) => {
    const sel = selectionRef.current;
    const safeSel: Selection = {
      start: Math.min(sel.start, value.length),
      end: Math.min(sel.end, value.length),
    };
    const result =
      kind in INLINE_FORMATS
        ? applyInline(value, safeSel, INLINE_FORMATS[kind as keyof typeof INLINE_FORMATS])
        : applyLinePrefix(value, safeSel, LINE_PREFIXES[kind as keyof typeof LINE_PREFIXES]);

    onChangeText(result.text);
    selectionRef.current = result.sel;
    setControlledSelection(result.sel);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  return (
    <View style={[styles.wrapper, fullscreen && styles.wrapperFullscreen]}>
      <View style={styles.headerRow}>
        <View style={styles.modeToggle}>
          <TouchableOpacity
            style={[styles.modeButton, mode === 'edit' && styles.modeButtonActive]}
            onPress={() => mode !== 'edit' && onToggleMode()}
          >
            <Text style={mode === 'edit' ? styles.modeTextActive : styles.modeText}>Edycja</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeButton, mode === 'preview' && styles.modeButtonActive]}
            onPress={() => mode !== 'preview' && onToggleMode()}
          >
            <Text style={mode === 'preview' ? styles.modeTextActive : styles.modeText}>Podgląd</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          style={styles.fullscreenButton}
          onPress={onToggleFullscreen}
          accessibilityLabel={fullscreen ? 'Zamknij pełny ekran' : 'Pełny ekran'}
          hitSlop={8}
        >
          {fullscreen ? (
            <X size={16} color={theme.colors.text.secondary} />
          ) : (
            <Maximize2 size={16} color={theme.colors.text.secondary} />
          )}
        </TouchableOpacity>
      </View>

      {mode === 'edit' && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.toolbar}
          contentContainerStyle={styles.toolbarContent}
          keyboardShouldPersistTaps="always"
        >
          {TOOLBAR.map((item) => (
            <TouchableOpacity
              key={item.kind}
              style={styles.toolButton}
              onPress={() => format(item.kind)}
              accessibilityLabel={item.hint}
            >
              {item.icon ? (
                <item.icon size={16} color={theme.colors.text.secondary} />
              ) : (
                <Text
                  style={[
                    styles.toolLabel,
                    item.kind === 'bold' && styles.toolLabelBold,
                    item.kind === 'italic' && styles.toolLabelItalic,
                  ]}
                >
                  {item.label}
                </Text>
              )}
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {mode === 'edit' ? (
        <TextInput
          ref={inputRef}
          style={[styles.input, fullscreen && styles.inputFullscreen]}
          multiline
          placeholder={placeholder ?? 'Pisz notatki…'}
          placeholderTextColor={theme.colors.text.tertiary}
          value={value}
          onChangeText={onChangeText}
          onSelectionChange={onSelectionChange}
          selection={controlledSelection}
          textAlignVertical="top"
        />
      ) : (
        <ScrollView
          style={[styles.preview, fullscreen && styles.previewFullscreen]}
          contentContainerStyle={{ padding: 12 }}
        >
          <MarkdownPreview text={value} />
        </ScrollView>
      )}
    </View>
  );
}

export interface RichNoteEditorProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
}

export function RichNoteEditor({ value, onChangeText, placeholder }: RichNoteEditorProps) {
  const [fullscreen, setFullscreen] = useState(false);
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');
  const toggleMode = () => setMode((m) => (m === 'edit' ? 'preview' : 'edit'));

  const body = useMemo(
    () => (fs: boolean) => (
      <EditorBody
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        mode={mode}
        onToggleMode={toggleMode}
        fullscreen={fs}
        onToggleFullscreen={() => setFullscreen((f) => !f)}
      />
    ),
    [value, onChangeText, placeholder, mode],
  );

  return (
    <>
      {body(false)}
      <Modal visible={fullscreen} animationType="slide" onRequestClose={() => setFullscreen(false)}>
        <View style={styles.modalRoot}>{body(true)}</View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    borderWidth: 1,
    borderColor: theme.colors.border.default,
    borderRadius: theme.radius.md,
    overflow: 'hidden',
    backgroundColor: theme.colors.surface.card,
  },
  wrapperFullscreen: {
    flex: 1,
    borderWidth: 0,
    borderRadius: 0,
  },
  modalRoot: {
    flex: 1,
    backgroundColor: theme.colors.surface.card,
    paddingTop: Platform.OS === 'ios' ? 52 : 16,
    paddingHorizontal: theme.spacing[3],
    paddingBottom: theme.spacing[3],
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1] + 2,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border.default,
  },
  modeToggle: {
    flexDirection: 'row',
    backgroundColor: theme.colors.surface.sunken,
    borderRadius: theme.radius.sm,
    padding: 2,
  },
  modeButton: { paddingHorizontal: theme.spacing[3], paddingVertical: 5, borderRadius: 6 },
  modeButtonActive: { backgroundColor: theme.colors.surface.card },
  modeText: {
    fontSize: theme.font.size.caption,
    color: theme.colors.text.secondary,
    fontFamily: theme.font.family.sansSemibold,
  },
  modeTextActive: {
    fontSize: theme.font.size.caption,
    color: theme.colors.text.primary,
    fontFamily: theme.font.family.sansBold,
  },
  fullscreenButton: {
    width: 32,
    height: 32,
    borderRadius: theme.radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surface.sunken,
  },
  fullscreenIcon: { fontSize: 16, color: theme.colors.text.secondary },
  toolbar: {
    maxHeight: 44,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border.default,
  },
  toolbarContent: {
    alignItems: 'center',
    paddingHorizontal: theme.spacing[2] - 2,
    paddingVertical: theme.spacing[2] - 2,
    gap: theme.spacing[2] - 2,
  },
  toolButton: {
    minWidth: 34,
    height: 32,
    paddingHorizontal: theme.spacing[2],
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.surface.sunken,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolLabel: {
    fontSize: theme.font.size.bodySm,
    color: theme.colors.text.secondary,
    fontFamily: theme.font.family.sansSemibold,
  },
  toolLabelBold: { fontWeight: '900' },
  toolLabelItalic: { fontStyle: 'italic' },
  input: {
    minHeight: 140,
    padding: theme.spacing[3],
    fontSize: theme.font.size.bodySm,
    color: theme.colors.text.primary,
  },
  inputFullscreen: { flex: 1 },
  preview: { minHeight: 140 },
  previewFullscreen: { flex: 1 },
});

// The `pv` styles below render the user's actual note content (markdown
// preview: bold/italic/code/headings/lists/quotes). These colors are part of
// the rich-text content model's visual semantics, not chrome, so they're
// deliberately left as their original hardcoded values rather than swapped
// for theme tokens — only the placeholder (empty-state chrome text) uses the
// theme.
const pv = StyleSheet.create({
  placeholder: { color: theme.colors.text.tertiary, fontStyle: 'italic', padding: 4 },
  body: { fontSize: 14, color: '#111827', lineHeight: 21, flex: 1 },
  bold: { fontWeight: '800' },
  italic: { fontStyle: 'italic' },
  code: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    backgroundColor: '#f2f4f7',
    color: '#b91c1c',
    fontSize: 13,
  },
  h1: { fontSize: 22, fontWeight: '800', color: '#111827', marginTop: 4 },
  h2: { fontSize: 18, fontWeight: '700', color: '#111827', marginTop: 4 },
  listRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  bullet: { fontSize: 14, color: '#6b7280', lineHeight: 21 },
  orderedIndex: { fontSize: 14, color: '#6b7280', lineHeight: 21, minWidth: 18 },
  checkbox: { fontSize: 16, color: '#2563eb', lineHeight: 21 },
  checkboxIcon: { marginTop: 3 },
  checkedText: { color: '#9ca3af', textDecorationLine: 'line-through' },
  quoteRow: { flexDirection: 'row', gap: 8 },
  quoteBar: { width: 3, borderRadius: 2, backgroundColor: '#d1d5db' },
  quoteText: { fontSize: 14, color: '#4b5563', fontStyle: 'italic', flex: 1, lineHeight: 21 },
});
