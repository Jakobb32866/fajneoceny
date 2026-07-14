import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { api } from '../api/client';
import type { GradeCategory, SubjectGradesResponse } from '../api/types';

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

export function GradeSheet({ subjectId }: { subjectId: string }) {
  const [grades, setGrades] = useState<SubjectGradesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [addComponentVisible, setAddComponentVisible] = useState(false);
  const [entryModalComponentId, setEntryModalComponentId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setGrades(await api.getGrades(subjectId));
    } catch {
      setGrades({ currentEstimatePercent: null, provisionalFinalPercent: 0, totalWeightPercent: 0, components: [] });
    } finally {
      setLoading(false);
    }
  }, [subjectId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading || !grades) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.summaryRow}>
        <View style={styles.summaryBox}>
          <Text style={styles.summaryLabel}>Ocena bieżąca</Text>
          <Text style={styles.summaryValue}>{formatPercent(grades.currentEstimatePercent)}</Text>
        </View>
        <View style={styles.summaryBox}>
          <Text style={styles.summaryLabel}>Prognoza końcowa</Text>
          <Text style={styles.summaryValue}>{grades.provisionalFinalPercent.toFixed(1)}%</Text>
        </View>
        <View style={styles.summaryBox}>
          <Text style={styles.summaryLabel}>Suma wag</Text>
          <Text style={styles.summaryValue}>{grades.totalWeightPercent.toFixed(0)}%</Text>
        </View>
      </View>

      <ScrollView style={styles.table}>
        <View style={[styles.row, styles.headerRow]}>
          <Text style={[styles.cell, styles.headerCell, { flex: 2 }]}>Składnik</Text>
          <Text style={[styles.cell, styles.headerCell]}>Waga</Text>
          <Text style={[styles.cell, styles.headerCell]}>Średnia</Text>
        </View>

        {grades.components.map((component) => (
          <View key={component.id}>
            <View style={styles.row}>
              <Text style={[styles.cell, { flex: 2 }]}>
                {component.name}
                {component.isAdHoc ? ' *' : ''}
              </Text>
              <Text style={styles.cell}>{component.weightPercent.toFixed(0)}%</Text>
              <Text style={styles.cell}>{formatPercent(component.averageScorePercent)}</Text>
            </View>

            {component.entries.map((entry) => (
              <View key={entry.id} style={styles.entryRow}>
                <Text style={[styles.entryText, { flex: 2 }]}>{entry.name}</Text>
                <Text style={styles.entryText}>
                  {entry.score}/{entry.maxScore}
                </Text>
                <TouchableOpacity onPress={() => api.deleteGradeEntry(entry.id).then(load)}>
                  <Text style={styles.deleteText}>usuń</Text>
                </TouchableOpacity>
              </View>
            ))}

            <TouchableOpacity style={styles.addEntryButton} onPress={() => setEntryModalComponentId(component.id)}>
              <Text style={styles.addEntryText}>+ dodaj ocenę</Text>
            </TouchableOpacity>
          </View>
        ))}

        <Text style={styles.legend}>* dodane ręcznie (poza pierwotnymi zasadami zaliczenia)</Text>
      </ScrollView>

      <TouchableOpacity style={styles.addComponentButton} onPress={() => setAddComponentVisible(true)}>
        <Text style={styles.addComponentText}>+ Dodaj nowy składnik oceny</Text>
      </TouchableOpacity>

      <AddComponentModal
        visible={addComponentVisible}
        onClose={() => setAddComponentVisible(false)}
        onSubmit={async (name, category, weight) => {
          await api.addGradingComponent(subjectId, name, category, weight);
          setAddComponentVisible(false);
          load();
        }}
      />

      <AddEntryModal
        visible={entryModalComponentId !== null}
        onClose={() => setEntryModalComponentId(null)}
        onSubmit={async (name, score, maxScore) => {
          if (!entryModalComponentId) return;
          await api.addGradeEntry(entryModalComponentId, name, score, maxScore);
          setEntryModalComponentId(null);
          load();
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
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.modalTitle}>Nowy składnik oceny</Text>
          <TextInput style={styles.input} placeholder="Nazwa (np. Kartkówka 3)" value={name} onChangeText={setName} />
          <View style={styles.chipRow}>
            {CATEGORIES.map((c) => (
              <TouchableOpacity
                key={c}
                style={[styles.chip, category === c && styles.chipSelected]}
                onPress={() => setCategory(c)}
              >
                <Text style={category === c ? styles.chipTextSelected : styles.chipText}>{CATEGORY_LABELS[c]}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TextInput
            style={styles.input}
            placeholder="Waga w % (np. 10)"
            keyboardType="numeric"
            value={weight}
            onChangeText={setWeight}
          />
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          <TouchableOpacity
            style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
            disabled={submitting}
            onPress={submit}
          >
            <Text style={styles.submitText}>{submitting ? 'Dodawanie…' : 'Dodaj'}</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
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
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.modalTitle}>Nowa ocena</Text>
          <TextInput style={styles.input} placeholder="Nazwa (np. Zadanie 2)" value={name} onChangeText={setName} />
          <TextInput style={styles.input} placeholder="Wynik" keyboardType="numeric" value={score} onChangeText={setScore} />
          <TextInput
            style={styles.input}
            placeholder="Maksymalny wynik"
            keyboardType="numeric"
            value={maxScore}
            onChangeText={setMaxScore}
          />
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          <TouchableOpacity
            style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
            disabled={submitting}
            onPress={submit}
          >
            <Text style={styles.submitText}>{submitting ? 'Dodawanie…' : 'Dodaj'}</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  summaryRow: { flexDirection: 'row', gap: 8, padding: 16 },
  summaryBox: { flex: 1, backgroundColor: '#f2f4f7', borderRadius: 12, padding: 12, alignItems: 'center' },
  summaryLabel: { fontSize: 11, color: '#666' },
  summaryValue: { fontSize: 18, fontWeight: '700', marginTop: 4 },
  table: { flex: 1, paddingHorizontal: 16 },
  row: { flexDirection: 'row', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#ddd' },
  headerRow: { borderBottomWidth: 1, borderColor: '#999' },
  cell: { flex: 1, fontSize: 14 },
  headerCell: { fontWeight: '700', color: '#444' },
  entryRow: { flexDirection: 'row', paddingLeft: 12, paddingVertical: 6, alignItems: 'center' },
  entryText: { flex: 1, fontSize: 13, color: '#555' },
  deleteText: { color: '#c0392b', fontSize: 12 },
  addEntryButton: { paddingLeft: 12, paddingVertical: 6 },
  addEntryText: { color: '#2563eb', fontSize: 13 },
  legend: { fontSize: 11, color: '#999', marginVertical: 12 },
  addComponentButton: { margin: 16, backgroundColor: '#111827', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  addComponentText: { color: 'white', fontWeight: '600' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 24 },
  modalCard: { backgroundColor: 'white', borderRadius: 16, padding: 20, gap: 12 },
  modalTitle: { fontSize: 17, fontWeight: '700' },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 10, fontSize: 14 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: '#f2f4f7' },
  chipSelected: { backgroundColor: '#111827' },
  chipText: { fontSize: 12, color: '#333' },
  chipTextSelected: { fontSize: 12, color: 'white' },
  submitButton: { backgroundColor: '#111827', borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 4 },
  submitButtonDisabled: { backgroundColor: '#9ca3af' },
  submitText: { color: 'white', fontWeight: '700' },
  errorText: { color: '#dc2626', fontSize: 13 },
});
