import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, View } from 'react-native';
import { ChevronRight, GraduationCap, Search } from 'lucide-react-native';
import { cacheKeys } from '../api/cacheKeys';
import { api } from '../api/client';
import { useCachedQuery } from '../hooks/useCachedQuery';
import { Text } from './ui/Text';
import { TextField } from './ui/Input';
import { ModalSheet } from './ui/ModalSheet';
import { theme } from '../theme';
import type { UniversityDto } from '../api/types';

export interface UniversityPickerValue {
  universityId: string | null;
  schoolName: string;
}

interface UniversityPickerProps {
  value: UniversityPickerValue;
  onChange: (value: UniversityPickerValue) => void;
  label?: string;
  /** Whether the "Inna szkoła" free-text option is offered. Defaults to true. */
  allowFreeText?: boolean;
}

/**
 * Pressable field ("Uczelnia / szkoła") that opens a modal to search the
 * curated university list, or (when allowed) type a free-text school name.
 */
export function UniversityPicker({ value, onChange, label = 'Uczelnia / szkoła', allowFreeText = true }: UniversityPickerProps) {
  const [modalVisible, setModalVisible] = useState(false);
  const [query, setQuery] = useState('');
  const [freeTextMode, setFreeTextMode] = useState(false);
  const [freeTextDraft, setFreeTextDraft] = useState('');

  const { data: universities, loading, error } = useCachedQuery(cacheKeys.universities, api.listUniversities);

  const filtered = useMemo(() => {
    const list = universities ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (u) => u.name.toLowerCase().includes(q) || (u.shortName ?? '').toLowerCase().includes(q),
    );
  }, [universities, query]);

  const displayLabel = value.universityId
    ? (universities ?? []).find((u) => u.id === value.universityId)?.name ?? value.schoolName
    : value.schoolName;

  function openModal() {
    setQuery('');
    setFreeTextMode(false);
    setFreeTextDraft(value.universityId ? '' : value.schoolName);
    setModalVisible(true);
  }

  function pickUniversity(u: UniversityDto) {
    onChange({ universityId: u.id, schoolName: u.name });
    setModalVisible(false);
  }

  function confirmFreeText() {
    const text = freeTextDraft.trim();
    if (!text) return;
    onChange({ universityId: null, schoolName: text });
    setModalVisible(false);
  }

  // Fallback when the university list can't be loaded: free text only.
  const showFreeTextOnly = allowFreeText && !!error;

  return (
    <View style={{ gap: theme.spacing[1] }}>
      {label ? <Text.Caption style={{ color: theme.colors.text.secondary }}>{label}</Text.Caption> : null}
      <Pressable
        onPress={openModal}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing[2],
          borderWidth: 1,
          borderColor: theme.colors.border.default,
          borderRadius: theme.radius.sm,
          paddingVertical: theme.spacing[3],
          paddingHorizontal: theme.spacing[3],
          backgroundColor: theme.colors.surface.card,
        }}
      >
        <GraduationCap size={18} color={theme.colors.text.tertiary} />
        <Text.Body
          style={{
            flex: 1,
            color: displayLabel ? theme.colors.text.primary : theme.colors.text.tertiary,
          }}
          numberOfLines={1}
        >
          {displayLabel || (allowFreeText ? 'Wybierz uczelnię lub wpisz nazwę szkoły' : 'Wybierz uczelnię')}
        </Text.Body>
        <ChevronRight size={18} color={theme.colors.text.tertiary} />
      </Pressable>

      <ModalSheet visible={modalVisible} onClose={() => setModalVisible(false)} title="Uczelnia / szkoła">
        {showFreeTextOnly || freeTextMode ? (
          <>
            {showFreeTextOnly ? (
              <Text.BodySm style={{ color: theme.colors.text.tertiary }}>
                Nie udało się wczytać listy uczelni — wpisz nazwę swojej szkoły.
              </Text.BodySm>
            ) : null}
            <TextField
              label="Nazwa szkoły"
              placeholder="np. Liceum Ogólnokształcące nr 1"
              value={freeTextDraft}
              onChangeText={setFreeTextDraft}
              autoCapitalize="words"
              autoFocus
            />
            <Pressable onPress={confirmFreeText} style={{ paddingVertical: theme.spacing[2] }}>
              <Text.Body
                style={{
                  color: freeTextDraft.trim() ? theme.colors.text.accent : theme.colors.text.tertiary,
                  fontFamily: theme.font.family.sansSemibold,
                }}
              >
                Zapisz
              </Text.Body>
            </Pressable>
            {!showFreeTextOnly ? (
              <Pressable onPress={() => setFreeTextMode(false)} style={{ paddingVertical: theme.spacing[1] }}>
                <Text.BodySm style={{ color: theme.colors.text.secondary }}>Wróć do listy uczelni</Text.BodySm>
              </Pressable>
            ) : null}
          </>
        ) : (
          <>
            <TextField
              placeholder="Szukaj uczelni…"
              value={query}
              onChangeText={setQuery}
              autoCapitalize="none"
            />
            {loading ? (
              <ActivityIndicator style={{ marginVertical: theme.spacing[4] }} />
            ) : (
              <FlatList
                data={filtered}
                keyExtractor={(u) => u.id}
                style={{ maxHeight: 320 }}
                keyboardShouldPersistTaps="handled"
                ListEmptyComponent={
                  <Text.BodySm style={{ color: theme.colors.text.tertiary, paddingVertical: theme.spacing[3] }}>
                    Brak wyników.
                  </Text.BodySm>
                }
                renderItem={({ item }) => (
                  <Pressable
                    onPress={() => pickUniversity(item)}
                    style={{
                      paddingVertical: theme.spacing[3],
                      borderBottomWidth: 1,
                      borderBottomColor: theme.colors.border.default,
                    }}
                  >
                    <Text.Body>{item.name}</Text.Body>
                    {item.shortName ? (
                      <Text.Caption style={{ marginTop: 2 }}>{item.shortName}</Text.Caption>
                    ) : null}
                  </Pressable>
                )}
              />
            )}
            {allowFreeText ? (
              <Pressable
                onPress={() => {
                  setFreeTextDraft(value.universityId ? '' : value.schoolName);
                  setFreeTextMode(true);
                }}
                style={{ paddingVertical: theme.spacing[3] }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing[2] }}>
                  <Search size={16} color={theme.colors.text.accent} />
                  <Text.Body style={{ color: theme.colors.text.accent, fontFamily: theme.font.family.sansSemibold }}>
                    Inna szkoła — wpisz nazwę
                  </Text.Body>
                </View>
              </Pressable>
            ) : null}
          </>
        )}
      </ModalSheet>
    </View>
  );
}
