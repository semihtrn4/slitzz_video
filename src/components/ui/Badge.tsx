import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '@/src/constants/colors';

interface BadgeProps {
  text: string;
  variant?: 'default' | 'success' | 'warning' | 'error';
}

export function Badge({ text, variant = 'default' }: BadgeProps) {
  const variantStyles = {
    default: {
      backgroundColor: `${Colors.primary}20`,
      color: Colors.primary,
    },
    success: {
      backgroundColor: `${Colors.success}20`,
      color: Colors.success,
    },
    warning: {
      backgroundColor: `${Colors.warning}20`,
      color: Colors.warning,
    },
    error: {
      backgroundColor: `${Colors.danger}20`,
      color: Colors.danger,
    },
  };

  const { backgroundColor, color } = variantStyles[variant];

  return (
    <View style={[styles.badge, { backgroundColor }]}>
      <Text style={[styles.text, { color }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  text: {
    fontSize: 12,
    fontWeight: '500',
  },
});
