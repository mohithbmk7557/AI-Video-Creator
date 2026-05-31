import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
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

const { width: W, height: H } = Dimensions.get("window");

interface SlidePlayerProps {
  title: string;
  slides: Slide[];
  script: string;
  onClose: () => void;
}

// Ken Burns movement configs (scale + translate per scene)
const KB = [
  { s0: 1.0,  s1: 1.13, x0:  0,   x1:  22,  y0:  0,   y1: -12 },
  { s0: 1.12, s1: 1.0,  x0: -20,  x1:  4,   y0:  8,   y1:  0  },
  { s0: 1.0,  s1: 1.10, x0:  0,   x1: -18,  y0:  6,   y1: -6  },
  { s0: 1.08, s1: 1.18, x0:  14,  x1: -8,   y0:  0,   y1:  0  },
  { s0: 1.0,  s1: 1.12, x0:  0,   x1:  0,   y0:  12,  y1: -8  },
  { s0: 1.1,  s1: 1.0,  x0: -12,  x1:  6,   y0: -4,   y1:  4  },
];

function getFallbackUrl(q: string, i: number) {
  return `https://source.unsplash.com/900x600/?${encodeURIComponent(q)}&sig=${i + 77}`;
}

export function SlidePlayer({ title, slides, script, onClose }: SlidePlayerProps) {
  const insets = useSafeAreaInsets();
  const [current, setCurrent] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const [imgErrors, setImgErrors] = useState<Record<number, boolean>>({});

  const totalDuration = slides.reduce((sum, s) => sum + s.duration, 0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Ken Burns ─────────────────────────────────────────────────────────────
  const kbScale  = useRef(new Animated.Value(1)).current;
  const kbTransX = useRef(new Animated.Value(0)).current;
  const kbTransY = useRef(new Animated.Value(0)).current;
  const kbRef    = useRef<Animated.CompositeAnimation | null>(null);

  // ── Text entrance ─────────────────────────────────────────────────────────
  const sceneOpacity = useRef(new Animated.Value(0)).current;
  const sceneScale   = useRef(new Animated.Value(0.75)).current;
  const headingY     = useRef(new Animated.Value(28)).current;
  const headingOp    = useRef(new Animated.Value(0)).current;
  const barWidth     = useRef(new Animated.Value(0)).current;
  const factY        = useRef(new Animated.Value(22)).current;
  const factOp       = useRef(new Animated.Value(0)).current;
  const narrOp       = useRef(new Animated.Value(0)).current;

  // ── Slide-level fade ──────────────────────────────────────────────────────
  const slideFade = useRef(new Animated.Value(1)).current;

  // ── Progress (segmented) ──────────────────────────────────────────────────
  const progressAnim = useRef(new Animated.Value(0)).current;
  const progressRef  = useRef<Animated.CompositeAnimation | null>(null);

  const slide = slides[current];
  const kb    = KB[current % KB.length];

  // ── Speech ────────────────────────────────────────────────────────────────
  const speak = useCallback((text: string) => {
    if (Platform.OS !== "web") return;
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    utt.rate  = 0.91;
    utt.pitch = 1.0;
    utt.lang  = "en-US";
    const voices = window.speechSynthesis.getVoices();
    const best = voices.find(
      (v) => v.lang.startsWith("en") &&
        (v.name.includes("Google") || v.name.includes("Natural") || v.name.includes("Premium"))
    );
    if (best) utt.voice = best;
    window.speechSynthesis.speak(utt);
  }, []);

  const stopSpeech = useCallback(() => {
    if (Platform.OS === "web" && typeof window !== "undefined" && "speechSynthesis" in window)
      window.speechSynthesis.cancel();
  }, []);

  // ── Run entrance animations for current slide ──────────────────────────────
  const runEntrance = useCallback((duration: number) => {
    // Reset text positions
    sceneOpacity.setValue(0); sceneScale.setValue(0.75);
    headingY.setValue(28);    headingOp.setValue(0);
    barWidth.setValue(0);
    factY.setValue(22);       factOp.setValue(0);
    narrOp.setValue(0);

    // Ken Burns
    kbRef.current?.stop();
    kbScale.setValue(kb.s0);  kbTransX.setValue(kb.x0);  kbTransY.setValue(kb.y0);
    kbRef.current = Animated.parallel([
      Animated.timing(kbScale,  { toValue: kb.s1, duration: duration * 1000, useNativeDriver: true }),
      Animated.timing(kbTransX, { toValue: kb.x1, duration: duration * 1000, useNativeDriver: true }),
      Animated.timing(kbTransY, { toValue: kb.y1, duration: duration * 1000, useNativeDriver: true }),
    ]);
    kbRef.current.start();

    // Scene badge (pop in)
    Animated.parallel([
      Animated.spring(sceneOpacity, { toValue: 1, useNativeDriver: true, friction: 7 }),
      Animated.spring(sceneScale,   { toValue: 1, useNativeDriver: true, friction: 7 }),
    ]).start();

    // Heading (slide up + fade) — delayed 200ms
    Animated.sequence([
      Animated.delay(200),
      Animated.parallel([
        Animated.spring(headingY,  { toValue: 0, useNativeDriver: true, friction: 8, tension: 65 }),
        Animated.timing(headingOp, { toValue: 1, duration: 320, useNativeDriver: true }),
      ]),
    ]).start();

    // Accent bar — delayed 380ms
    Animated.sequence([
      Animated.delay(380),
      Animated.timing(barWidth, { toValue: 1, duration: 420, useNativeDriver: false }),
    ]).start();

    // Fact — delayed 520ms
    Animated.sequence([
      Animated.delay(520),
      Animated.parallel([
        Animated.spring(factY,   { toValue: 0, useNativeDriver: true, friction: 8, tension: 60 }),
        Animated.timing(factOp,  { toValue: 1, duration: 350, useNativeDriver: true }),
      ]),
    ]).start();

    // Narration hint — delayed 800ms
    Animated.sequence([
      Animated.delay(800),
      Animated.timing(narrOp, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start();
  }, [current, kb]);

  // ── Transition to another slide ────────────────────────────────────────────
  const transitionTo = useCallback((next: number) => {
    if (timerRef.current) clearInterval(timerRef.current);
    kbRef.current?.stop();
    stopSpeech();

    Animated.timing(slideFade, { toValue: 0, duration: 300, useNativeDriver: true }).start(() => {
      setCurrent(next);
      slideFade.setValue(0);
      Animated.timing(slideFade, { toValue: 1, duration: 300, useNativeDriver: true }).start();
    });
  }, [stopSpeech, slideFade]);

  // ── Start progress for a segment ──────────────────────────────────────────
  const startProgress = useCallback((from: number, to: number, dur: number) => {
    progressRef.current?.stop();
    progressAnim.setValue(from);
    progressRef.current = Animated.timing(progressAnim, {
      toValue: to, duration: dur * 1000, useNativeDriver: false,
    });
    progressRef.current.start();
  }, [progressAnim]);

  // ── Main playback loop ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!playing) {
      if (timerRef.current) clearInterval(timerRef.current);
      kbRef.current?.stop();
      stopSpeech();
      return;
    }

    const sl = slides[current];
    const doneBefore = slides.slice(0, current).reduce((s, x) => s + x.duration, 0);

    runEntrance(sl.duration);
    startProgress(doneBefore / totalDuration, (doneBefore + sl.duration) / totalDuration, sl.duration);
    setTimeout(() => speak(sl.narration), 500);

    let t = 0;
    timerRef.current = setInterval(() => {
      t += 0.1;
      if (t >= sl.duration) {
        clearInterval(timerRef.current!);
        const next = current + 1;
        if (next < slides.length) {
          transitionTo(next);
        } else {
          stopSpeech();
          progressAnim.setValue(1);
          setElapsed(totalDuration);
          setPlaying(false);
        }
      }
    }, 100);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [current, playing]);

  // After transition: re-enter (playing already true)
  // The effect above runs on current change, so it auto-triggers.

  useEffect(() => () => {
    stopSpeech();
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  // ── Controls ──────────────────────────────────────────────────────────────
  const goNext = () => {
    if (current < slides.length - 1) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      transitionTo(current + 1);
    }
  };
  const goPrev = () => {
    if (current > 0) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      transitionTo(current - 1);
    }
  };
  const togglePlay = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPlaying((p) => !p);
  };
  const restart = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setElapsed(0); setPlaying(false);
    setCurrent(0);
    setTimeout(() => setPlaying(true), 100);
  };
  const handleClose = () => {
    kbRef.current?.stop();
    stopSpeech();
    if (timerRef.current) clearInterval(timerRef.current);
    onClose();
  };

  const isFinished = !playing && elapsed >= totalDuration;
  const topPad = Platform.OS === "web" ? 20 : insets.top;
  const botPad = Platform.OS === "web" ? 20 : insets.bottom + 4;

  const imgSrc = imgErrors[current]
    ? getFallbackUrl(slide.imageQuery, current)
    : (slide.imageUrl || getFallbackUrl(slide.imageQuery, current));

  const accentBarW = barWidth.interpolate({ inputRange: [0, 1], outputRange: [0, 60] });

  return (
    <View style={styles.root}>
      {/* ── ANIMATED IMAGE (Ken Burns) ─────────────────────────────────── */}
      <Animated.View style={[
        styles.imageLayer,
        { opacity: slideFade, transform: [
          { scale: kbScale },
          { translateX: kbTransX },
          { translateY: kbTransY },
        ]},
      ]}>
        <Image
          source={{ uri: imgSrc }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          onError={() => setImgErrors((e) => ({ ...e, [current]: true }))}
        />
      </Animated.View>

      {/* ── CINEMATIC GRADIENTS ───────────────────────────────────────── */}
      {/* Top vignette */}
      <LinearGradient
        colors={["#000000CC", "#00000066", "transparent"]}
        style={[styles.topGrad, { pointerEvents: "none" } as any]}
        start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
      />
      {/* Bottom vignette — heavy for text readability */}
      <LinearGradient
        colors={["transparent", "#00000044", "#000000BB", "#000000EE", "#000"]}
        style={[styles.bottomGrad, { pointerEvents: "none" } as any]}
        start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
      />

      {/* ── TOP BAR ───────────────────────────────────────────────────── */}
      <View style={[styles.topBar, { paddingTop: topPad }]}>
        <Pressable onPress={handleClose} style={styles.closeBtn}>
          <Feather name="x" size={19} color="#fff" />
        </Pressable>
        <View style={styles.topCenter}>
          <Text style={styles.topTitle} numberOfLines={1}>{title}</Text>
        </View>
        <View style={styles.counterPill}>
          <Text style={styles.counterText}>{current + 1} / {slides.length}</Text>
        </View>
      </View>

      {/* ── SEGMENTED PROGRESS BAR ────────────────────────────────────── */}
      <View style={styles.progressRow}>
        {slides.map((sl, i) => {
          const doneBefore = slides.slice(0, i).reduce((s, x) => s + x.duration, 0);
          return (
            <Pressable
              key={i}
              style={[styles.segmentTrack, { flex: sl.duration }]}
              onPress={() => transitionTo(i)}
            >
              {i < current ? (
                <View style={[styles.segFill, styles.segDone]} />
              ) : i === current ? (
                <View style={[styles.segFill, styles.segEmpty]}>
                  <Animated.View
                    style={[
                      styles.segActive,
                      {
                        width: progressAnim.interpolate({
                          inputRange: [doneBefore / totalDuration, (doneBefore + sl.duration) / totalDuration],
                          outputRange: ["0%", "100%"],
                          extrapolate: "clamp",
                        }),
                      },
                    ]}
                  />
                </View>
              ) : (
                <View style={[styles.segFill, styles.segEmpty]} />
              )}
            </Pressable>
          );
        })}
      </View>

      {/* ── ANIMATED CONTENT ──────────────────────────────────────────── */}
      <Animated.View style={[styles.contentArea, { opacity: slideFade }]}>

        {/* Scene badge — pop in */}
        <Animated.View style={[styles.sceneBadge, {
          opacity: sceneOpacity,
          transform: [{ scale: sceneScale }],
        }]}>
          <View style={styles.sceneDot} />
          <Text style={styles.sceneBadgeText}>Scene {current + 1}</Text>
        </Animated.View>

        {/* Heading — slides up */}
        <Animated.Text
          style={[styles.heading, {
            opacity: headingOp,
            transform: [{ translateY: headingY }],
          }]}
          numberOfLines={3}
        >
          {slide.heading}
        </Animated.Text>

        {/* Animated accent bar */}
        <View style={styles.accentBarTrack}>
          <Animated.View style={[styles.accentBar, { width: accentBarW }]} />
        </View>

        {/* Fact — slides up after bar */}
        <Animated.Text
          style={[styles.fact, {
            opacity: factOp,
            transform: [{ translateY: factY }],
          }]}
          numberOfLines={4}
        >
          {slide.fact}
        </Animated.Text>

        {/* Narration row — fades in last */}
        <Animated.View style={[styles.narrRow, { opacity: narrOp }]}>
          <NarratingDots playing={playing} />
          <Text style={styles.narrText} numberOfLines={2}>{slide.narration}</Text>
        </Animated.View>

        {/* Caption */}
        {slide.imageCaption ? (
          <Animated.View style={[styles.captionRow, { opacity: narrOp }]}>
            <Feather name="camera" size={9} color="#ffffff88" />
            <Text style={styles.captionText} numberOfLines={1}>{slide.imageCaption}</Text>
          </Animated.View>
        ) : null}
      </Animated.View>

      {/* ── CONTROLS ──────────────────────────────────────────────────── */}
      <View style={[styles.controls, { paddingBottom: botPad }]}>
        {/* Dot tray */}
        <View style={styles.dotsRow}>
          {slides.map((_, i) => (
            <Pressable key={i} onPress={() => transitionTo(i)} style={styles.dotHit}>
              <Animated.View style={[
                styles.dot,
                i === current && styles.dotActive,
                i < current  && styles.dotDone,
              ]} />
            </Pressable>
          ))}
        </View>

        {/* Control buttons */}
        <View style={styles.ctrlRow}>
          <Pressable
            onPress={goPrev}
            disabled={current === 0}
            style={[styles.sideBtn, current === 0 && { opacity: 0.28 }]}
          >
            <Feather name="skip-back" size={21} color="#fff" />
          </Pressable>

          <Pressable onPress={isFinished ? restart : togglePlay} style={styles.playBtn}>
            <LinearGradient colors={["#6C63FF", "#A855F7"]} style={styles.playGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
              <Feather
                name={isFinished ? "rotate-ccw" : playing ? "pause" : "play"}
                size={26}
                color="#fff"
                style={!playing && !isFinished ? { marginLeft: 3 } : undefined}
              />
            </LinearGradient>
          </Pressable>

          <Pressable
            onPress={goNext}
            disabled={current === slides.length - 1}
            style={[styles.sideBtn, current === slides.length - 1 && { opacity: 0.28 }]}
          >
            <Feather name="skip-forward" size={21} color="#fff" />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

// ── Pulsing audio-wave dots shown while narration plays ──────────────────────
function NarratingDots({ playing }: { playing: boolean }) {
  const anim1 = useRef(new Animated.Value(0.3)).current;
  const anim2 = useRef(new Animated.Value(0.3)).current;
  const anim3 = useRef(new Animated.Value(0.3)).current;
  const loopRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (!playing) {
      loopRef.current?.stop();
      anim1.setValue(0.3); anim2.setValue(0.3); anim3.setValue(0.3);
      return;
    }
    const pulse = (anim: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(anim, { toValue: 1,   duration: 300, useNativeDriver: true }),
          Animated.timing(anim, { toValue: 0.3, duration: 300, useNativeDriver: true }),
        ])
      );
    loopRef.current = Animated.parallel([pulse(anim1, 0), pulse(anim2, 150), pulse(anim3, 300)]);
    loopRef.current.start();
    return () => loopRef.current?.stop();
  }, [playing]);

  return (
    <View style={narrStyles.row}>
      {[anim1, anim2, anim3].map((a, i) => (
        <Animated.View
          key={i}
          style={[narrStyles.bar, {
            opacity: a,
            transform: [{
              scaleY: a.interpolate({ inputRange: [0.3, 1], outputRange: [0.5, 1] }),
            }],
          }]}
        />
      ))}
    </View>
  );
}

