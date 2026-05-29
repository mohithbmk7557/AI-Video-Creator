import React from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { useColors } from "@/hooks/useColors";

interface Props {
  label: string;
  onPress: () => void;
}

export function SuggestionChip({ label, onPress }: Props) {
  const colors = useColors();

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        { backgroundColor: colors.secondary, borderColor: colors.border },
        pressed && { opacity: 0.7, borderColor: colors.primary },
      ]}
    >
      <Text style={[styles.text, { color: colors.foreground }]} numberOfLines={2}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    marginRight: 8,
    marginBottom: 8,
    maxWidth: 220,
  },
  text: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    lineHeight: 18,
  },
});
