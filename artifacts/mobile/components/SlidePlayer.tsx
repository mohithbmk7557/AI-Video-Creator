import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Slide } from "@/context/VideoContext";

const { width: SCREEN_W } = Dimensions.get("window");

interface SlidePlayerProps {
  title: string;
  slides: Slide[];
  script: string;
  onClose: () => void;
}

function getImageUrl(query: string, index: number) {
  const encoded = encodeURIComponent(query);
  return `https://source.unsplash.com/800x450/?${encoded}&sig=${index}`;
}

export function SlidePlayer({ title, slides, script, onClose }: SlidePlayerProps) {
  const insets = useSafeAreaInsets();
  const [current, setCurrent] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [elapsed, setElapsed] = useState(0);

  const totalDuration = slides.reduce((sum, s) => sum + s.duration, 0);
  const progressAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const speechRef = useRef<any>(null);

  const slide = slides[current];

  // Speak narration using Web Speech API (works on web + expo web)
  const speakNarration = useCallback((text: string) => {
    if (Platform.OS === "web" && typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.9;
      utterance.pitch = 1;
      utterance.lang = "en-US";
      window.speechSynthesis.speak(utterance);
      speechRef.current = utterance;
    }
  }, []);

  const stopSpeech = useCallback(() => {
    if (Platform.OS === "web" && typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  }, []);

  // Progress bar animation
  const animateProgress = useCallback((from: number, to: number, duration: number) => {
    progressAnim.setValue(from);
    Animated.timing(progressAnim, {
      toValue: to,
      duration: duration * 1000,
      useNativeDriver: false,
    }).start();
  }, [progressAnim]);

  // Auto-advance logic
  useEffect(() => {
    if (!playing) {
      if (timerRef.current) clearInterval(timerRef.current);
      stopSpeech();
      return;
    }

    speakNarration(slide.narration);

    const slideDuration = slide.duration;
    let localElapsed = 0;

    timerRef.current = setInterval(() => {
      localElapsed += 0.1;
      if (localElapsed >= slideDuration) {
        clearInterval(timerRef.current!);
        const next = current + 1;
        if (next < slides.length) {
          // Fade out → change slide → fade in
          Animated.timing(fadeAnim, { toValue: 0, duration: 300, useNativeDriver: true }).start(() => {
            setCurrent(next);
            setElapsed((e) => e + slideDuration);
            fadeAnim.setValue(0);
            Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
          });
        } else {
          setPlaying(false);
          setElapsed(totalDuration);
          stopSpeech();
        }
      }
    }, 100);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [current, playing]);

  // Overall progress bar
  const completedBefore = slides.slice(0, current).reduce((s, sl) => s + sl.duration, 0);
  useEffect(() => {
    if (playing) {
      animateProgress(completedBefore / totalDuration, (completedBefore + slide.duration) / totalDuration, slide.duration);
    }
  }, [current, playing]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopSpeech();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const goNext = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    stopSpeech();
    if (current < slides.length - 1) {
      const el = slides.slice(0, current + 1).reduce((s, sl) => s + sl.duration, 0);
      setElapsed(el);
      Animated.timing(fadeAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => {
        setCurrent(current + 1);
        fadeAnim.setValue(0);
        Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }).start();
      });
    }
  };

  const goPrev = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    stopSpeech();
    if (current > 0) {
      const el = slides.slice(0, current - 1).reduce((s, sl) => s + sl.duration, 0);
      setElapsed(el);
      Animated.timing(fadeAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => {
        setCurrent(current - 1);
        fadeAnim.setValue(0);
        Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }).start();
      });
    }
  };

  const togglePlay = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPlaying((p) => !p);
  };

  const handleClose = () => {
    stopSpeech();
    if (timerRef.current) clearInterval(timerRef.current);
    onClose();
  };

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
  });

  const isFinished = !playing && elapsed >= totalDuration;

  return (
    <View style={styles.root}>
      {/* Background image */}
      <Image
        source={{ uri: getImageUrl(slide.imageQuery, current) }}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        transition={600}
      />
      {/* Dark overlay */}
      <LinearGradient
        colors={[slide.accent + "CC", "#000000EE"]}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
      />

      {/* Top bar */}
      <View style={[styles.topBar, { paddingTop: Platform.OS === "web" ? 24 : insets.top + 8 }]}>
        <Pressable onPress={handleClose} style={styles.closeBtn}>
          <Feather name="x" size={22} color="#fff" />
        </Pressable>
        <Text style={styles.topTitle} numberOfLines={1}>{title}</Text>
        <Text style={styles.slideCounter}>{current + 1}/{slides.length}</Text>
      </View>

      {/* Progress bar */}
      <View style={styles.progressTrack}>
        <Animated.View style={[styles.progressFill, { width: progressWidth }]} />
      </View>

      {/* Slide content */}
      <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
        {/* Slide number pill */}
        <View style={styles.slidePill}>
          <Text style={styles.slidePillText}>Scene {current + 1}</Text>
        </View>

        <Text style={styles.heading}>{slide.heading}</Text>
        <Text style={styles.fact}>{slide.fact}</Text>
      </Animated.View>

      {/* Controls */}
      <View style={[styles.controls, { paddingBottom: Platform.OS === "web" ? 32 : insets.bottom + 20 }]}>
        <Pressable
          onPress={goPrev}
          style={[styles.ctrlBtn, current === 0 && { opacity: 0.3 }]}
          disabled={current === 0}
        >
          <Feather name="skip-back" size={26} color="#fff" />
        </Pressable>

        <Pressable onPress={togglePlay} style={styles.playBtn}>
          {isFinished ? (
            <Feather name="rotate-ccw" size={28} color="#fff" />
          ) : (
            <Feather name={playing ? "pause" : "play"} size={28} color="#fff" />
          )}
        </Pressable>

        <Pressable
          onPress={isFinished ? () => { setCurrent(0); setElapsed(0); setPlaying(true); } : goNext}
          style={[styles.ctrlBtn, (!isFinished && current === slides.length - 1) && { opacity: 0.3 }]}
          disabled={!isFinished && current === slides.length - 1}
        >
          <Feather name={isFinished ? "rotate-ccw" : "skip-forward"} size={26} color="#fff" />
        </Pressable>
      </View>

      {/* Dot indicators */}
      <View style={[styles.dots, { bottom: Platform.OS === "web" ? 96 : insets.bottom + 80 }]}>
        {slides.map((_, i) => (
          <View
            key={i}
            style={[styles.dot, i === current && styles.dotActive, i < current && styles.dotDone]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 12,
    zIndex: 10,
  },
  closeBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: "#ffffff22",
    alignItems: "center", justifyContent: "center",
  },
  topTitle: {
    flex: 1, fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#fff",
    textAlign: "center", paddingHorizontal: 12,
  },
  slideCounter: { fontSize: 13, color: "#ffffffAA", fontFamily: "Inter_400Regular", minWidth: 30, textAlign: "right" },
  progressTrack: {
    height: 3, backgroundColor: "#ffffff33", marginHorizontal: 20, borderRadius: 2, marginBottom: 4,
  },
  progressFill: { height: 3, backgroundColor: "#fff", borderRadius: 2 },
  content: {
    flex: 1,
    paddingHorizontal: 28,
    justifyContent: "flex-end",
    paddingBottom: 120,
  },
  slidePill: {
    backgroundColor: "#ffffff22",
    paddingHorizontal: 12, paddingVertical: 5,
    borderRadius: 20, alignSelf: "flex-start", marginBottom: 16,
  },
  slidePillText: { color: "#ffffffCC", fontSize: 12, fontFamily: "Inter_500Medium" },
  heading: {
    fontSize: 32, fontFamily: "Inter_700Bold", color: "#fff",
    lineHeight: 38, marginBottom: 16, letterSpacing: -0.5,
  },
  fact: {
    fontSize: 17, fontFamily: "Inter_400Regular", color: "#ffffffDD",
    lineHeight: 26, marginBottom: 8,
  },
  controls: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 32,
    paddingHorizontal: 40,
  },
  ctrlBtn: { width: 52, height: 52, borderRadius: 26, backgroundColor: "#ffffff22", alignItems: "center", justifyContent: "center" },
  playBtn: { width: 64, height: 64, borderRadius: 32, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  dots: {
    position: "absolute", left: 0, right: 0, flexDirection: "row", justifyContent: "center", gap: 6,
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#ffffff44" },
  dotActive: { backgroundColor: "#fff", width: 20 },
  dotDone: { backgroundColor: "#ffffff88" },
});
