/**
 * SlidePlayer — YouTube-style AI video player
 *
 * Each 10-second scene has 3 visual "shots":
 *   Shot 0 (0–3s)   ESTABLISH  — image 1, heading card slides up from bottom
 *   Shot 1 (3–7s)   BUILD      — image 2 cuts in, key phrase reveals WORD BY WORD
 *   Shot 2 (7–10s)  IMPACT     — image 3 cuts in, stat ZOOMS in large
 *
 * Ken Burns motion runs throughout. Images cross-fade on every cut.
 * Narration is spoken continuously via Web Speech API.
 */

import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import React, {
  useCallback, useEffect, useRef, useState,
} from "react";
import {
  Animated, Dimensions, Platform, Pressable,
  StyleSheet, Text, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Slide } from "@/context/VideoContext";

const { width: W, height: H } = Dimensions.get("window");

interface Props {
  title: string;
  slides: Slide[];
  script: string;
  onClose: () => void;
}

// Ken Burns configs — 6 unique motions
const KB = [
  { s0: 1.0,  s1: 1.14, x0:  0,  x1:  24, y0:  0,  y1: -14 },
  { s0: 1.12, s1: 1.0,  x0: -22, x1:  4,  y0:  8,  y1:  0  },
  { s0: 1.0,  s1: 1.11, x0:  0,  x1: -20, y0:  6,  y1: -6  },
  { s0: 1.06, s1: 1.18, x0:  16, x1: -10, y0:  0,  y1:  0  },
  { s0: 1.0,  s1: 1.1,  x0:  0,  x1:  0,  y0:  14, y1: -10 },
  { s0: 1.1,  s1: 1.0,  x0: -14, x1:  8,  y0: -4, y1:  4  },
];

// Shot timing within a slide (seconds)
const SHOT_TIMES = [0, 3, 7];   // shot 0 starts at 0, shot 1 at 3s, shot 2 at 7s

function fallbackUrl(q: string, seed: number) {
  return `https://source.unsplash.com/900x600/?${encodeURIComponent(q)}&sig=${seed + 200}`;
}

