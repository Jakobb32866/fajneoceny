import { useEffect, useState } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as DocumentPicker from 'expo-document-picker';
import { ActivityIndicator, Alert, FlatList, Pressable, TouchableOpacity, View } from 'react-native';
import { invalidate } from '../api/cache';
import { cacheKeys } from '../api/cacheKeys';
import { ClipboardPaste, FileUp, Pencil, Plus, Trash2, Upload } from 'lucide-react-native';
import { recordSubjectVisit } from '../api/recents';
import { api } from '../api/client';
import { useCachedQuery } from '../hooks/useCachedQuery';
import { GradeSheet } from '../components/GradeSheet';
import { RenameModal } from '../components/RenameModal';
import { Button } from '../components/ui/Button';
import { TextField } from '../components/ui/Input';
import { ModalSheet } from '../components/ui/ModalSheet';
import { Text } from '../components/ui/Text';
import { theme } from '../theme';
import { confirmAsync } from '../utils/confirm';
import type { RootStackParamList } from '../navigation/types';
import type { LessonSummary } from '../api/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Subject'>;
type Tab = 'lessons' | 'grades';

export function SubjectScreen({ route, navigation }: Props) {
  const { subjectId, subjectName } = route.params;
  const [tab, setTab] = useState<Tab>('lessons');
  const [createVisible, setCreateVisible] = useState(false);
  const [syllabusChooserVisible, setSyllabusChooserVisible] = useState(false);
  const [pasteVisible, setPasteVisible] = useState(false);
  const [renameVisible, setRenameVisible] = useState(false);
  // Locally tracked so a rename updates the header without navigating away.
  const [name, setName] = useState(subjectName);

  // Surface this subject in the dashboard's "recently visited" bento tile.
  useEffect(() => {
    recordSubjectVisit(subjectId, subjectName);
  }, [subjectId, subjectName]);

  const lessonsQuery = useCachedQuery<LessonSummary[]>(cacheKeys.subjectLessons(subjectId), () =>
    api.listLessons(subjectId),
  );
  const lessons = lessonsQuery.data ?? (lessonsQuery.error ? [] : null);

  const onSyllabusLoaded = (count: number) => {
    // An upload rewrites the draft grading components. GradeSheet used to pick
    // this up for free by remounting on the tab switch; now that its data is
    // cached, the invalidation has to be explicit.
    invalidate(cacheKeys.subjectGrades(subjectId));
    Alert.alert(
      'Zasady zaliczenia wczytane',
      `Znaleziono ${count} składników oceny. Sprawdź i popraw je w zakładce "Arkusz ocen".`,
    );
    setTab('grades');
  };

  const pickSyllabusFile = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    });
    if (result.canceled) return;

    const file = result.assets[0];
    try {
      const uploadResult = await api.uploadSyllabus(subjectId, {
        uri: file.uri,
        name: file.name,
        mimeType: file.mimeType,
      });
      onSyllabusLoaded(uploadResult.draftComponents.length);
    } catch (e) {
      Alert.alert('Nie udało się wczytać pliku', String(e));
    }
  };

  const renameSubject = async (newName: string) => {
    setRenameVisible(false);
    try {
      await api.updateSubject(subjectId, newName);
      setName(newName);
      invalidate(cacheKeys.subjects); // dashboard + subjects list titles
      invalidate(cacheKeys.subject(subjectId));
    } catch (e) {
      Alert.alert('Nie udało się zmienić nazwy', String(e));
    }
  };

  const deleteSubject = async () => {
    const ok = await confirmAsync(
      'Usunąć przedmiot?',
      `„${name}" wraz z lekcjami, fiszkami i ocenami zostanie trwale usunięty.`,
    );
    if (!ok) return;
    try {
      await api.deleteSubject(subjectId);
      invalidate(cacheKeys.subjects);
      invalidate(cacheKeys.subject(subjectId));
      invalidate(cacheKeys.dailySummary);
      invalidate(cacheKeys.dashboardGrades);
      invalidate(cacheKeys.dashboardFallbackLessons);
      navigation.goBack();
    } catch (e) {
      Alert.alert('Nie udało się usunąć przedmiotu', String(e));
    }
  };

  const submitPastedSyllabus = async (text: string) => {
    try {
      const uploadResult = await api.uploadSyllabusText(subjectId, text);
      setPasteVisible(false);
      onSyllabusLoaded(uploadResult.draftComponents.length);
    } catch (e) {
      Alert.alert('Nie udało się wczytać tekstu', String(e));
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.surface.app }}>
      <View
        style={{
          flex: 1,
          width: '100%',
          maxWidth: theme.layout.contentMaxWidth,
          alignSelf: 'center',
        }}
      >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing[2],
          paddingHorizontal: theme.spacing[4],
          paddingTop: theme.spacing[4],
        }}
      >
        <Text.HeadlineLg style={{ flex: 1 }}>{name}</Text.HeadlineLg>
        <TouchableOpacity
          onPress={() => setRenameVisible(true)}
          accessibilityRole="button"
          accessibilityLabel="Zmień nazwę przedmiotu"
          hitSlop={8}
          style={{ padding: theme.spacing[1] }}
        >
          <Pencil size={20} color={theme.colors.text.secondary} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={deleteSubject}
          accessibilityRole="button"
          accessibilityLabel="Usuń przedmiot"
          hitSlop={8}
          style={{ padding: theme.spacing[1] }}
        >
          <Trash2 size={20} color={theme.colors.status.danger} />
        </TouchableOpacity>
      </View>

      <View
        style={{
          flexDirection: 'row',
          margin: theme.spacing[4],
          backgroundColor: theme.colors.surface.sunken,
          borderRadius: theme.radius.md,
          padding: theme.spacing[1],
        }}
      >
        <Pressable
          style={{
            flex: 1,
            paddingVertical: theme.spacing[2],
            borderRadius: theme.radius.sm,
            alignItems: 'center',
            backgroundColor: tab === 'lessons' ? theme.colors.brand.default : 'transparent',
          }}
          onPress={() => setTab('lessons')}
        >
          <Text.BodySm
            style={{
              fontFamily: theme.font.family.sansSemibold,
              color: tab === 'lessons' ? theme.colors.brand.onBrand : theme.colors.text.secondary,
            }}
          >
            Lekcje
          </Text.BodySm>
        </Pressable>
        <Pressable
          style={{
            flex: 1,
            paddingVertical: theme.spacing[2],
            borderRadius: theme.radius.sm,
            alignItems: 'center',
            backgroundColor: tab === 'grades' ? theme.colors.brand.default : 'transparent',
          }}
          onPress={() => setTab('grades')}
        >
          <Text.BodySm
            style={{
              fontFamily: theme.font.family.sansSemibold,
              color: tab === 'grades' ? theme.colors.brand.onBrand : theme.colors.text.secondary,
            }}
          >
            Arkusz ocen
          </Text.BodySm>
        </Pressable>
      </View>

      {tab === 'lessons' ? (
        <>
          {lessons === null ? (
            <ActivityIndicator style={{ marginTop: theme.spacing[8] }} />
          ) : (
            <FlatList
              data={lessons}
              keyExtractor={(l) => l.id}
              contentContainerStyle={{ padding: theme.spacing[4], gap: theme.spacing[3] }}
              ListEmptyComponent={
                <Text.Body
                  style={{
                    color: theme.colors.text.tertiary,
                    textAlign: 'center',
                    marginTop: theme.spacing[6],
                  }}
                >
                  Brak lekcji — dodaj pierwszą poniżej.
                </Text.Body>
              }
              renderItem={({ item }) => (
                <Pressable
                  style={{
                    backgroundColor: theme.colors.surface.sunken,
                    borderRadius: theme.radius.md,
                    padding: theme.spacing[4],
                  }}
                  onPress={() =>
                    navigation.navigate('Lesson', { lessonId: item.id, lessonTitle: item.title })
                  }
                >
                  <Text.BodyLg style={{ fontFamily: theme.font.family.sansSemibold }}>
                    {item.title}
                  </Text.BodyLg>
                  <Text.BodySm style={{ color: theme.colors.text.secondary, marginTop: theme.spacing[1] }}>
                    {item.flashcardCount} fiszek
                  </Text.BodySm>
                </Pressable>
              )}
            />
          )}

          <Pressable
            style={{
              position: 'absolute',
              right: theme.spacing[5],
              bottom: theme.spacing[6],
              width: 56,
              height: 56,
              borderRadius: theme.radius.full,
              backgroundColor: theme.colors.brand.default,
              alignItems: 'center',
              justifyContent: 'center',
              ...theme.shadows.md,
            }}
            onPress={() => setCreateVisible(true)}
          >
            <Plus size={26} color={theme.colors.brand.onBrand} strokeWidth={2.5} />
          </Pressable>

          <CreateLessonModal
            visible={createVisible}
            onClose={() => setCreateVisible(false)}
            onSubmit={async (title) => {
              await api.createLesson(subjectId, title);
              setCreateVisible(false);
              invalidate(cacheKeys.subjectLessons(subjectId));
              invalidate(cacheKeys.subjects); // lessonCount on the dashboard
            }}
          />
        </>
      ) : (
        <View style={{ flex: 1 }}>
          <View style={{ marginHorizontal: theme.spacing[4], marginTop: theme.spacing[3] }}>
            <Button
              title="Wgraj zasady zaliczenia"
              icon={Upload}
              variant="ghost"
              fullWidth
              onPress={() => setSyllabusChooserVisible(true)}
            />
          </View>

          <GradeSheet subjectId={subjectId} />

          <SyllabusChooserModal
            visible={syllabusChooserVisible}
            onClose={() => setSyllabusChooserVisible(false)}
            onPickFile={() => {
              setSyllabusChooserVisible(false);
              pickSyllabusFile();
            }}
            onPasteText={() => {
              setSyllabusChooserVisible(false);
              setPasteVisible(true);
            }}
          />

          <PasteSyllabusModal
            visible={pasteVisible}
            onClose={() => setPasteVisible(false)}
            onSubmit={submitPastedSyllabus}
          />
        </View>
      )}

      <RenameModal
        visible={renameVisible}
        title="Zmień nazwę przedmiotu"
        label="Nazwa przedmiotu"
        initialValue={name}
        onClose={() => setRenameVisible(false)}
        onSubmit={renameSubject}
      />
      </View>
    </View>
  );
}

