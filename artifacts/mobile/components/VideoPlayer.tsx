import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useVideoPlayer, VideoView } from "expo-video";
import React, { useEffect } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";

interface VideoPlayerProps {
  title: string;
  videoUrl: string;
  engine: "ltx-2.3" | "slideshow-fallback";
  onClose: () => void;
}

export function VideoPlayer({ title, videoUrl, engine, onClose }: VideoPlayerProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 24 : insets.top;

  const isLiteMode = engine === "slideshow-fallback";

  const player = useVideoPlayer(videoUrl, (p) => {
    p.loop = false;
    p.play();
  });

  useEffect(() => {
    return () => {
      try { player.pause(); } catch {}
    };
  }, [player]);

  return (
    <View style={[styles.root, { backgroundColor: "#000" }]}>
      {/* Video */}
      <VideoView
        player={player}
        style={styles.video}
        contentFit="contain"
        nativeControls
      />

      {/* Top bar */}
      <View style={[styles.topBar, { paddingTop: topPad + 8 }]}>
        <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={12}>
          <Feather name="x" size={22} color="#fff" />
        </Pressable>

        <View style={styles.titleArea}>
          <Text style={styles.titleText} numberOfLines={2}>{title}</Text>
        </View>

        {isLiteMode && (
          <View style={styles.liteBadge}>
            <Feather name="zap" size={11} color="#f59e0b" />
            <Text style={styles.liteBadgeText}>Lite Mode</Text>
          </View>
        )}
      </View>

      {/* Engine info bar at bottom */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 16 }]}>
        <LinearGradient
          colors={isLiteMode ? ["#92400e", "#78350f"] : ["#1e1b4b", "#312e81"]}
          style={styles.enginePill}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
        >
          <Feather
            name={isLiteMode ? "layers" : "cpu"}
            size={12}
            color={isLiteMode ? "#fcd34d" : "#a5b4fc"}
          />
          <Text style={[styles.engineText, { color: isLiteMode ? "#fcd34d" : "#a5b4fc" }]}>
            {isLiteMode ? "Generated in Lite Mode — Slideshow Engine" : "Generated with LTX-2.3"}
          </Text>
        </LinearGradient>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  video: { flex: 1 },
  topBar: {
    position: "absolute",
    top: 0, left: 0, right: 0,
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 12,
    backgroundColor: "transparent",
  },
  closeBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: "#00000088",
    alignItems: "center", justifyContent: "center",
  },
  titleArea: { flex: 1, paddingTop: 8 },
  titleText: {
    color: "#fff",
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    lineHeight: 20,
    textShadowColor: "#000",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  liteBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#78350f",
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginTop: 6,
  },
  liteBadgeText: {
    color: "#fcd34d",
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  bottomBar: {
    position: "absolute",
    bottom: 0, left: 0, right: 0,
    alignItems: "center",
    paddingHorizontal: 16,
  },
  enginePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  engineText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
});
