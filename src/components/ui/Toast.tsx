import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { useToast } from '../../hooks/useToast';
import { ToastItem } from '../../types';

const TYPE_COLORS: Record<ToastItem['type'], string> = {
  success: '#22c55e',
  error: '#ef4444',
  warning: '#f59e0b',
  info: '#3b82f6',
};

function Toast({ item }: { item: ToastItem }) {
  const hide = useToast((s) => s.hide);

  return (
    <Animated.View
      entering={FadeInUp}
      exiting={FadeOutUp}
      style={[styles.toast, { backgroundColor: TYPE_COLORS[item.type] }]}
    >
      <Text style={styles.message}>{item.message}</Text>
      <TouchableOpacity onPress={() => hide(item.id)} hitSlop={8}>
        <Text style={styles.close}>✕</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

export function ToastContainer() {
  const toasts = useToast((s) => s.toasts);

  return (
    <View style={styles.container} pointerEvents="box-none">
      {toasts.map((item) => (
        <Toast key={item.id} item={item} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingTop: 52,
    paddingHorizontal: 16,
    zIndex: 9999,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  message: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
    marginRight: 8,
  },
  close: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
});