function SyllabusChooserModal({
  visible,
  onClose,
  onPickFile,
  onPasteText,
}: {
  visible: boolean;
  onClose: () => void;
  onPickFile: () => void;
  onPasteText: () => void;
}) {
  return (
    <ModalSheet visible={visible} onClose={onClose} title="Wgraj zasady zaliczenia">
      <Pressable
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing[3],
          borderWidth: 1,
          borderColor: theme.colors.border.default,
          borderRadius: theme.radius.md,
          padding: theme.spacing[4],
        }}
        onPress={onPickFile}
      >
        <FileUp size={28} color={theme.colors.text.accent} />
        <View style={{ flex: 1 }}>
          <Text.Body style={{ fontFamily: theme.font.family.sansBold }}>Wgraj plik z dysku</Text.Body>
          <Text.Caption style={{ marginTop: theme.spacing[1] }}>PDF lub Word (.docx)</Text.Caption>
        </View>
      </Pressable>
      <Pressable
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing[3],
          borderWidth: 1,
          borderColor: theme.colors.border.default,
          borderRadius: theme.radius.md,
          padding: theme.spacing[4],
        }}
        onPress={onPasteText}
      >
        <ClipboardPaste size={28} color={theme.colors.text.accent} />
        <View style={{ flex: 1 }}>
          <Text.Body style={{ fontFamily: theme.font.family.sansBold }}>Wklej tekst</Text.Body>
          <Text.Caption style={{ marginTop: theme.spacing[1] }}>
            Skopiuj zasady z maila lub strony
          </Text.Caption>
        </View>
      </Pressable>
    </ModalSheet>
  );
}

function PasteSyllabusModal({
  visible,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  onClose: () => void;
  onSubmit: (text: string) => void;
}) {
  const [text, setText] = useState('');

  return (
    <ModalSheet visible={visible} onClose={onClose} title="Wklej zasady zaliczenia">
      <TextField
        multiline
        textAlignVertical="top"
        placeholder="Wklej tutaj treść zasad zaliczenia…"
        value={text}
        onChangeText={setText}
        style={{ minHeight: 160 }}
      />
      <Button
        title="Analizuj"
        disabled={!text.trim()}
        onPress={() => text.trim() && onSubmit(text.trim())}
        fullWidth
      />
    </ModalSheet>
  );
}

function CreateLessonModal({
  visible,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  onClose: () => void;
  onSubmit: (title: string) => void;
}) {
  const [title, setTitle] = useState('');

  return (
    <ModalSheet visible={visible} onClose={onClose} title="Nowa lekcja">
      <TextField placeholder="Tytuł lekcji" value={title} onChangeText={setTitle} />
      <Button title="Utwórz" onPress={() => title.trim() && onSubmit(title.trim())} fullWidth />
    </ModalSheet>
  );
}
