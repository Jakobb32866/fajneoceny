import { useState } from 'react';
import { Button } from './ui/Button';
import { TextField } from './ui/Input';
import { ModalSheet } from './ui/ModalSheet';

/** Shared "Nowy przedmiot" dialog, used by the dashboard and the subjects list. */
export function CreateSubjectModal({
  visible,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  onClose: () => void;
  onSubmit: (name: string, description?: string) => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  return (
    <ModalSheet visible={visible} onClose={onClose} title="Nowy przedmiot">
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
      <Button
        title="Utwórz"
        onPress={() => name.trim() && onSubmit(name.trim(), description.trim() || undefined)}
        fullWidth
      />
    </ModalSheet>
  );
}
