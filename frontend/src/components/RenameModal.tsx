import { useEffect, useState } from 'react';
import { Button } from './ui/Button';
import { TextField } from './ui/Input';
import { ModalSheet } from './ui/ModalSheet';

/**
 * Small single-field rename dialog, shared by the lesson and subject screens.
 * Re-seeds from `initialValue` each time it opens so it always reflects the
 * current name rather than a stale edit left over from a previous open.
 */
export function RenameModal({
  visible,
  title,
  label,
  initialValue,
  confirmLabel = 'Zapisz',
  onClose,
  onSubmit,
}: {
  visible: boolean;
  title: string;
  label?: string;
  initialValue: string;
  confirmLabel?: string;
  onClose: () => void;
  onSubmit: (value: string) => void;
}) {
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    if (visible) setValue(initialValue);
  }, [visible, initialValue]);

  return (
    <ModalSheet visible={visible} onClose={onClose} title={title}>
      <TextField label={label} value={value} onChangeText={setValue} autoFocus />
      <Button
        title={confirmLabel}
        disabled={!value.trim()}
        onPress={() => value.trim() && onSubmit(value.trim())}
        fullWidth
      />
    </ModalSheet>
  );
}
