import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { useAppAuth } from "@/context/AuthContext";
import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import { useVideos, type VideoItem } from "@/context/VideoContext";
import { VideoPlayer } from "@/components/VideoPlayer";

const DEFAULT_SUGGESTIONS = [
  "London landmarks",
  "How AI works",
  "The Great Wall of China",
  "Black holes explained",
  "Tokyo culture",
  "Amazon rainforest",
];

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { signOut } = useAppAuth();
  const { history, addVideo, clearHistory } = useVideos();

  const [topic, setTopic] = useState("");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeVideo, setActiveVideo] = useState<VideoItem | null>(null);

  const listRef = useRef<FlatList>(null);
  const topPad = Platform.OS === "web" ? 56 : insets.top;
  const bottomPad = Platform.OS === "web" ? 20 : insets.bottom;

  const suggestions = history.length > 0
    ? [...new Set(history.flatMap((v) => v.suggestions))].slice(0, 8)
    : DEFAULT_SUGGESTIONS;

  const handleGenerate = async (inputTopic?: string) => {
    const t = (inputTopic ?? topic).trim();
    if (!t || generating) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setGenerating(true);
    setError(null);

    try {
      const domain = process.env.EXPO_PUBLIC_DOMAIN;
      const baseUrl = domain ? `https://${domain}` : "";
      const res = await fetch(`${baseUrl}/api/video/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: t }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as any)?.error || "Failed to generate video");
      }

      const data = await res.json() as {
        title: string;
        videoUrl: string;
        script: string;
        suggestions: string[];
      };

      const video: VideoItem = {
        id: Date.now().toString() + Math.random().toString(36).slice(2, 8),
        topic: t,
        title: data.title ?? t,
        // Absolute URL so expo-video can stream it on native devices
        videoUrl: `${baseUrl}${data.videoUrl}`,
        script: data.script ?? "",
        suggestions: data.suggestions ?? [],
        createdAt: Date.now(),
      };

      await addVideo(video);
      setTopic("");
      setActiveVideo(video);

      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 300);
    } catch (e: any) {
      setError(e.message ?? "Something went wrong");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setGenerating(false);
    }
  };

  const renderItem = ({ item }: { item: VideoItem }) => (
    <VideoHistoryItem video={item} colors={colors} onPlay={() => setActiveVideo(item)} />
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 8, borderBottomColor: colors.border }]}>
        <LinearGradient colors={[colors.gradientStart, colors.gradientEnd]} style={styles.headerIcon} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
          <Feather name="film" size={16} color="#fff" />
        </LinearGradient>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>AiVid</Text>
        <View style={styles.headerRight}>
          <Pressable onPress={() => clearHistory()} style={[styles.iconBtn, { backgroundColor: colors.secondary }]}>
            <Feather name="trash-2" size={16} color={colors.mutedForeground} />
          </Pressable>
          <Pressable onPress={() => signOut()} style={[styles.iconBtn, { backgroundColor: colors.secondary }]}>
            <Feather name="log-out" size={16} color={colors.mutedForeground} />
          </Pressable>
        </View>
      </View>

      {/* History list */}
      {history.length === 0 ? (
        <View style={styles.emptyState}>
          <Feather name="film" size={48} color={colors.mutedForeground} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>What do you want to learn about?</Text>
          <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
            Enter any topic below and I'll generate a{"\n"}59-second documentary video for you.
          </Text>
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={[...history].reverse()}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        />
      )}

      {/* Bottom area */}
      <View style={[styles.bottomArea, { paddingBottom: bottomPad + 8, borderTopColor: colors.border, backgroundColor: colors.background }]}>
        {/* Suggestions */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.suggestionsRow}
          style={styles.suggestionsScroll}
        >
          {suggestions.map((s) => (
            <Pressable
              key={s}
              onPress={() => handleGenerate(s)}
              style={({ pressed }) => [
                styles.suggestionChip,
                { backgroundColor: colors.secondary, borderColor: colors.border },
                pressed && { borderColor: colors.primary, opacity: 0.8 },
              ]}
              disabled={generating}
            >
              <Text style={[styles.suggestionText, { color: colors.foreground }]} numberOfLines={1}>{s}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* Generating progress */}
        {generating && (
          <View style={[styles.progressRow, { backgroundColor: colors.primary + "18", borderColor: colors.primary + "33" }]}>
            <ActivityIndicator size="small" color={colors.primary} />
            <View style={styles.progressText}>
              <Text style={[styles.progressLabel, { color: colors.foreground }]}>Building your video…</Text>
              <Text style={[styles.progressSub, { color: colors.mutedForeground }]}>Generating script, images & audio — this takes ~60s</Text>
            </View>
          </View>
        )}

        {/* Error */}
        {error && (
          <View style={[styles.errorRow, { backgroundColor: colors.destructive + "22" }]}>
            <Feather name="alert-circle" size={13} color={colors.destructive} />
            <Text style={[styles.errorText, { color: colors.destructive }]}>{error}</Text>
          </View>
        )}

        {/* Input bar */}
        <View style={[styles.inputBar, { backgroundColor: colors.input, borderColor: generating ? colors.primary : colors.border }]}>
          <TextInput
            style={[styles.textInput, { color: colors.foreground }]}
            value={topic}
            onChangeText={(v) => { setTopic(v); setError(null); }}
            placeholder="Ask about any topic…"
            placeholderTextColor={colors.mutedForeground}
            onSubmitEditing={() => handleGenerate()}
            returnKeyType="send"
            multiline={false}
            editable={!generating}
          />
          <Pressable
            onPress={() => handleGenerate()}
            disabled={!topic.trim() || generating}
            style={({ pressed }) => [
              styles.sendBtn,
              { backgroundColor: topic.trim() && !generating ? colors.primary : colors.secondary },
              pressed && { opacity: 0.8 },
            ]}
          >
            {generating
              ? <ActivityIndicator size="small" color={colors.primary} />
              : <Feather name="arrow-up" size={18} color={topic.trim() ? "#fff" : colors.mutedForeground} />
            }
          </Pressable>
        </View>
      </View>

      {/* Fullscreen video player modal */}
      <Modal
        visible={activeVideo !== null}
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => setActiveVideo(null)}
      >
        {activeVideo && (
          <VideoPlayer
            title={activeVideo.title}
            videoUrl={activeVideo.videoUrl}
            onClose={() => setActiveVideo(null)}
          />
        )}
      </Modal>
    </View>
  );
}

function VideoHistoryItem({
  video, colors, onPlay,
}: {
  video: VideoItem;
  colors: ReturnType<typeof import("@/hooks/useColors").useColors>;
  onPlay: () => void;
}) {
  const timeLabel = new Date(video.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <View style={styles.historyItem}>
      {/* User query bubble */}
      <View style={styles.userBubbleRow}>
        <View style={[styles.userBubble, { backgroundColor: "#6C63FF22", borderColor: "#6C63FF44" }]}>
          <Text style={[styles.userBubbleText, { color: colors.foreground }]}>{video.topic}</Text>
        </View>
        <Text style={[styles.timeLabel, { color: colors.mutedForeground }]}>{timeLabel}</Text>
      </View>

      {/* Video card */}
      <Pressable
        onPress={onPlay}
        style={({ pressed }) => [styles.videoCard, { backgroundColor: colors.card, borderColor: colors.border }, pressed && { opacity: 0.92, transform: [{ scale: 0.985 }] }]}
      >
        {/* Thumbnail */}
        <View style={styles.cardThumb}>
          <LinearGradient
            colors={["#1e1b4b", "#0f172a"]}
            style={StyleSheet.absoluteFill}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          />
          <LinearGradient colors={["#6C63FF", "#7C3AED"]} style={styles.thumbPlayBtn} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
            <Feather name="play" size={14} color="#fff" style={{ marginLeft: 2 }} />
          </LinearGradient>
          <View style={styles.durationBadge}>
            <Text style={styles.durationBadgeText}>59s</Text>
          </View>
        </View>

        {/* Text content */}
        <View style={styles.cardBody}>
          <View style={styles.cardTitleRow}>
            <View style={styles.aiPill}>
              <Text style={styles.aiPillText}>AI Video</Text>
            </View>
          </View>
          <Text style={[styles.cardTitle, { color: colors.foreground }]} numberOfLines={2}>{video.title}</Text>
          <Text style={[styles.cardMeta, { color: colors.mutedForeground }]}>AI generated · Tap to watch</Text>
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    gap: 10,
  },
  headerIcon: { width: 30, height: 30, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 17, fontFamily: "Inter_700Bold", flex: 1 },
  headerRight: { flexDirection: "row", gap: 8 },
  iconBtn: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  emptyState: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32, gap: 14 },
  emptyTitle: { fontSize: 20, fontFamily: "Inter_700Bold", textAlign: "center", lineHeight: 28 },
  emptySub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 22 },
  list: { paddingHorizontal: 16, paddingVertical: 16, gap: 24 },
  historyItem: { gap: 8 },
  userBubbleRow: { alignItems: "flex-end", gap: 4 },
  userBubble: {
    alignSelf: "flex-end", maxWidth: "80%",
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18, borderWidth: 1,
  },
  userBubbleText: { fontSize: 14, fontFamily: "Inter_500Medium", lineHeight: 20 },
  timeLabel: { fontSize: 11, fontFamily: "Inter_400Regular", marginRight: 4 },
  videoCard: {
    borderRadius: 16, borderWidth: 1, overflow: "hidden",
    flexDirection: "row", alignItems: "stretch",
  },
  cardThumb: {
    width: 110, height: 80,
    backgroundColor: "#1a1a2e", overflow: "hidden",
    alignItems: "center", justifyContent: "center",
  },
  thumbPlayBtn: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: "center", justifyContent: "center",
  },
  durationBadge: {
    position: "absolute", bottom: 6, right: 6,
    backgroundColor: "#000000AA", borderRadius: 8,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  durationBadgeText: { color: "#fff", fontSize: 10, fontFamily: "Inter_700Bold" },
  cardBody: { flex: 1, paddingHorizontal: 12, paddingVertical: 10, gap: 4, justifyContent: "center" },
  cardTitleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  aiPill: {
    backgroundColor: "#6C63FF22", borderRadius: 10,
    paddingHorizontal: 8, paddingVertical: 2,
    borderWidth: 1, borderColor: "#6C63FF44",
  },
  aiPillText: { color: "#6C63FF", fontSize: 10, fontFamily: "Inter_600SemiBold" },
  cardTitle: { fontSize: 13, fontFamily: "Inter_600SemiBold", lineHeight: 19 },
  cardMeta: { fontSize: 11, fontFamily: "Inter_400Regular" },
  bottomArea: { borderTopWidth: 1, paddingHorizontal: 12, paddingTop: 10, gap: 8 },
  suggestionsScroll: { maxHeight: 38 },
  suggestionsRow: { gap: 8, paddingRight: 8 },
  suggestionChip: {
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: 20, borderWidth: 1, height: 34, justifyContent: "center",
  },
  suggestionText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  progressRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    padding: 10, borderRadius: 12, borderWidth: 1,
  },
  progressText: { flex: 1 },
  progressLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  progressSub: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  errorRow: { flexDirection: "row", alignItems: "center", gap: 6, padding: 8, borderRadius: 8 },
  errorText: { fontSize: 12, fontFamily: "Inter_400Regular", flex: 1 },
  inputBar: {
    flexDirection: "row", alignItems: "center", gap: 8,
    borderRadius: 26, borderWidth: 1.5, paddingLeft: 16, paddingRight: 6, paddingVertical: 6,
    minHeight: 52,
  },
  textInput: {
    flex: 1, fontSize: 15, fontFamily: "Inter_400Regular",
    maxHeight: 100, paddingVertical: 4,
  },
  sendBtn: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: "center", justifyContent: "center",
  },
});
