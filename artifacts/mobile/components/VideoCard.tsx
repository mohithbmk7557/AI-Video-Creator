import { Feather } from "@expo/vector-icons";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useColors } from "@/hooks/useColors";
import type { VideoItem } from "@/context/VideoContext";

interface Props {
  video: VideoItem;
  onPress: (video: VideoItem) => void;
}

export function VideoCard({ video, onPress }: Props) {
  const colors = useColors();

  const timeAgo = () => {
    const diff = Date.now() - video.createdAt;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  return (
    <Pressable
      onPress={() => onPress(video)}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: colors.card, borderColor: colors.border },
        pressed && { opacity: 0.8 },
      ]}
    >
      <View style={[styles.iconBox, { backgroundColor: colors.primary + "22" }]}>
        <Feather name="play-circle" size={26} color={colors.primary} />
      </View>
      <View style={styles.info}>
        <Text
          style={[styles.topic, { color: colors.foreground }]}
          numberOfLines={1}
        >
          {video.topic}
        </Text>
        <Text style={[styles.meta, { color: colors.mutedForeground }]}>
          {video.duration}s • {timeAgo()}
        </Text>
      </View>
      <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    gap: 12,
    marginBottom: 10,
  },
  iconBox: {
    width: 46,
    height: 46,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  info: {
    flex: 1,
    gap: 3,
  },
  topic: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  meta: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
});