// ─── Main component ───────────────────────────────────────────────────────────
export function SlidePlayer({ title, slides, script, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const [slideIdx, setSlideIdx] = useState(0);
  const [shot, setShot] = useState<0 | 1 | 2>(0);   // current shot within slide
  const [playing, setPlaying] = useState(true);
  const [finished, setFinished] = useState(false);
  const [imgErr, setImgErr] = useState<Record<string, boolean>>({});
  const [revealedWords, setRevealedWords] = useState(0); // for word-by-word

  const timerRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsed    = useRef(0);  // seconds elapsed within current slide
  const wordTimer  = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Animated values ────────────────────────────────────────────────────────
  // Image layer
  const imgOpacity = useRef(new Animated.Value(1)).current;

  // Ken Burns (per shot)
  const kbScale  = useRef(new Animated.Value(1)).current;
  const kbX      = useRef(new Animated.Value(0)).current;
  const kbY      = useRef(new Animated.Value(0)).current;
  const kbAnim   = useRef<Animated.CompositeAnimation | null>(null);

  // Shot 0: heading card
  const headingY  = useRef(new Animated.Value(60)).current;
  const headingOp = useRef(new Animated.Value(0)).current;
  const badgeOp   = useRef(new Animated.Value(0)).current;
  const badgeSc   = useRef(new Animated.Value(0.7)).current;

  // Shot 1: key phrase words
  const wordContOp = useRef(new Animated.Value(0)).current;

  // Shot 2: stat callout
  const statSc   = useRef(new Animated.Value(0.2)).current;
  const statOp   = useRef(new Animated.Value(0)).current;
  const statLblY = useRef(new Animated.Value(12)).current;
  const statLblOp = useRef(new Animated.Value(0)).current;

  // Slide-level cross-fade
  const slideFade = useRef(new Animated.Value(1)).current;

  // Overall progress (0–1)
  const progressAnim = useRef(new Animated.Value(0)).current;
  const progressRef  = useRef<Animated.CompositeAnimation | null>(null);

  const currentSlide = slides[slideIdx];
  const kb = KB[slideIdx % KB.length];

  // ── Speech ─────────────────────────────────────────────────────────────────
  const speak = useCallback((text: string) => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    utt.rate = 0.9; utt.pitch = 1.0; utt.lang = "en-US";
    const voices = window.speechSynthesis.getVoices();
    const best = voices.find(v =>
      v.lang.startsWith("en") && (v.name.includes("Google") || v.name.includes("Natural") || v.name.includes("Premium"))
    );
    if (best) utt.voice = best;
    window.speechSynthesis.speak(utt);
  }, []);

  const stopSpeech = useCallback(() => {
    if (Platform.OS === "web" && typeof window !== "undefined" && "speechSynthesis" in window)
      window.speechSynthesis.cancel();
  }, []);

  // ── Start Ken Burns for a shot ──────────────────────────────────────────────
  const startKB = useCallback((duration: number) => {
    kbAnim.current?.stop();
    kbScale.setValue(kb.s0); kbX.setValue(kb.x0); kbY.setValue(kb.y0);
    kbAnim.current = Animated.parallel([
      Animated.timing(kbScale, { toValue: kb.s1, duration: duration * 1000, useNativeDriver: false }),
      Animated.timing(kbX,     { toValue: kb.x1, duration: duration * 1000, useNativeDriver: false }),
      Animated.timing(kbY,     { toValue: kb.y1, duration: duration * 1000, useNativeDriver: false }),
    ]);
    kbAnim.current.start();
  }, [kb, kbScale, kbX, kbY]);

  // ── Image cross-fade ────────────────────────────────────────────────────────
  const crossFadeImage = useCallback((then: () => void) => {
    Animated.timing(imgOpacity, { toValue: 0, duration: 280, useNativeDriver: false }).start(() => {
      then();
      Animated.timing(imgOpacity, { toValue: 1, duration: 380, useNativeDriver: false }).start();
    });
  }, [imgOpacity]);

  // ── Shot 0 animations: heading card ────────────────────────────────────────
  const runShot0 = useCallback(() => {
    headingY.setValue(60); headingOp.setValue(0);
    badgeOp.setValue(0);   badgeSc.setValue(0.7);
    wordContOp.setValue(0); statOp.setValue(0); statSc.setValue(0.2); statLblOp.setValue(0);

    // Badge springs in immediately
    Animated.parallel([
      Animated.spring(badgeSc, { toValue: 1, friction: 6, tension: 80, useNativeDriver: false }),
      Animated.timing(badgeOp, { toValue: 1, duration: 250, useNativeDriver: false }),
    ]).start();

    // Heading rises after 150ms
    Animated.sequence([
      Animated.delay(150),
      Animated.parallel([
        Animated.spring(headingY,  { toValue: 0, friction: 8, tension: 65, useNativeDriver: false }),
        Animated.timing(headingOp, { toValue: 1, duration: 350, useNativeDriver: false }),
      ]),
    ]).start();
  }, []);

  // ── Shot 1 animations: word-by-word key phrase ─────────────────────────────
  const runShot1 = useCallback((words: string[]) => {
    wordContOp.setValue(0);
    headingOp.setValue(0);
    setRevealedWords(0);

    Animated.timing(wordContOp, { toValue: 1, duration: 300, useNativeDriver: false }).start();

    // Reveal one word every ~400ms (for 4 words in 3s that's 750ms/word)
    if (wordTimer.current) clearInterval(wordTimer.current);
    const msPerWord = Math.min(750, Math.max(300, 3000 / (words.length || 1)));
    let idx = 0;
    wordTimer.current = setInterval(() => {
      idx++;
      setRevealedWords(idx);
      if (idx >= words.length) clearInterval(wordTimer.current!);
    }, msPerWord);
  }, []);

  // ── Shot 2 animations: stat callout ───────────────────────────────────────
  const runShot2 = useCallback(() => {
    wordContOp.setValue(0);
    statSc.setValue(0.2); statOp.setValue(0);
    statLblY.setValue(14); statLblOp.setValue(0);

    // Stat number pops in
    Animated.sequence([
      Animated.delay(200),
      Animated.parallel([
        Animated.spring(statSc, { toValue: 1, friction: 5, tension: 90, useNativeDriver: false }),
        Animated.timing(statOp, { toValue: 1, duration: 300, useNativeDriver: false }),
      ]),
    ]).start();

    // Stat label rises below
    Animated.sequence([
      Animated.delay(500),
      Animated.parallel([
        Animated.spring(statLblY,  { toValue: 0, friction: 8, tension: 60, useNativeDriver: false }),
        Animated.timing(statLblOp, { toValue: 1, duration: 350, useNativeDriver: false }),
      ]),
    ]).start();
  }, []);

  // ── Transition to next slide ───────────────────────────────────────────────
  const goToSlide = useCallback((nextIdx: number) => {
    kbAnim.current?.stop();
    stopSpeech();
    if (timerRef.current)  clearInterval(timerRef.current);
    if (wordTimer.current) clearInterval(wordTimer.current);

    Animated.timing(slideFade, { toValue: 0, duration: 300, useNativeDriver: false }).start(() => {
      setSlideIdx(nextIdx);
      setShot(0);
      elapsed.current = 0;
      setRevealedWords(0);
      slideFade.setValue(0);
      Animated.timing(slideFade, { toValue: 1, duration: 300, useNativeDriver: false }).start();
    });
  }, [stopSpeech, slideFade]);

  // ── Fire a shot transition within the current slide ────────────────────────
  const fireShot = useCallback((newShot: 0 | 1 | 2, slide: Slide) => {
    const words = slide.keyPhrase?.split(" ") ?? [];
    crossFadeImage(() => setShot(newShot));
    if (newShot === 0) runShot0();
    if (newShot === 1) runShot1(words);
    if (newShot === 2) runShot2();
  }, [crossFadeImage, runShot0, runShot1, runShot2]);

  // ── Main playback engine ───────────────────────────────────────────────────
  useEffect(() => {
    if (!playing) {
      if (timerRef.current)  clearInterval(timerRef.current);
      if (wordTimer.current) clearInterval(wordTimer.current);
      kbAnim.current?.stop();
      stopSpeech();
      return;
    }

    const sl = slides[slideIdx];
    const doneBefore = slides.slice(0, slideIdx).reduce((s, x) => s + x.duration, 0);

    // Kick off
    runShot0();
    startKB(sl.duration);
    progressRef.current?.stop();
    progressAnim.setValue(doneBefore / totalDuration);
    progressRef.current = Animated.timing(progressAnim, {
      toValue: (doneBefore + sl.duration) / totalDuration,
      duration: sl.duration * 1000,
      useNativeDriver: false,
    });
    progressRef.current.start();

    // Speak narration after short delay
    setTimeout(() => speak(sl.narration), 600);

    // Tick every 100ms — drive shot transitions
    elapsed.current = 0;
    timerRef.current = setInterval(() => {
      elapsed.current += 0.1;
      const t = elapsed.current;

      // Shot 1 at 3s
      if (t >= SHOT_TIMES[1] && t < SHOT_TIMES[1] + 0.15 && shot !== 1) {
        fireShot(1, sl);
      }
      // Shot 2 at 7s
      if (t >= SHOT_TIMES[2] && t < SHOT_TIMES[2] + 0.15 && shot !== 2) {
        fireShot(2, sl);
      }
      // End of slide
      if (t >= sl.duration - 0.05) {
        clearInterval(timerRef.current!);
        const next = slideIdx + 1;
        if (next < slides.length) {
          goToSlide(next);
        } else {
          stopSpeech();
          progressAnim.setValue(1);
          setPlaying(false);
          setFinished(true);
        }
      }
    }, 100);

    return () => {
      if (timerRef.current)  clearInterval(timerRef.current);
      if (wordTimer.current) clearInterval(wordTimer.current);
    };
  }, [slideIdx, playing]);

  useEffect(() => () => {
    stopSpeech();
    if (timerRef.current)  clearInterval(timerRef.current);
    if (wordTimer.current) clearInterval(wordTimer.current);
  }, []);

  // ── Controls ───────────────────────────────────────────────────────────────
  const restart = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setFinished(false);
    setPlaying(false);
    setTimeout(() => { goToSlide(0); setTimeout(() => setPlaying(true), 50); }, 50);
  };

  const handleClose = () => {
    kbAnim.current?.stop();
    stopSpeech();
    if (timerRef.current)  clearInterval(timerRef.current);
    if (wordTimer.current) clearInterval(wordTimer.current);
    onClose();
  };

  const skipNext = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (slideIdx < slides.length - 1) goToSlide(slideIdx + 1);
  };
  const skipPrev = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (slideIdx > 0) goToSlide(slideIdx - 1);
  };
  const togglePlay = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPlaying(p => !p);
  };

  const totalDuration = slides.reduce((s, sl) => s + sl.duration, 0);
  const topPad = Platform.OS === "web" ? 18 : insets.top;
  const botPad = Platform.OS === "web" ? 16 : insets.bottom + 4;

  // Resolve current image URL
  const imgUrls = currentSlide.imageUrls ?? [];
  const rawUrl = imgUrls[shot] ?? imgUrls[0] ?? "";
  const errKey = `${slideIdx}-${shot}`;
  const imgSrc = imgErr[errKey]
    ? fallbackUrl(currentSlide.imageQueries?.[shot] ?? currentSlide.imageQueries?.[0] ?? "nature", slideIdx * 10 + shot)
    : (rawUrl || fallbackUrl(currentSlide.imageQueries?.[0] ?? "nature", slideIdx));

  const words = (currentSlide.keyPhrase ?? "").split(" ");
  const hasStat = !!(currentSlide.stat && currentSlide.stat.trim());

  return (
    <View style={styles.root}>

      {/* ━━ IMAGE LAYER (Ken Burns + cross-fade) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <Animated.View style={[
        styles.imgLayer,
        {
          opacity: imgOpacity,
          transform: [{ scale: kbScale }, { translateX: kbX }, { translateY: kbY }],
        },
      ]}>
        <Image
          source={{ uri: imgSrc }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          onError={() => setImgErr(e => ({ ...e, [errKey]: true }))}
        />
      </Animated.View>

      {/* ━━ GRADIENTS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <LinearGradient
        colors={["#000000BB", "#00000044", "transparent"]}
        style={styles.gradTop}
        start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
      />
      <LinearGradient
        colors={["transparent", "#00000055", "#000000BB", "#000000F0"]}
        style={styles.gradBot}
        start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
      />

      {/* ━━ TOP BAR ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <View style={[styles.topBar, { paddingTop: topPad }]}>
        <Pressable onPress={handleClose} style={styles.closeBtn}>
          <Feather name="x" size={18} color="#fff" />
        </Pressable>
        <View style={styles.topMid}>
          <Text style={styles.topTitle} numberOfLines={1}>{title}</Text>
        </View>
        {/* Shot indicator pills */}
        <View style={styles.shotPills}>
          {[0, 1, 2].map(i => (
            <View key={i} style={[styles.shotDot, shot === i && styles.shotDotActive]} />
          ))}
        </View>
      </View>

      {/* ━━ PROGRESS BAR ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <View style={styles.progressRow}>
        {slides.map((sl, i) => {
          const db = slides.slice(0, i).reduce((s, x) => s + x.duration, 0);
          return (
            <Pressable key={i} style={[styles.segTrack, { flex: sl.duration }]} onPress={() => goToSlide(i)}>
              {i < slideIdx ? (
                <View style={[styles.seg, styles.segDone]} />
              ) : i === slideIdx ? (
                <View style={[styles.seg, styles.segEmpty]}>
                  <Animated.View style={[styles.segFill, {
                    width: progressAnim.interpolate({
                      inputRange: [db / totalDuration, (db + sl.duration) / totalDuration],
                      outputRange: ["0%", "100%"],
                      extrapolate: "clamp",
                    }),
                  }]} />
                </View>
              ) : (
                <View style={[styles.seg, styles.segEmpty]} />
              )}
            </Pressable>
          );
        })}
      </View>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          SHOT 0: ESTABLISH — lower-third heading card
          ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <Animated.View style={[styles.shot0, {
        opacity: Animated.multiply(slideFade, shot === 0 ? new Animated.Value(1) : headingOp),
      }]}>
        {/* Scene badge */}
        <Animated.View style={[styles.sceneBadge, {
          opacity: badgeOp,
          transform: [{ scale: badgeSc }],
        }]}>
          <View style={styles.badgeDot} />
          <Text style={styles.badgeText}>Scene {slideIdx + 1} of {slides.length}</Text>
        </Animated.View>

        {/* Heading slides up */}
        <Animated.View style={{
          transform: [{ translateY: headingY }],
          opacity: headingOp,
        }}>
          <View style={styles.headingCard}>
            <Text style={styles.headingText}>{currentSlide.heading}</Text>
          </View>
        </Animated.View>
      </Animated.View>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          SHOT 1: BUILD — word-by-word key phrase reveal
          ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {shot === 1 && (
        <Animated.View style={[styles.shot1, { opacity: Animated.multiply(slideFade, wordContOp) }]}>
          <View style={styles.phraseContainer}>
            {words.map((word, i) => (
              <WordChip
                key={i}
                word={word}
                visible={i < revealedWords}
                index={i}
              />
            ))}
          </View>
          <Animated.Text style={[styles.factText, { opacity: wordContOp }]} numberOfLines={3}>
            {currentSlide.fact}
          </Animated.Text>
        </Animated.View>
      )}

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          SHOT 2: IMPACT — stat callout (or full fact if no stat)
          ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {shot === 2 && (
        <Animated.View style={[styles.shot2, { opacity: slideFade }]}>
          {hasStat ? (
            <View style={styles.statBlock}>
              {/* Glow ring behind stat */}
              <View style={styles.statGlow} />
              <Animated.Text style={[styles.statNumber, {
                transform: [{ scale: statSc }],
                opacity: statOp,
              }]}>
                {currentSlide.stat}
              </Animated.Text>
              <Animated.Text style={[styles.statLabel, {
                transform: [{ translateY: statLblY }],
                opacity: statLblOp,
              }]}>
                {currentSlide.statLabel?.toUpperCase()}
              </Animated.Text>
            </View>
          ) : (
            <Animated.View style={[styles.factBlock, { opacity: statOp }]}>
              <Text style={styles.factBig}>{currentSlide.fact}</Text>
            </Animated.View>
          )}
        </Animated.View>
      )}

      {/* ━━ CAPTION (bottom-left, shot 0 only) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {shot === 0 && currentSlide.imageCaption ? (
        <Animated.View style={[styles.caption, { opacity: headingOp }]}>
          <Feather name="camera" size={9} color="#ffffff77" />
          <Text style={styles.captionText} numberOfLines={1}>{currentSlide.imageCaption}</Text>
        </Animated.View>
      ) : null}

      {/* ━━ CONTROLS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <View style={[styles.controls, { paddingBottom: botPad }]}>
        {/* Slide dots */}
        <View style={styles.dotsRow}>
          {slides.map((_, i) => (
            <Pressable key={i} onPress={() => goToSlide(i)} style={{ padding: 5 }}>
              <View style={[
                styles.dot,
                i === slideIdx && styles.dotActive,
                i < slideIdx && styles.dotDone,
              ]} />
            </Pressable>
          ))}
        </View>

        {/* Buttons */}
        <View style={styles.btnRow}>
          <Pressable
            onPress={skipPrev}
            disabled={slideIdx === 0}
            style={[styles.sideBtn, slideIdx === 0 && styles.disabled]}
          >
            <Feather name="skip-back" size={20} color="#fff" />
          </Pressable>

          <Pressable onPress={finished ? restart : togglePlay} style={styles.playBtn}>
            <LinearGradient
              colors={["#6C63FF", "#A855F7"]}
              style={styles.playGrad}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            >
              <Feather
                name={finished ? "rotate-ccw" : playing ? "pause" : "play"}
                size={26} color="#fff"
                style={!playing && !finished ? { marginLeft: 3 } : undefined}
              />
            </LinearGradient>
          </Pressable>

          <Pressable
            onPress={skipNext}
            disabled={slideIdx === slides.length - 1}
            style={[styles.sideBtn, slideIdx === slides.length - 1 && styles.disabled]}
          >
            <Feather name="skip-forward" size={20} color="#fff" />
          </Pressable>
        </View>

        {/* Live narration ticker */}
        <NarrationTicker text={currentSlide.narration} playing={playing} shot={shot} />
      </View>
    </View>
  );
}

