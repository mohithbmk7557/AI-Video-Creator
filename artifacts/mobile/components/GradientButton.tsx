import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import React from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type ViewStyle,
} from "react-native";
import { useColors } from "@/hooks/useColors";

interface Props {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  small?: boolean;
}

export function GradientButton({ label, onPress, loading, disabled, style, small }: Props) {
  const colors = useColors();

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onPress();
  };

  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.wrapper,
        small && styles.wrapperSmall,
        style,
        (disabled || loading) && { opacity: 0.5 },
        pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] },
      ]}
    >
      <LinearGradient
        colors={[colors.gradientStart, colors.gradientEnd]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.gradient, small && styles.gradientSmall]}
      >
        {loading ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <Text style={[styles.label, small && styles.labelSmall]}>{label}</Text>
        )}
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    borderRadius: 14,
    overflow: "hidden",
  },
  wrapperSmall: {
    borderRadius: 10,
  },
  gradient: {
    paddingVertical: 16,
    paddingHorizontal: 32,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 54,
  },
  gradientSmall: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    minHeight: 38,
  },
  label: {
    color: "#fff",
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.3,
  },
  labelSmall: {
    fontSize: 13,
  },
});
