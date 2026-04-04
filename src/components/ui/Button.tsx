import { TouchableOpacity, Text, StyleSheet, ActivityIndicator, ViewStyle, TextStyle, StyleProp } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { Colors } from '@/src/constants/colors';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'small' | 'medium' | 'large';
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  textStyle?: TextStyle;
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'medium',
  disabled = false,
  loading = false,
  icon,
  style,
  textStyle,
}: ButtonProps) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.97, { stiffness: 400, damping: 30 });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { stiffness: 400, damping: 30 });
  };

  const variantStyles = {
    primary: {
      backgroundColor: Colors.primary,
      textColor: '#FFFFFF',
    },
    secondary: {
      backgroundColor: Colors.surface,
      textColor: Colors.textPrimary,
    },
    ghost: {
      backgroundColor: 'transparent',
      textColor: Colors.primary,
    },
  };

  const sizeStyles = {
    small: {
      height: 36,
      paddingHorizontal: 16,
      fontSize: 14,
    },
    medium: {
      height: 44,
      paddingHorizontal: 20,
      fontSize: 15,
    },
    large: {
      height: 52,
      paddingHorizontal: 24,
      fontSize: 17,
    },
  };

  const { backgroundColor, textColor } = variantStyles[variant];
  const { height, paddingHorizontal, fontSize } = sizeStyles[size];

  return (
    <Animated.View style={[animatedStyle, style]}>
      <TouchableOpacity
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled || loading}
        activeOpacity={0.8}
        style={[
          styles.button,
          {
            backgroundColor,
            height,
            paddingHorizontal,
            borderRadius: 12,
            borderWidth: variant === 'secondary' ? 1 : 0,
            borderColor: Colors.border,
            opacity: disabled ? 0.5 : 1,
          },
        ]}
      >
        {loading ? (
          <ActivityIndicator color={textColor} />
        ) : (
          <>
            {icon}
            <Text
              style={[
                styles.text,
                {
                  color: textColor,
                  fontSize,
                  marginLeft: icon ? 8 : 0,
                },
                textStyle,
              ]}
            >
              {title}
            </Text>
          </>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontWeight: '600',
  },
});