// ─── Word chip component (for key phrase reveal) ──────────────────────────────
function WordChip({ word, visible, index }: { word: string; visible: boolean; index: number }) {
  const scaleAnim = useRef(new Animated.Value(0.5)).current;
  const opAnim    = useRef(new Animated.Value(0)).current;
  const yAnim     = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(scaleAnim, { toValue: 1, friction: 5, tension: 100, useNativeDriver: false }),
        Animated.timing(opAnim,   { toValue: 1, duration: 250, useNativeDriver: false }),
        Animated.spring(yAnim,    { toValue: 0, friction: 7, tension: 80, useNativeDriver: false }),
      ]).start();
    }
  }, [visible]);

  return (
    <Animated.View style={[
      styles.wordChip,
      { opacity: opAnim, transform: [{ scale: scaleAnim }, { translateY: yAnim }] },
    ]}>
      <Text style={styles.wordChipText}>{word}</Text>
    </Animated.View>
  );
}

// ─── Narration ticker at bottom ───────────────────────────────────────────────
function NarrationTicker({ text, playing, shot }: { text: string; playing: boolean; shot: number }) {
  const opAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(opAnim, { toValue: playing ? 0.75 : 0.35, duration: 400, useNativeDriver: false }).start();
  }, [playing]);

  // On shot 1 & 2 only show the ticker
  if (shot === 0) return null;

  return (
    <Animated.View style={[styles.ticker, { opacity: opAnim }]}>
      <AudioBars playing={playing} />
      <Text style={styles.tickerText} numberOfLines={2}>{text}</Text>
    </Animated.View>
  );
}

