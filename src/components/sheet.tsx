import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../state/store';
import type { IconName } from '../lib/icons';
import { Icon, IconButton, T } from './ui';

/** Bottom sheet (the mobile counterpart of the web app's menus and dialogs). */
export function Sheet({ visible, onClose, title, children }: { visible: boolean; onClose: () => void; title?: string; children: ReactNode }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close"
          style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(15,17,28,0.48)' }} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={{ backgroundColor: t.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 20, paddingTop: 10, paddingBottom: insets.bottom + 20, gap: 14 }}>
            <View style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: t.surface3 }} />
            {title ? (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <T size={20} weight="extrabold" style={{ flex: 1 }}>{title}</T>
                <IconButton name="x" label="Close" onPress={onClose} />
              </View>
            ) : null}
            {children}
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

/** One tappable row in a sheet menu. */
export function SheetItem({ icon, label, onPress, danger }: { icon: IconName; label: string; onPress: () => void; danger?: boolean }) {
  const t = useTheme();
  const color = danger ? t.danger : t.text;
  return (
    <Pressable onPress={onPress} accessibilityRole="button"
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 52, paddingHorizontal: 12, borderRadius: 12, backgroundColor: pressed ? (danger ? t.dangerSoft : t.surface2) : 'transparent' })}>
      <Icon name={icon} size={20} color={color} />
      <T weight="semibold" style={{ color, flex: 1 }}>{label}</T>
    </Pressable>
  );
}
