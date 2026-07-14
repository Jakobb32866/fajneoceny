import { Modal, Pressable, type ModalProps } from 'react-native';
import { theme } from '../../theme';
import { Text } from './Text';

interface ModalSheetProps extends Pick<ModalProps, 'visible' | 'onRequestClose'> {
  title?: string;
  onClose: () => void;
  children: React.ReactNode;
}

/**
 * Replaces the modalOverlay/modalCard pair copy-pasted across every screen's
 * "add X" dialog (Dashboard, Subject, Lesson, GradeSheet, DeckEditor).
 */
export function ModalSheet({ visible, onRequestClose, title, onClose, children }: ModalSheetProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onRequestClose ?? onClose}>
      <Pressable
        style={{ flex: 1, backgroundColor: 'rgba(11, 26, 58, 0.45)', justifyContent: 'center', padding: theme.spacing[6] }}
        onPress={onClose}
      >
        <Pressable
          style={{
            backgroundColor: theme.colors.surface.card,
            borderRadius: theme.radius.lg,
            padding: theme.spacing[5],
            gap: theme.spacing[3],
          }}
          onPress={(e) => e.stopPropagation()}
        >
          {title ? <Text.Title>{title}</Text.Title> : null}
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
