import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export interface Slide {
  id: string;
  duration: number;
  heading: string;
  keyPhrase: string;       // 3–5 bold words for large center reveal
  fact: string;            // full educational fact
  narration: string;       // spoken narration text
  imageQueries: string[];  // [shot1 query, shot2 query, shot3 query]
  imageUrls: string[];     // [shot1 url, shot2 url, shot3 url]
  imageCaption: string;
  stat: string;            // e.g. "2,300 miles"
  statLabel: string;       // e.g. "of wall constructed"
  accent: string;
}

export interface VideoItem {
  id: string;
  topic: string;
  title: string;
  slides: Slide[];
  script: string;
  suggestions: string[];
  createdAt: number;
}

interface VideoContextValue {
  history: VideoItem[];
  addVideo: (video: VideoItem) => Promise<void>;
  clearHistory: () => Promise<void>;
}

const VideoContext = createContext<VideoContextValue>({
  history: [],
  addVideo: async () => {},
  clearHistory: async () => {},
});

const STORAGE_KEY = "@aivid_history_v4";

export function VideoProvider({ children }: { children: ReactNode }) {
  const [history, setHistory] = useState<VideoItem[]>([]);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((val) => {
      if (val) {
        try { setHistory(JSON.parse(val)); } catch {}
      }
    });
  }, []);

  const addVideo = useCallback(async (video: VideoItem) => {
    setHistory((prev) => {
      const updated = [video, ...prev].slice(0, 30);
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  const clearHistory = useCallback(async () => {
    await AsyncStorage.removeItem(STORAGE_KEY);
    setHistory([]);
  }, []);

  return (
    <VideoContext.Provider value={{ history, addVideo, clearHistory }}>
      {children}
    </VideoContext.Provider>
  );
}

export function useVideos() {
  return useContext(VideoContext);
}
