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
  fact: string;
  narration: string;
  imageQuery: string;
  imageUrl: string;       // Real photo URL (Wikipedia or fallback)
  imageCaption: string;   // Photo caption / source label
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

const STORAGE_KEY = "@aivid_history_v3";

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
