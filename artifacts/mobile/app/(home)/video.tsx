import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useVideos } from "@/context/VideoContext";
import { SuggestionChip } from "@/components/SuggestionChip";
import { LoadingOverlay } from "@/components/LoadingOverlay";

export default function VideoScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { history, addVideo } = useVideos();

  const video = history.find((v) => v.id === id);

  const [generating, setGenerating] = useState(false);
  const [newTopic, setNewTopic] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [scriptExpanded, setScriptExpanded] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playerError, setPlayerError] = useState<string | null>(null);

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const player = useVideoPlayer(video?.videoUrl ?? null, (p) => {
    p.loop = false;
    p.muted = false;
  });

  useEffect(() => {
    if (!player) return;
    const sub = player.addListener("playingChange", (e) => {
      setIsPlaying(e.isPlaying);
    });
    const errSub = player.addListener("statusChange", (e) => {
      if (e.status === "error") {
        setPlayerError("Could not load video. Try again later.");
      }
    });
    return () => {
      sub.remove();
      errSub.remove();
    };
  }, [player]);

  const togglePlay = useCallback(() => {
    if (!player) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (player.playing) {
      player.pause();
    } else {
      player.play();
    }
  }, [player]);

  const handleSuggestion = async (suggestion: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setNewTopic(suggestion);
    setGenerating(true);
    setError(null);

    try {
      const domain = process.env.EXPO_PUBLIC_DOMAIN;
      const baseUrl = domain ? `https://${domain}` : "";
      const res = await fetch(`${baseUrl}/api/video/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: suggestion, continuationOf: video?.topic }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as any)?.error || "Generation failed");
      }

      const data = await res.json() as {
        script: string;
        thumbnailPrompt: string;
        videoUrl: string;
        duration: number;
        suggestions: string[];
      };
      const newVideo = {
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        topic: suggestion,
        script: data.script,
        videoUrl: data.videoUrl,
        thumbnailPrompt: data.thumbnailPrompt,
        duration: data.duration ?? 59,
        suggestions: data.suggestions ?? [],
        createdAt: Date.now(),
      };

      await addVideo(newVideo);
      router.replace({ pathname: "/(home)/video", params: { id: newVideo.id } });
    } catch (e: any) {
      setError(e.message ?? "Something went wrong");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setGenerating(false);
      setNewTopic("");
    }
  };

  if (!video) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <View style={[styles.notFound, { paddingTop: topPad + 20 }]}>
          <Feather name="alert-circle" size={40} color={colors.mutedForeground} />
          <Text style={[styles.notFoundText, { color: colors.mutedForeground }]}>
            Video not found
          </Text>
          <Pressable onPress={() => router.back()}>
            <Text style={[styles.backLink, { color: colors.primary }]}>Go back</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <LoadingOverlay visible={generating} topic={newTopic} />

      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: topPad + 8, paddingBottom: bottomPad + 32 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Back button */}
        <Pressable
          onPress={() => router.back()}
          style={[styles.backBtn, { backgroundColor: colors.secondary }]}
        >
          <Feather name="arrow-left" size={20} color={colors.foreground} />
        </Pressable>

        {/* Video Player */}
        <View style={[styles.playerWrapper, { backgroundColor: "#000", borderColor: colors.border }]}>
          {video.videoUrl ? (
            <>
              <VideoView
                player={player}
                style={styles.videoView}
                allowsFullscreen
                allowsPictureInPicture={false}
                contentFit="contain"
                nativeControls={Platform.OS !== "web"}
              />
              {/* Overlay play button for web */}
              {Platform.OS === "web" && (
                <Pressable style={styles.webPlayOverlay} onPress={togglePlay}>
                  {!isPlaying && (
                    <View style={[styles.playCircle, { backgroundColor: colors.primary + "CC" }]}>
                      <Feather name="play" size={36} color="#fff" />
                    </View>
                  )}
                </Pressable>
              )}
              {playerError && (
                <View style={styles.playerErrorOverlay}>
                  <Text style={styles.playerErrorText}>{playerError}</Text>
                </View>
              )}
            </>
          ) : (
            <View style={styles.noVideoPlaceholder}>
              <Feather name="film" size={40} color={colors.mutedForeground} />
              <Text style={[styles.noVideoText, { color: colors.mutedForeground }]}>
                No video available
              </Text>
            </View>
          )}

          {/* Duration badge */}
          <View style={[styles.durationBadge, { backgroundColor: "#000000AA" }]}>
            <Text style={styles.durationText}>{video.duration}s</Text>
          </View>
        </View>

        {/* Topic */}
        <Text style={[styles.topic, { color: colors.foreground }]}>{video.topic}</Text>
        <Text style={[styles.meta, { color: colors.mutedForeground }]}>
          Generated {new Date(video.createdAt).toLocaleDateString()}
        </Text>

        {/* Script collapsible */}
        <Pressable
          onPress={() => setScriptExpanded((v) => !v)}
          style={[styles.scriptSection, { backgroundColor: colors.card, borderColor: colors.border }]}
        >
          <View style={styles.scriptHeader}>
            <Text style={[styles.scriptTitle, { color: colors.foreground }]}>Script</Text>
            <Feather
              name={scriptExpanded ? "chevron-up" : "chevron-down"}
              size={18}
              color={colors.mutedForeground}
            />
          </View>
          {scriptExpanded && (
            <Text style={[styles.scriptText, { color: colors.foreground }]}>
              {video.script}
            </Text>
          )}
        </Pressable>

        {error && (
          <Text style={[styles.errorText, { color: colors.destructive }]}>{error}</Text>
        )}

        {/* Continue suggestions */}
        {video.suggestions.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
              Continue the story
            </Text>
            <Text style={[styles.sectionSub, { color: colors.mutedForeground }]}>
              Generate a follow-up video on any of these
            </Text>
            <View style={styles.suggestions}>
              {video.suggestions.map((s) => (
                <SuggestionChip key={s} label={s} onPress={() => handleSuggestion(s)} />
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { paddingHorizontal: 20 },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  playerWrapper: {
    width: "100%",
    aspectRatio: 16 / 9,
    borderRadius: 20,
    borderWidth: 1,
    overflow: "hidden",
    marginBottom: 20,
    position: "relative",
  },
  videoView: {
    flex: 1,
    width: "100%",
    height: "100%",
  },
  webPlayOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  playCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    paddingLeft: 4,
  },
  playerErrorOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#00000088",
  },
  playerErrorText: {
    color: "#fff",
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    paddingHorizontal: 20,
  },
  noVideoPlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  noVideoText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  durationBadge: {
    position: "absolute",
    bottom: 12,
    right: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  durationText: {
    color: "#fff",
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  topic: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    lineHeight: 30,
    marginBottom: 6,
  },
  meta: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    marginBottom: 24,
  },
  scriptSection: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 28,
  },
  scriptHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  scriptTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  scriptText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 22,
    marginTop: 12,
  },
  errorText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    marginBottom: 4,
  },
  sectionSub: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    marginBottom: 16,
  },
  suggestions: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  notFound: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 24,
  },
  notFoundText: {
    fontSize: 16,
    fontFamily: "Inter_400Regular",
  },
  backLink: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
});