const narrStyles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 2, marginTop: 2 },
  bar: { width: 3, height: 14, borderRadius: 2, backgroundColor: "#6C63FF" },
});

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },

  imageLayer: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden",
  },

  topGrad: {
    position: "absolute", top: 0, left: 0, right: 0,
    height: H * 0.3, zIndex: 2, pointerEvents: "none",
  } as any,
  bottomGrad: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    height: H * 0.65, zIndex: 2, pointerEvents: "none",
  } as any,

  // Top bar
  topBar: {
    position: "absolute", top: 0, left: 0, right: 0, zIndex: 10,
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingBottom: 10,
  },
  closeBtn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: "#ffffff18",
    borderWidth: 1, borderColor: "#ffffff22",
    alignItems: "center", justifyContent: "center",
  },
  topCenter: { flex: 1, paddingHorizontal: 10 },
  topTitle: { color: "#ffffffDD", fontSize: 13, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  counterPill: {
    backgroundColor: "#ffffff15", borderRadius: 12,
    paddingHorizontal: 10, paddingVertical: 4,
    borderWidth: 1, borderColor: "#ffffff22",
  },
  counterText: { color: "#ffffffCC", fontSize: 12, fontFamily: "Inter_500Medium" },

  // Progress
  progressRow: {
    position: "absolute", top: Platform.OS === "web" ? 62 : 80, left: 16, right: 16,
    flexDirection: "row", gap: 4, height: 3, zIndex: 10,
  },
  segmentTrack: { height: 3, borderRadius: 2, overflow: "hidden" },
  segFill: { flex: 1, borderRadius: 2 },
  segDone: { backgroundColor: "#ffffffCC" },
  segEmpty: { backgroundColor: "#ffffff28" },
  segActive: { height: 3, backgroundColor: "#fff", position: "absolute", left: 0, top: 0, borderRadius: 2 },

  // Content
  contentArea: {
    position: "absolute", bottom: 140, left: 0, right: 0,
    paddingHorizontal: 22, zIndex: 10,
  },
  sceneBadge: {
    flexDirection: "row", alignItems: "center", gap: 6,
    alignSelf: "flex-start",
    backgroundColor: "#6C63FF30",
    borderWidth: 1, borderColor: "#6C63FF55",
    borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5,
    marginBottom: 14,
  },
  sceneDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#6C63FF" },
  sceneBadgeText: { color: "#A89BFF", fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.5 },

  heading: {
    fontSize: 30, fontFamily: "Inter_700Bold", color: "#FFFFFF",
    lineHeight: 36, letterSpacing: -0.4, marginBottom: 10,
  },

  accentBarTrack: { marginBottom: 12 },
  accentBar: { height: 3, borderRadius: 2, backgroundColor: "#6C63FF" },

  fact: {
    fontSize: 15, fontFamily: "Inter_400Regular", color: "#E0E2F0",
    lineHeight: 23, marginBottom: 10,
  },

  narrRow: {
    flexDirection: "row", alignItems: "flex-start", gap: 8, marginBottom: 6,
  },
  narrText: {
    flex: 1, fontSize: 12, color: "#9095B4", fontFamily: "Inter_400Regular",
    lineHeight: 18, fontStyle: "italic",
  },

  captionRow: {
    flexDirection: "row", alignItems: "center", gap: 5,
  },
  captionText: { color: "#ffffff55", fontSize: 10, fontFamily: "Inter_400Regular" },

  // Controls
  controls: {
    position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 10,
    paddingHorizontal: 20, gap: 12,
  },
  dotsRow: { flexDirection: "row", justifyContent: "center", gap: 5 },
  dotHit: { padding: 5 },
  dot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: "#ffffff33" },
  dotActive: { width: 22, backgroundColor: "#6C63FF", borderRadius: 3 },
  dotDone: { backgroundColor: "#6C63FF66" },

  ctrlRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 24 },
  sideBtn: {
    width: 46, height: 46, borderRadius: 23,
    backgroundColor: "#ffffff12",
    borderWidth: 1, borderColor: "#ffffff1A",
    alignItems: "center", justifyContent: "center",
  },
  playBtn: { width: 66, height: 66, borderRadius: 33, overflow: "hidden" },
  playGrad: { flex: 1, alignItems: "center", justifyContent: "center" },
});
