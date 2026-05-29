import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useAuth } from "@clerk/expo";
import React, { useState } from "react";
import {
  FlatList,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useColors } from "@/hooks/useColors";
import { useVideos, type VideoItem } from "@/context/VideoContext";
import { VideoCard } from "@/components/VideoCard";
import { LoadingOverlay } from "@/components/LoadingOverlay";
import { GradientButton } from "@/components/GradientButton";

const QUICK_TOPICS = [
  "The future of space exploration",
  "How black holes work",
  "Climate change solutions",
  "Quantum computing explained",
  "History of artificial intelligence",
];

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { signOut } = useAuth();
  const { history, addVideo } = useVideos();

  const [topic, setTopic] = useState("");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

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
        throw new Error(body?.error || "Failed to generate video");
      }

      const data = await res.json();
      const video: VideoItem = {
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        topic: t,
        script: data.script,
        videoUrl: data.videoUrl,
        thumbnailPrompt: data.thumbnailPrompt,
        duration: data.duration ?? 59,
        suggestions: data.suggestions ?? [],
        createdAt: Date.now(),
      };

      await addVideo(video);
      setTopic("");
      router.push({ pathname: "/(home)/video", params: { id: video.id } });
    } catch (e: any) {
      setError(e.message ?? "Something went wrong");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setGenerating(false);
    }
  };

  const handleVideoPress = (video: VideoItem) => {
    router.push({ pathname: "/(home)/video", params: { id: video.id } });
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <LoadingOverlay visible={generating} topic={topic} />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior="padding"
        keyboardVerticalOffset={0}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            { paddingTop: topPad + 16, paddingBottom: bottomPad + 24 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={[styles.appName, { color: colors.foreground }]}>AiVid</Text>
              <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>
                AI Video Generator
              </Text>
            </View>
            <Pressable
              onPress={() => signOut()}
              style={[styles.iconBtn, { backgroundColor: colors.secondary }]}
            >
              <Feather name="log-out" size={18} color={colors.mutedForeground} />
            </Pressable>
          </View>

          {/* Prompt Box */}
          <View style={[styles.promptCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.promptLabel, { color: colors.foreground }]}>
              What video do you want to create?
            </Text>
            <TextInput
              style={[styles.promptInput, { color: colors.foreground, backgroundColor: colors.input, borderColor: colors.border }]}
              value={topic}
              onChangeText={setTopic}
              placeholder="e.g. How do neural networks learn?"
              placeholderTextColor={colors.mutedForeground}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
              returnKeyType="done"
            />
            {error && (
              <Text style={[styles.errorText, { color: colors.destructive }]}>{error}</Text>
            )}
            <GradientButton
              label="Generate Video"
              onPress={() => handleGenerate()}
              loading={generating}
              disabled={!topic.trim() || generating}
            />
          </View>

          {/* Quick Topics */}
          <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>
            Quick topics
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.quickScroll}
            contentContainerStyle={styles.quickContent}
          >
            {QUICK_TOPICS.map((t) => (
              <Pressable
                key={t}
                onPress={() => { setTopic(t); handleGenerate(t); }}
                style={({ pressed }) => [
                  styles.quickChip,
                  { backgroundColor: colors.secondary, borderColor: colors.border },
                  pressed && { opacity: 0.7, borderColor: colors.primary },
                ]}
              >
                <Text style={[styles.quickChipText, { color: colors.foreground }]}>{t}</Text>
              </Pressable>
            ))}
          </ScrollView>

          {/* History */}
          {history.length > 0 && (
            <>
              <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>
                Recent videos
              </Text>
              {history.map((v) => (
                <VideoCard key={v.id} video={v} onPress={handleVideoPress} />
              ))}
            </>
          )}

          {history.length === 0 && (
            <View style={styles.emptyState}>
              <Feather name="film" size={40} color={colors.mutedForeground} />
              <Text style={[styles.emptyTitle, { color: colors.mutedForeground }]}>
                Your generated videos appear here
              </Text>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  scroll: { paddingHorizontal: 20 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 24,
  },
  appName: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.5,
  },
  headerSub: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  promptCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
    gap: 14,
    marginBottom: 28,
  },
  promptLabel: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  promptInput: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    minHeight: 90,
    lineHeight: 22,
  },
  errorText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  sectionTitle: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 12,
  },
  quickScroll: { marginBottom: 28 },
  quickContent: { paddingRight: 20, gap: 8, flexDirection: "row" },
  quickChip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
    borderWidth: 1,
  },
  quickChipText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 48,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
});
