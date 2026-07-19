import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import { invalidate } from '../api/cache';
import { cacheKeys } from '../api/cacheKeys';
import { api } from '../api/client';
import { useCachedQuery } from '../hooks/useCachedQuery';
import type { GradeCategory, SubjectGradesResponse } from '../api/types';
import { theme } from '../theme';
import { Badge, type BadgeVariant } from './ui/Badge';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { Chip } from './ui/Chip';
import { TextField } from './ui/Input';
import { ModalSheet } from './ui/ModalSheet';
import { Text } from './ui/Text';

const CATEGORIES: GradeCategory[] = ['Project', 'Exam', 'Homework', 'Other'];
const CATEGORY_LABELS: Record<GradeCategory, string> = {
  Project: 'Projekt',
  Exam: 'Kolokwium/Egzamin',
  Homework: 'Zadanie domowe',
  Other: 'Inne',
};

function formatPercent(value: number | null): string {
  return value === null ? '—' : `${value.toFixed(1)}%`;
}

/** Parse a number allowing the Polish decimal comma (e.g. "4,5" → 4.5). */
function parseNumber(text: string): number {
  return Number(text.replace(',', '.').trim());
}

/**
 * Polish-school grading thresholds: >=70% is a comfortably passing/good
 * result (success), 50-69% is borderline (warning), below 50% is failing
 * (danger). Used for both the summary figure color and the per-component
 * average Badge.
 */
function gradeColor(percent: number | null): string {
  if (percent === null) return theme.colors.text.tertiary;
  if (percent >= 70) return theme.colors.status.success;
  if (percent >= 50) return theme.colors.status.warning;
  return theme.colors.status.danger;
}

function gradeBadgeVariant(percent: number | null): BadgeVariant {
  if (percent === null) return 'neutral';
  if (percent >= 70) return 'success';
  if (percent >= 50) return 'warning';
  return 'danger';
}

export function GradeSheet({ subjectId }: { subjectId: string }) {
  const [addComponentVisible, setAddComponentVisible] = useState(false);
  const [entryModalComponentId, setEntryModalComponentId] = useState<string | null>(null);

  const gradesQuery = useCachedQuery<SubjectGradesResponse>(cacheKeys.subjectGrades(subjectId), () =>
    api.getGrades(subjectId),
  );

  const EMPTY: SubjectGradesResponse = {
    currentEstimatePercent: null,
    provisionalFinalPercent: 0,
    totalWeightPercent: 0,
    components: [],
  };
  const grades = gradesQuery.data ?? (gradesQuery.error ? EMPTY : null);

  // Every grade write also moves the subject's estimate, which the dashboard
  // list renders — so the subject list has to be invalidated alongside.
  const invalidateGrades = () => {
    invalidate(cacheKeys.subjectGrades(subjectId));
    invalidate(cacheKeys.subjects);
  };

  if (!grades) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <Card elevated style={{ margin: theme.spacing[4], gap: theme.spacing[3] }}>
        <View>
          <Text.Caption>Ocena bieżąca</Text.Caption>
          <Text.Mono
            style={{
              fontSize: theme.font.size.display,
              fontFamily: theme.font.family.monoMedium,
              color: gradeColor(grades.currentEstimatePercent),
            }}
          >
            {formatPercent(grades.currentEstimatePercent)}
          </Text.Mono>
        </View>

        <View style={{ flexDirection: 'row', gap: theme.spacing[6] }}>
          <View>
            <Text.Caption>Prognoza końcowa</Text.Caption>
            <Text.Mono
              style={{
                fontSize: theme.font.size.title,
                color: gradeColor(grades.provisionalFinalPercent),
              }}
            >
              {grades.provisionalFinalPercent.toFixed(1)}%
            </Text.Mono>
          </View>
          <View>
            <Text.Caption>Suma wag</Text.Caption>
            <Text.Mono style={{ fontSize: theme.font.size.title }}>{grades.totalWeightPercent.toFixed(0)}%</Text.Mono>
          </View>
        </View>
      </Card>

      <ScrollView contentContainerStyle={{ paddingHorizontal: theme.spacing[4], gap: theme.spacing[3], paddingBottom: theme.spacing[4] }}>
        {grades.components.map((component) => (
          <Card key={component.id}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <View style={{ flex: 1, marginRight: theme.spacing[3] }}>
                <Text.BodyLg style={{ fontFamily: theme.font.family.sansSemibold }}>
                  {component.name}
                  {component.isAdHoc ? ' *' : ''}
                </Text.BodyLg>
                <Text.BodySm style={{ color: theme.colors.text.secondary, marginTop: theme.spacing[1] }}>
                  {CATEGORY_LABELS[component.category]} · waga {component.weightPercent.toFixed(0)}%
                </Text.BodySm>
              </View>
              <Badge label={formatPercent(component.averageScorePercent)} variant={gradeBadgeVariant(component.averageScorePercent)} />
            </View>

            {component.entries.length > 0 ? (
              <View style={{ marginTop: theme.spacing[3] }}>
                {component.entries.map((entry, index) => (
                  <View key={entry.id}>
                    {index > 0 ? <View style={{ height: 1, backgroundColor: theme.colors.border.default }} /> : null}
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        paddingVertical: theme.spacing[2],
                      }}
                    >
                      <Text.BodySm style={{ flex: 1, color: theme.colors.text.secondary }}>{entry.name}</Text.BodySm>
                      <Text.Mono style={{ color: theme.colors.text.secondary, marginRight: theme.spacing[3] }}>
                        {entry.score}/{entry.maxScore}
                      </Text.Mono>
                      <Pressable onPress={() => api.deleteGradeEntry(entry.id).then(invalidateGrades)}>
                        <Text.Caption style={{ color: theme.colors.status.danger }}>usuń</Text.Caption>
                      </Pressable>
                    </View>
                  </View>
                ))}
              </View>
            ) : null}

            <View style={{ marginTop: theme.spacing[3] }}>
              <Button
                title="+ dodaj ocenę"
                variant="ghost"
                size="sm"
                onPress={() => setEntryModalComponentId(component.id)}
              />
            </View>
          </Card>
        ))}

        <Text.Caption style={{ color: theme.colors.text.tertiary }}>
          * dodane ręcznie (poza pierwotnymi zasadami zaliczenia)
        </Text.Caption>

        <Button title="+ Dodaj nowy składnik oceny" onPress={() => setAddComponentVisible(true)} fullWidth />
      </ScrollView>

      <AddComponentModal
        visible={addComponentVisible}
        onClose={() => setAddComponentVisible(false)}
        onSubmit={async (name, category, weight) => {
          await api.addGradingComponent(subjectId, name, category, weight);
          setAddComponentVisible(false);
          invalidateGrades();
        }}
      />

      <AddEntryModal
        visible={entryModalComponentId !== null}
        onClose={() => setEntryModalComponentId(null)}
        onSubmit={async (name, score, maxScore) => {
          if (!entryModalComponentId) return;
          await api.addGradeEntry(entryModalComponentId, name, score, maxScore);
          setEntryModalComponentId(null);
          invalidateGrades();
        }}
      />
    </View>
  );
}

