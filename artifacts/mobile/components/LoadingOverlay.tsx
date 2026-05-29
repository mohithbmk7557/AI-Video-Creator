import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { useColors } from "@/hooks/useColors";

const STEPS = [
  "Researching your topic...",
  "Gathering information...",
  "Writing the script...",
  "Generating visuals...",
  "Composing your video...",
  "Almost ready...",
];

interface Props {
  visible: boolean;
  topic: string;
}

export function LoadingOverlay({ visible, topic }: Props) {
  const colors = useColors();
  const pulseAnim = useRef(new Animated.Value(0.6)).current;
  const stepAnim = useRef(new Animated.Value(0)).current;
  const stepRef = useRef(0);
  const [stepText, setStepText] = React.useState(STEPS[0]);

  useEffect(() => {
    if (!visible) return;
    stepRef.current = 0;
    setStepText(STEPS[0]);

    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0.6, duration: 900, useNativeDriver: true }),
      ])
    );
    pulse.start();

    const interval = setInterval(() => {
      stepRef.current = (stepRef.current + 1) % STEPS.length;
      setStepText(STEPS[stepRef.current]);
    }, 3500);

    return () => {
      pulse.stop();
      clearInterval(interval);
    };
  }, [visible]);

  if (!visible) return null;

  return (
    <View style={[StyleSheet.absoluteFill, styles.overlay]}>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Animated.View style={{ opacity: pulseAnim }}>
          <LinearGradient
            colors={[colors.gradientStart, colors.gradientEnd]}
            style={styles.orb}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          />
        </Animated.View>
        <Text style={[styles.topic, { color: colors.foreground }]} numberOfLines={2}>
          {topic}
        </Text>
        <Text style={[styles.step, { color: colors.mutedForeground }]}>{stepText}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    backgroundColor: "rgba(10,11,20,0.92)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 100,
  },
  card: {
    width: 280,
    borderRadius: 24,
    borderWidth: 1,
    padding: 32,
    alignItems: "center",
    gap: 16,
  },
  orb: {
    width: 72,
    height: 72,
    borderRadius: 36,
  },
  topic: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
    textAlign: "center",
    lineHeight: 24,
  },
  step: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
});
