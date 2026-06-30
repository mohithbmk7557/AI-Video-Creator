import { Feather } from "@expo/vector-icons";
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

interface VideoPlayerProps {
  title: string;
  videoUrl: string;
  onClose: () => void;
}

export function VideoPlayer({ title, videoUrl, onClose }: VideoPlayerProps) {
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 24 : insets.top;

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
    <View style={styles.root}>
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
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  video: { flex: 1 },
  topBar: {
    position: "absolute",
    top: 0, left: 0, right: 0,
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 12,
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
});