function AddComponentModal({
  visible,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  onClose: () => void;
  onSubmit: (name: string, category: GradeCategory, weight: number) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState<GradeCategory>('Homework');
  const [weight, setWeight] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    const w = parseNumber(weight);
    if (!name.trim() || Number.isNaN(w) || w <= 0) {
      setError('Podaj nazwę i wagę (liczbę większą od 0).');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await onSubmit(name.trim(), category, w);
      setName('');
      setWeight('');
    } catch {
      setError('Nie udało się dodać składnika. Sprawdź połączenie i spróbuj ponownie.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalSheet visible={visible} onClose={onClose} title="Nowy składnik oceny">
      <TextField placeholder="Nazwa (np. Kartkówka 3)" value={name} onChangeText={setName} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing[2] }}>
        {CATEGORIES.map((c) => (
          <Chip key={c} label={CATEGORY_LABELS[c]} selected={category === c} onPress={() => setCategory(c)} />
        ))}
      </View>
      <TextField placeholder="Waga w % (np. 10)" keyboardType="numeric" value={weight} onChangeText={setWeight} />
      {error ? <Text.BodySm style={{ color: theme.colors.status.danger }}>{error}</Text.BodySm> : null}
      <Button title="Dodaj" onPress={submit} loading={submitting} fullWidth />
    </ModalSheet>
  );
}

function AddEntryModal({
  visible,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  onClose: () => void;
  onSubmit: (name: string, score: number, maxScore: number) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [score, setScore] = useState('');
  const [maxScore, setMaxScore] = useState('100');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    const s = parseNumber(score);
    const m = parseNumber(maxScore);
    if (!name.trim() || Number.isNaN(s) || Number.isNaN(m) || m <= 0) {
      setError('Podaj nazwę, wynik i maksymalny wynik (liczbę większą od 0).');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await onSubmit(name.trim(), s, m);
      setName('');
      setScore('');
      setMaxScore('100');
    } catch {
      setError('Nie udało się dodać oceny. Sprawdź połączenie i spróbuj ponownie.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalSheet visible={visible} onClose={onClose} title="Nowa ocena">
      <TextField placeholder="Nazwa (np. Zadanie 2)" value={name} onChangeText={setName} />
      <TextField placeholder="Wynik" keyboardType="numeric" value={score} onChangeText={setScore} />
      <TextField placeholder="Maksymalny wynik" keyboardType="numeric" value={maxScore} onChangeText={setMaxScore} />
      {error ? <Text.BodySm style={{ color: theme.colors.status.danger }}>{error}</Text.BodySm> : null}
      <Button title="Dodaj" onPress={submit} loading={submitting} fullWidth />
    </ModalSheet>
  );
}