// ─── Animated audio bars ──────────────────────────────────────────────────────
function AudioBars({ playing }: { playing: boolean }) {
  const bars = [
    useRef(new Animated.Value(0.3)).current,
    useRef(new Animated.Value(0.5)).current,
    useRef(new Animated.Value(0.3)).current,
    useRef(new Animated.Value(0.7)).current,
  ];
  const loopRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (!playing) { loopRef.current?.stop(); return; }
    const anims = bars.map((b, i) =>
      Animated.loop(Animated.sequence([
        Animated.delay(i * 120),
        Animated.timing(b, { toValue: 1,   duration: 200 + i * 60, useNativeDriver: false }),
        Animated.timing(b, { toValue: 0.2, duration: 200 + i * 60, useNativeDriver: false }),
      ]))
    );
    loopRef.current = Animated.parallel(anims);
    loopRef.current.start();
    return () => loopRef.current?.stop();
  }, [playing]);

  return (
    <View style={barStyles.row}>
      {bars.map((b, i) => (
        <Animated.View key={i} style={[barStyles.bar, {
          transform: [{ scaleY: b }],
          opacity: b.interpolate({ inputRange: [0.2, 1], outputRange: [0.5, 1] }),
        }]} />
      ))}
    </View>
  );
}

const barStyles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 2, width: 22 },
  bar: { width: 3, height: 16, borderRadius: 2, backgroundColor: "#6C63FF" },
});

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },

  imgLayer: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden",
  },

  gradTop: {
    position: "absolute", top: 0, left: 0, right: 0,
    height: H * 0.28, zIndex: 2,
  },
  gradBot: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    height: H * 0.55, zIndex: 2,
  },

  // Top bar
  topBar: {
    position: "absolute", top: 0, left: 0, right: 0, zIndex: 20,
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingBottom: 8,
  },
  closeBtn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: "#00000055",
    borderWidth: 1, borderColor: "#ffffff22",
    alignItems: "center", justifyContent: "center",
  },
  topMid: { flex: 1, paddingHorizontal: 10 },
  topTitle: { color: "#ffffffCC", fontSize: 12, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  shotPills: { flexDirection: "row", gap: 4, alignItems: "center" },
  shotDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#ffffff33" },
  shotDotActive: { backgroundColor: "#6C63FF", width: 14, borderRadius: 3 },

  // Progress
  progressRow: {
    position: "absolute",
    top: Platform.OS === "web" ? 58 : 76,
    left: 16, right: 16,
    flexDirection: "row", gap: 4, height: 3, zIndex: 20,
  },
  segTrack: { height: 3, borderRadius: 2, overflow: "hidden" },
  seg: { flex: 1, borderRadius: 2 },
  segDone: { backgroundColor: "#ffffffCC" },
  segEmpty: { backgroundColor: "#ffffff25" },
  segFill: { height: 3, backgroundColor: "#6C63FF", position: "absolute", left: 0, top: 0, borderRadius: 2 },

  // Shot 0: establish / lower-third
  shot0: {
    position: "absolute", bottom: 150, left: 0, right: 0, zIndex: 10,
    paddingHorizontal: 20, gap: 12,
  },
  sceneBadge: {
    flexDirection: "row", alignItems: "center", gap: 6,
    alignSelf: "flex-start",
    backgroundColor: "#6C63FF33",
    borderWidth: 1, borderColor: "#6C63FF66",
    borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5,
  },
  badgeDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: "#6C63FF" },
  badgeText: { color: "#A89BFF", fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.5 },
  headingCard: {
    backgroundColor: "#00000066",
    borderLeftWidth: 4, borderLeftColor: "#6C63FF",
    paddingHorizontal: 16, paddingVertical: 12,
    borderRadius: 4,
  },
  headingText: {
    fontSize: 28, fontFamily: "Inter_700Bold", color: "#FFFFFF",
    lineHeight: 34, letterSpacing: -0.3,
  },

  // Shot 1: word reveal
  shot1: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 140,
    zIndex: 10,
    justifyContent: "center", alignItems: "center",
    paddingHorizontal: 24,
  },
  phraseContainer: {
    flexDirection: "row", flexWrap: "wrap",
    justifyContent: "center", gap: 10,
    marginBottom: 28,
  },
  wordChip: {
    backgroundColor: "#6C63FF",
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 10,
  },
  wordChipText: {
    fontSize: 34, fontFamily: "Inter_700Bold", color: "#fff",
    letterSpacing: -0.5,
    textShadow: "0px 2px 6px #00000088",
  } as any,
  factText: {
    fontSize: 14, fontFamily: "Inter_400Regular", color: "#D0D4F0",
    lineHeight: 22, textAlign: "center",
  },

  // Shot 2: stat callout
  shot2: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 140,
    zIndex: 10,
    justifyContent: "center", alignItems: "center",
  },
  statBlock: { alignItems: "center", position: "relative" },
  statGlow: {
    position: "absolute",
    width: 220, height: 220, borderRadius: 110,
    backgroundColor: "#6C63FF18",
  },
  statNumber: {
    fontSize: 68, fontFamily: "Inter_700Bold", color: "#FFFFFF",
    textAlign: "center", letterSpacing: -2,
    textShadow: "0px 0px 30px #6C63FFCC",
  } as any,
  statLabel: {
    fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#A89BFF",
    letterSpacing: 2, textAlign: "center", marginTop: 4,
  },
  factBlock: {
    paddingHorizontal: 32, paddingVertical: 24,
    backgroundColor: "#00000077",
    borderRadius: 16, margin: 20,
  },
  factBig: {
    fontSize: 20, fontFamily: "Inter_600SemiBold", color: "#FFFFFF",
    lineHeight: 30, textAlign: "center",
  },

  // Caption
  caption: {
    position: "absolute", bottom: 148, left: 18, zIndex: 10,
    flexDirection: "row", alignItems: "center", gap: 5,
  },
  captionText: { color: "#ffffff55", fontSize: 10, fontFamily: "Inter_400Regular" },

  // Controls
  controls: {
    position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 20,
    paddingHorizontal: 20, gap: 8,
  },
  dotsRow: { flexDirection: "row", justifyContent: "center", gap: 5 },
  dot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: "#ffffff33" },
  dotActive: { width: 22, borderRadius: 3, backgroundColor: "#6C63FF" },
  dotDone: { backgroundColor: "#6C63FF66" },
  btnRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 24 },
  sideBtn: {
    width: 46, height: 46, borderRadius: 23,
    backgroundColor: "#ffffff10",
    borderWidth: 1, borderColor: "#ffffff18",
    alignItems: "center", justifyContent: "center",
  },
  disabled: { opacity: 0.25 },
  playBtn: { width: 66, height: 66, borderRadius: 33, overflow: "hidden" },
  playGrad: { flex: 1, alignItems: "center", justifyContent: "center" },

  // Ticker
  ticker: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 4,
  },
  tickerText: {
    flex: 1, fontSize: 11, fontFamily: "Inter_400Regular",
    color: "#9095B4", lineHeight: 16, fontStyle: "italic",
  },
});
