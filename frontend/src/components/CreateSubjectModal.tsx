import { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, View } from 'react-native';
import { BookOpen, PencilLine, Square, SquareCheck } from 'lucide-react-native';
import { cacheKeys } from '../api/cacheKeys';
import { api } from '../api/client';
import { useCachedQuery } from '../hooks/useCachedQuery';
import { useAuth } from '../auth/AuthContext';
import { Button } from './ui/Button';
import { TextField } from './ui/Input';
import { ModalSheet } from './ui/ModalSheet';
import { Text } from './ui/Text';
import { theme } from '../theme';
import type { UniversityCourseDto } from '../api/types';

export interface CreateSubjectInput {
  name?: string;
  description?: string;
  universityCourseId?: string;
  proposeAsCourse?: boolean;
}

type Step = 'choice' | 'course' | 'custom';

/** Shared "Nowy przedmiot" dialog, used by the dashboard and the subjects list. */
export function CreateSubjectModal({
  visible,
  onClose,
  onSubmit,
  subscribedCourseIds = [],
}: {
  visible: boolean;
  onClose: () => void;
  onSubmit: (input: CreateSubjectInput) => void;
  /** universityCourseIds the student is already subscribed to, so those rows show as "Już dodany". */
  subscribedCourseIds?: string[];
}) {
  const { user } = useAuth();
  const isRecognised = !!user?.isRecognised;

  const [step, setStep] = useState<Step>(isRecognised ? 'choice' : 'custom');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [proposeAsCourse, setProposeAsCourse] = useState(false);

  const coursesQuery = useCachedQuery(cacheKeys.myCourses, api.listMyCourses, { enabled: step === 'course' });
  const subscribedSet = new Set(subscribedCourseIds);

  function resetAndClose() {
    setStep(isRecognised ? 'choice' : 'custom');
    setName('');
    setDescription('');
    setProposeAsCourse(false);
    onClose();
  }

  function submitCustom() {
    if (!name.trim()) return;
    onSubmit({ name: name.trim(), description: description.trim() || undefined, proposeAsCourse });
    resetAndClose();
  }

  function submitCourse(course: UniversityCourseDto) {
    if (subscribedSet.has(course.id)) return;
    onSubmit({ universityCourseId: course.id });
    resetAndClose();
  }

  const title =
    step === 'choice' ? 'Nowy przedmiot' : step === 'course' ? 'Przedmiot uczelniany' : 'Nowy przedmiot';

  return (
    <ModalSheet visible={visible} onClose={resetAndClose} title={title}>
      {step === 'choice' ? (
        <>
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
            onPress={() => setStep('course')}
          >
            <BookOpen size={28} color={theme.colors.text.accent} />
            <View style={{ flex: 1 }}>
              <Text.Body style={{ fontFamily: theme.font.family.sansBold }}>Przedmiot uczelniany</Text.Body>
              <Text.Caption style={{ marginTop: theme.spacing[1] }}>
                Dołącz do przedmiotu prowadzonego na Twojej uczelni
              </Text.Caption>
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
            onPress={() => setStep('custom')}
          >
            <PencilLine size={28} color={theme.colors.text.accent} />
            <View style={{ flex: 1 }}>
              <Text.Body style={{ fontFamily: theme.font.family.sansBold }}>Własny przedmiot</Text.Body>
              <Text.Caption style={{ marginTop: theme.spacing[1] }}>
                Utwórz przedmiot tylko dla siebie
              </Text.Caption>
            </View>
          </Pressable>
        </>
      ) : step === 'course' ? (
        <>
          {coursesQuery.loading ? (
            <ActivityIndicator style={{ marginVertical: theme.spacing[4] }} />
          ) : (
            <FlatList
              data={coursesQuery.data ?? []}
              keyExtractor={(c) => c.id}
              style={{ maxHeight: 360 }}
              ListEmptyComponent={
                <Text.BodySm style={{ color: theme.colors.text.tertiary, paddingVertical: theme.spacing[3] }}>
                  Brak przedmiotów uczelnianych do wyboru.
                </Text.BodySm>
              }
              renderItem={({ item }) => {
                const subscribed = subscribedSet.has(item.id);
                return (
                  <Pressable
                    disabled={subscribed}
                    onPress={() => submitCourse(item)}
                    style={{
                      paddingVertical: theme.spacing[3],
                      borderBottomWidth: 1,
                      borderBottomColor: theme.colors.border.default,
                      opacity: subscribed ? 0.5 : 1,
                    }}
                  >
                    <Text.Body>{item.code ? `${item.code} — ${item.name}` : item.name}</Text.Body>
                    {subscribed ? (
                      <Text.Caption style={{ marginTop: 2 }}>Już dodany</Text.Caption>
                    ) : null}
                  </Pressable>
                );
              }}
            />
          )}
          <Button title="Wróć" variant="ghost" onPress={() => setStep('choice')} fullWidth />
        </>
      ) : (
        <>
          <TextField
            label="Nazwa przedmiotu"
            placeholder="Nazwa przedmiotu"
            value={name}
            onChangeText={setName}
          />
          <TextField
            label="Opis (opcjonalnie)"
            placeholder="Opis (opcjonalnie)"
            value={description}
            onChangeText={setDescription}
          />
          {isRecognised ? (
            <Pressable
              onPress={() => setProposeAsCourse((v) => !v)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing[2] }}
            >
              {proposeAsCourse ? (
                <SquareCheck size={20} color={theme.colors.text.accent} />
              ) : (
                <Square size={20} color={theme.colors.text.tertiary} />
              )}
              <Text.BodySm style={{ flex: 1 }}>Zgłoś jako brakujący przedmiot uczelniany</Text.BodySm>
            </Pressable>
          ) : null}
          <Button title="Utwórz" onPress={submitCustom} disabled={!name.trim()} fullWidth />
          {isRecognised ? (
            <Button title="Wróć" variant="ghost" onPress={() => setStep('choice')} fullWidth />
          ) : null}
        </>
      )}
    </ModalSheet>
  );
}
