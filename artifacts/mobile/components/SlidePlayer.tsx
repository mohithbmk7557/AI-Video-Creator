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

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");
const IMAGE_H = SCREEN_H * 0.52;

interface SlidePlayerProps {
  title: string;
  slides: Slide[];
  script: string;
  onClose: () => void;
}

// Fallback: Unsplash free photos if Wikipedia image fails to load
function getFallbackUrl(query: string, index: number) {
  return `https://source.unsplash.com/900x600/?${encodeURIComponent(query)}&sig=${index + 42}`;
}

export function SlidePlayer({ title, slides, script, onClose }: SlidePlayerProps) {
  const insets = useSafeAreaInsets();
  const [current, setCurrent] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const [imgErrors, setImgErrors] = useState<Record<number, boolean>>({});

  const totalDuration = slides.reduce((sum, s) => sum + s.duration, 0);
  const progressAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressAnimRef = useRef<Animated.CompositeAnimation | null>(null);

  const slide = slides[current];

  // ── Speech ──────────────────────────────────────────────────────────────────
  const speak = useCallback((text: string) => {
    if (Platform.OS !== "web") return;
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    utt.rate = 0.92;
    utt.pitch = 1.0;
    utt.lang = "en-US";
    // Pick a natural-sounding voice if available
    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find(
      (v) => v.lang.startsWith("en") && (v.name.includes("Google") || v.name.includes("Natural") || v.name.includes("Premium"))
    );
    if (preferred) utt.voice = preferred;
    window.speechSynthesis.speak(utt);
  }, []);

  const stopSpeech = useCallback(() => {
    if (Platform.OS === "web" && typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  }, []);

  // ── Progress animation ───────────────────────────────────────────────────────
  const startProgress = useCallback((fromFrac: number, toFrac: number, dur: number) => {
    progressAnimRef.current?.stop();
    progressAnim.setValue(fromFrac);
    progressAnimRef.current = Animated.timing(progressAnim, {
      toValue: toFrac,
      duration: dur * 1000,
      useNativeDriver: false,
    });
    progressAnimRef.current.start();
  }, [progressAnim]);

  // ── Slide transition ─────────────────────────────────────────────────────────
  const transitionTo = useCallback((next: number) => {
    stopSpeech();
    if (timerRef.current) clearInterval(timerRef.current);

    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 0, duration: 250, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: -20, duration: 250, useNativeDriver: true }),
    ]).start(() => {
      setCurrent(next);
      slideAnim.setValue(20);
      fadeAnim.setValue(0);
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 350, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: 0, duration: 350, useNativeDriver: true }),
      ]).start();
    });
  }, [fadeAnim, slideAnim, stopSpeech]);

  // ── Auto-advance ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!playing) {
      if (timerRef.current) clearInterval(timerRef.current);
      stopSpeech();
      return;
    }

    // Speak narration for this slide
    setTimeout(() => speak(slide.narration), 400);

    // Progress bar
    const doneBefore = slides.slice(0, current).reduce((s, sl) => s + sl.duration, 0);
    startProgress(doneBefore / totalDuration, (doneBefore + slide.duration) / totalDuration, slide.duration);

    // Tick
    let elapsed = 0;
    timerRef.current = setInterval(() => {
      elapsed += 0.1;
      if (elapsed >= slide.duration) {
        clearInterval(timerRef.current!);
        const next = current + 1;
        if (next < slides.length) {
          transitionTo(next);
          const newDone = slides.slice(0, next).reduce((s, sl) => s + sl.duration, 0);
          startProgress(newDone / totalDuration, (newDone + slides[next].duration) / totalDuration, slides[next].duration);
        } else {
          setPlaying(false);
          setElapsed(totalDuration);
          stopSpeech();
          progressAnim.setValue(1);
        }
      }
    }, 100);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [current, playing]);

  useEffect(() => {
    return () => {
      stopSpeech();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // ── Controls ─────────────────────────────────────────────────────────────────
  const goNext = () => {
    if (current < slides.length - 1) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setElapsed(slides.slice(0, current + 1).reduce((s, sl) => s + sl.duration, 0));
      transitionTo(current + 1);
    }
  };

  const goPrev = () => {
    if (current > 0) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setElapsed(slides.slice(0, current - 1).reduce((s, sl) => s + sl.duration, 0));
      transitionTo(current - 1);
    }
  };

  const togglePlay = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPlaying((p) => !p);
  };

  const restart = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setElapsed(0);
    transitionTo(0);
    setPlaying(true);
  };

  const handleClose = () => {
    stopSpeech();
    if (timerRef.current) clearInterval(timerRef.current);
    onClose();
  };

  const isFinished = !playing && elapsed >= totalDuration;

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
  });

  const topPad = Platform.OS === "web" ? 20 : insets.top;
  const botPad = Platform.OS === "web" ? 24 : insets.bottom + 8;

  const imgSrc = imgErrors[current]
    ? getFallbackUrl(slide.imageQuery, current)
    : slide.imageUrl || getFallbackUrl(slide.imageQuery, current);

  return (
    <View style={styles.root}>
      {/* ── IMAGE SECTION (top ~52%) ──────────────────────────────────────── */}
      <Animated.View style={[styles.imageSection, { opacity: fadeAnim }]}>
        <Image
          source={{ uri: imgSrc }}
          style={styles.image}
          contentFit="cover"
          transition={400}
          onError={() => setImgErrors((e) => ({ ...e, [current]: true }))}
        />
        {/* Bottom gradient overlay on image */}
        <LinearGradient
          colors={["transparent", "#00000055", "#000000CC"]}
          style={styles.imageGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
        />
        {/* Top bar overlaid on image */}
        <View style={[styles.topBar, { paddingTop: topPad }]}>
          <Pressable onPress={handleClose} style={styles.closeBtn}>
            <Feather name="x" size={20} color="#fff" />
          </Pressable>
          <View style={styles.topCenter}>
            <Text style={styles.topTitle} numberOfLines={1}>{title}</Text>
          </View>
          <View style={styles.counterBadge}>
            <Text style={styles.counterText}>{current + 1}/{slides.length}</Text>
          </View>
        </View>
        {/* Progress bar on image */}
        <View style={styles.progressTrack}>
          {slides.map((sl, i) => (
            <View key={i} style={[styles.segmentTrack, { flex: sl.duration }]}>
              <View
                style={[
                  styles.segmentFill,
                  i < current ? styles.segmentDone :
                  i === current ? {} :
                  styles.segmentEmpty,
                ]}
              >
                {i === current && (
                  <Animated.View style={[styles.segmentActiveFill, { width: progressWidth }]} />
                )}
              </View>
            </View>
          ))}
        </View>
        {/* Image caption */}
        {slide.imageCaption ? (
          <View style={styles.captionBox}>
            <Feather name="camera" size={10} color="#ffffffBB" />
            <Text style={styles.captionText} numberOfLines={1}>{slide.imageCaption}</Text>
          </View>
        ) : null}
      </Animated.View>

      {/* ── CONTENT SECTION (bottom ~48%) ────────────────────────────────── */}
      <View style={styles.contentSection}>
        <Animated.View
          style={[
            styles.contentInner,
            { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
          ]}
        >
          {/* Scene label */}
          <View style={styles.sceneRow}>
            <View style={styles.sceneBadge}>
              <Feather name="play-circle" size={11} color="#6C63FF" />
              <Text style={styles.sceneBadgeText}>Scene {current + 1}</Text>
            </View>
            {slide.imageCaption ? (
              <View style={styles.wikiBadge}>
                <Text style={styles.wikiBadgeText}>📖 Wikipedia</Text>
              </View>
            ) : null}
          </View>

          {/* Heading */}
          <Text style={styles.heading}>{slide.heading}</Text>

          {/* Divider */}
          <View style={styles.divider} />

          {/* Fact */}
          <Text style={styles.fact}>{slide.fact}</Text>

          {/* Narration cue */}
          <View style={styles.narrationRow}>
            <Feather name={playing ? "volume-2" : "volume-x"} size={13} color="#6C63FF" />
            <Text style={styles.narrationText} numberOfLines={2}>{slide.narration}</Text>
          </View>
        </Animated.View>

        {/* ── Dot indicators ── */}
        <View style={styles.dotsRow}>
          {slides.map((_, i) => (
            <Pressable key={i} onPress={() => transitionTo(i)} style={styles.dotHit}>
              <View style={[styles.dot, i === current && styles.dotActive, i < current && styles.dotDone]} />
            </Pressable>
          ))}
        </View>

        {/* ── Controls ── */}
        <View style={[styles.controls, { paddingBottom: botPad }]}>
          <Pressable
            onPress={goPrev}
            disabled={current === 0 && !isFinished}
            style={[styles.ctrlBtn, current === 0 && !isFinished && styles.ctrlDisabled]}
          >
            <Feather name="skip-back" size={22} color="#fff" />
          </Pressable>

          <Pressable onPress={isFinished ? restart : togglePlay} style={styles.playBtn}>
            <LinearGradient
              colors={["#6C63FF", "#7C3AED"]}
              style={styles.playBtnGrad}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <Feather
                name={isFinished ? "rotate-ccw" : playing ? "pause" : "play"}
                size={26}
                color="#fff"
                style={!isFinished && !playing ? { marginLeft: 3 } : undefined}
              />
            </LinearGradient>
          </Pressable>

          <Pressable
            onPress={goNext}
            disabled={current === slides.length - 1}
            style={[styles.ctrlBtn, current === slides.length - 1 && styles.ctrlDisabled]}
          >
            <Feather name="skip-forward" size={22} color="#fff" />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#080810" },

  // Image section
  imageSection: {
    height: IMAGE_H,
    position: "relative",
    overflow: "hidden",
    backgroundColor: "#111",
  },
  image: { width: "100%", height: "100%" },
  imageGradient: {
    position: "absolute", bottom: 0, left: 0, right: 0, height: IMAGE_H * 0.45,
  },
  topBar: {
    position: "absolute", top: 0, left: 0, right: 0,
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingBottom: 12,
    zIndex: 10,
  },
  closeBtn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: "#00000055",
    borderWidth: 1, borderColor: "#ffffff33",
    alignItems: "center", justifyContent: "center",
  },
  topCenter: { flex: 1, paddingHorizontal: 10 },
  topTitle: { color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  counterBadge: {
    backgroundColor: "#00000066", borderRadius: 12,
    paddingHorizontal: 10, paddingVertical: 4,
    borderWidth: 1, borderColor: "#ffffff22",
  },
  counterText: { color: "#ffffffCC", fontSize: 12, fontFamily: "Inter_500Medium" },

  // Segmented progress bar
  progressTrack: {
    position: "absolute", bottom: 38, left: 16, right: 16,
    flexDirection: "row", gap: 3, height: 3,
  },
  segmentTrack: { height: 3, borderRadius: 2, overflow: "hidden" },
  segmentFill: { flex: 1, backgroundColor: "#ffffff44", borderRadius: 2 },
  segmentDone: { backgroundColor: "#ffffffCC" },
  segmentEmpty: { backgroundColor: "#ffffff33" },
  segmentActiveFill: { height: 3, backgroundColor: "#fff", position: "absolute", left: 0, top: 0 },

  captionBox: {
    position: "absolute", bottom: 12, left: 14,
    flexDirection: "row", alignItems: "center", gap: 5,
  },
  captionText: { color: "#ffffffBB", fontSize: 10, fontFamily: "Inter_400Regular", maxWidth: SCREEN_W * 0.75 },

  // Content section
  contentSection: {
    flex: 1,
    backgroundColor: "#080810",
    paddingHorizontal: 20,
    paddingTop: 16,
    justifyContent: "space-between",
  },
  contentInner: { flex: 1 },
  sceneRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  sceneBadge: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: "#6C63FF22", paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 20, borderWidth: 1, borderColor: "#6C63FF44",
  },
  sceneBadgeText: { color: "#6C63FF", fontSize: 11, fontFamily: "Inter_600SemiBold" },
  wikiBadge: {
    backgroundColor: "#ffffff0F", paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 12, borderWidth: 1, borderColor: "#ffffff1A",
  },
  wikiBadgeText: { color: "#ffffffAA", fontSize: 10, fontFamily: "Inter_400Regular" },

  heading: {
    fontSize: 22, fontFamily: "Inter_700Bold", color: "#FFFFFF",
    lineHeight: 28, letterSpacing: -0.3, marginBottom: 10,
  },
  divider: { height: 1, backgroundColor: "#ffffff14", marginBottom: 10 },
  fact: {
    fontSize: 14, fontFamily: "Inter_400Regular", color: "#D0D2E8",
    lineHeight: 22,
  },
  narrationRow: {
    flexDirection: "row", alignItems: "flex-start", gap: 7, marginTop: 10,
  },
  narrationText: {
    flex: 1, fontSize: 12, fontFamily: "Inter_400Regular",
    color: "#8890B0", lineHeight: 18, fontStyle: "italic",
  },

  // Dots
  dotsRow: {
    flexDirection: "row", justifyContent: "center", gap: 4,
    paddingVertical: 6,
  },
  dotHit: { padding: 4 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#ffffff22" },
  dotActive: { backgroundColor: "#6C63FF", width: 22, borderRadius: 3 },
  dotDone: { backgroundColor: "#6C63FF66" },

  // Controls
  controls: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 28 },
  ctrlBtn: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: "#ffffff0F", borderWidth: 1, borderColor: "#ffffff1A",
    alignItems: "center", justifyContent: "center",
  },
  ctrlDisabled: { opacity: 0.25 },
  playBtn: { width: 64, height: 64, borderRadius: 32, overflow: "hidden" },
  playBtnGrad: { flex: 1, alignItems: "center", justifyContent: "center" },
});
