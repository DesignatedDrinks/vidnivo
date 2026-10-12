import React from 'react';
import { ScrollView, Pressable, Text, View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export type EditorAction = {
  id: string;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  onPress: () => void;
  disabled?: boolean;
  hint?: string;
};

const palette = {
  text: '#F2F3F5',
  muted: '#91959C',
  cyan: '#23D4E9',
  surface: '#17191C',
};

export function EditorRail({ actions, selectedId }: {
  actions: EditorAction[];
  selectedId?: string;
}) {
  return (
    <View style={styles.wrapper}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="always" contentContainerStyle={styles.scrollContent}>
        {actions.map(action => (
          <Pressable key={action.id} onPress={action.onPress} disabled={action.disabled}
            accessibilityRole="button" accessibilityLabel={action.label}
            style={[styles.action, action.disabled && styles.disabled]}>
            <Ionicons name={action.icon} size={27}
              color={selectedId === action.id ? palette.cyan : palette.text} />
            {action.hint ? <View style={styles.hint}><Text style={styles.hintText}>{action.hint}</Text></View> : null}
            <Text numberOfLines={1} style={[styles.label, selectedId === action.id && { color: palette.cyan }]}>
              {action.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#292C30',
    backgroundColor: '#141518', height: 82 },
  scrollContent: { paddingHorizontal: 8, alignItems: 'center', gap: 2 },
  action: { width: 72, height: 70, alignItems: 'center', justifyContent: 'center',
    gap: 7, position: 'relative' },
  disabled: { opacity: 0.34 },
  label: { color: palette.text, fontSize: 11, fontWeight: '500' },
  hint: { position: 'absolute', backgroundColor: palette.cyan, borderRadius: 4,
    paddingVertical: 1, paddingHorizontal: 5, top: 2, right: 2 },
  hintText: { color: '#082129', fontSize: 8, fontWeight: '800' }
});
