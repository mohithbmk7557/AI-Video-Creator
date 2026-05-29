import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useRef, useState } from "react";
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

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

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
        throw new Error(body?.error || "Generation failed");
      }

      const data = await res.json();
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

        {/* Video player placeholder */}
        <View style={[styles.videoPlayer, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.playIconCircle, { backgroundColor: colors.primary + "33" }]}>
            <Feather name="play" size={40} color={colors.primary} />
          </View>
          <Text style={[styles.durationBadge, { backgroundColor: colors.background + "CC", color: colors.foreground }]}>
            {video.duration}s
          </Text>
        </View>

        {/* Topic */}
        <Text style={[styles.topic, { color: colors.foreground }]}>{video.topic}</Text>
        <Text style={[styles.meta, { color: colors.mutedForeground }]}>
          Generated {new Date(video.createdAt).toLocaleDateString()}
        </Text>

        {/* Script */}
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
            <Text style={[styles.scriptText, { color: colors.foreground }]}>{video.script}</Text>
          )}
        </Pressable>

        {/* Error */}
        {error && (
          <Text style={[styles.errorText, { color: colors.destructive }]}>{error}</Text>
        )}

        {/* Continue suggestions */}
        {video.suggestions.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>
              Continue the story
            </Text>
            <Text style={[styles.sectionSub, { color: colors.mutedForeground }]}>
              Generate a follow-up video
            </Text>
            <View style={styles.suggestions}>
              {video.suggestions.map((s) => (
                <SuggestionChip
                  key={s}
                  label={s}
                  onPress={() => handleSuggestion(s)}
                />
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
  videoPlayer: {
    width: "100%",
    aspectRatio: 16 / 9,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
    overflow: "hidden",
  },
  playIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  durationBadge: {
    position: "absolute",
    bottom: 12,
    right: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
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
