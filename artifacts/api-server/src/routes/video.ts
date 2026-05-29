import { Router } from "express";
import OpenAI from "openai";

const router = Router();

const openai = new OpenAI({
  baseURL: process.env["AI_INTEGRATIONS_OPENAI_BASE_URL"],
  apiKey: process.env["AI_INTEGRATIONS_OPENAI_API_KEY"],
});

// Freely available stock/public domain MP4s grouped by keyword
const VIDEO_LIBRARY: Record<string, string> = {
  space: "https://cdn.coverr.co/videos/coverr-view-of-earth-from-space-4774/1080p.mp4",
  universe: "https://cdn.coverr.co/videos/coverr-view-of-earth-from-space-4774/1080p.mp4",
  galaxy: "https://cdn.coverr.co/videos/coverr-view-of-earth-from-space-4774/1080p.mp4",
  planet: "https://cdn.coverr.co/videos/coverr-view-of-earth-from-space-4774/1080p.mp4",
  "black hole": "https://cdn.coverr.co/videos/coverr-view-of-earth-from-space-4774/1080p.mp4",
  star: "https://cdn.coverr.co/videos/coverr-view-of-earth-from-space-4774/1080p.mp4",
  ocean: "https://cdn.coverr.co/videos/coverr-ocean-aerial-6698/1080p.mp4",
  sea: "https://cdn.coverr.co/videos/coverr-ocean-aerial-6698/1080p.mp4",
  water: "https://cdn.coverr.co/videos/coverr-ocean-aerial-6698/1080p.mp4",
  wave: "https://cdn.coverr.co/videos/coverr-ocean-aerial-6698/1080p.mp4",
  nature: "https://cdn.coverr.co/videos/coverr-aerial-forest-7077/1080p.mp4",
  forest: "https://cdn.coverr.co/videos/coverr-aerial-forest-7077/1080p.mp4",
  tree: "https://cdn.coverr.co/videos/coverr-aerial-forest-7077/1080p.mp4",
  climate: "https://cdn.coverr.co/videos/coverr-aerial-forest-7077/1080p.mp4",
  city: "https://cdn.coverr.co/videos/coverr-new-york-city-at-night-2911/1080p.mp4",
  urban: "https://cdn.coverr.co/videos/coverr-new-york-city-at-night-2911/1080p.mp4",
  technology: "https://cdn.coverr.co/videos/coverr-typing-on-a-laptop-5191/1080p.mp4",
  computer: "https://cdn.coverr.co/videos/coverr-typing-on-a-laptop-5191/1080p.mp4",
  ai: "https://cdn.coverr.co/videos/coverr-typing-on-a-laptop-5191/1080p.mp4",
  data: "https://cdn.coverr.co/videos/coverr-typing-on-a-laptop-5191/1080p.mp4",
  quantum: "https://cdn.coverr.co/videos/coverr-typing-on-a-laptop-5191/1080p.mp4",
  science: "https://cdn.coverr.co/videos/coverr-typing-on-a-laptop-5191/1080p.mp4",
  biology: "https://cdn.coverr.co/videos/coverr-aerial-forest-7077/1080p.mp4",
  human: "https://cdn.coverr.co/videos/coverr-people-walking-in-the-city-5087/1080p.mp4",
  people: "https://cdn.coverr.co/videos/coverr-people-walking-in-the-city-5087/1080p.mp4",
  history: "https://cdn.coverr.co/videos/coverr-clock-hands-2734/1080p.mp4",
  time: "https://cdn.coverr.co/videos/coverr-clock-hands-2734/1080p.mp4",
  food: "https://cdn.coverr.co/videos/coverr-cooking-in-a-pan-3307/1080p.mp4",
  health: "https://cdn.coverr.co/videos/coverr-sunrise-on-the-mountains-2648/1080p.mp4",
  mountain: "https://cdn.coverr.co/videos/coverr-sunrise-on-the-mountains-2648/1080p.mp4",
  business: "https://cdn.coverr.co/videos/coverr-business-meeting-2978/1080p.mp4",
  future: "https://cdn.coverr.co/videos/coverr-typing-on-a-laptop-5191/1080p.mp4",
};

const FALLBACK_VIDEO =
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4";

function pickVideoUrl(topic: string): string {
  const lower = topic.toLowerCase();
  for (const [keyword, url] of Object.entries(VIDEO_LIBRARY)) {
    if (lower.includes(keyword)) return url;
  }
  return FALLBACK_VIDEO;
}

router.post("/generate", async (req, res) => {
  try {
    const { topic, continuationOf } = req.body as {
      topic: string;
      continuationOf?: string;
    };

    if (!topic || typeof topic !== "string") {
      return res.status(400).json({ error: "topic is required" });
    }

    const contextNote = continuationOf
      ? `This video is a continuation of a previous video about: "${continuationOf}". Build naturally on that context.`
      : "";

    const systemPrompt = `You are an expert documentary scriptwriter and video producer. 
You create engaging, informative 59-second video scripts that are well-researched and compelling.
Structure every script as a fast-paced documentary with clear narration.
Always base content on accurate, up-to-date information about the topic.`;

    const userPrompt = `Create a complete production package for a 59-second AI-generated video about: "${topic}"
${contextNote}

Return a JSON object with exactly these fields:
{
  "script": "The full narration script for the 59-second video. Should be ~170-200 words, spoken naturally. Include clear scene directions in [brackets].",
  "thumbnailPrompt": "A vivid 20-word image generation prompt for the video thumbnail",
  "duration": 59,
  "suggestions": [
    "First follow-up video topic suggestion (related but deeper)",
    "Second follow-up video topic suggestion (different angle)",
    "Third follow-up video topic suggestion (practical application)",
    "Fourth follow-up video topic suggestion (historical context or future)"
  ]
}

The suggestions should be compelling continuations that keep the viewer engaged in a series.
Return only valid JSON, no markdown, no extra text.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-5.4",
      max_completion_tokens: 2048,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";

    let parsed: {
      script: string;
      thumbnailPrompt: string;
      duration: number;
      suggestions: string[];
    };

    try {
      parsed = JSON.parse(raw);
    } catch {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("Failed to parse AI response");
      parsed = JSON.parse(jsonMatch[0]);
    }

    if (!parsed.script || !parsed.suggestions) {
      throw new Error("Invalid AI response structure");
    }

    const videoUrl = pickVideoUrl(topic);

    return res.json({
      script: parsed.script,
      thumbnailPrompt: parsed.thumbnailPrompt ?? "",
      videoUrl,
      duration: parsed.duration ?? 59,
      suggestions: Array.isArray(parsed.suggestions)
        ? parsed.suggestions.slice(0, 4)
        : [],
    });
  } catch (err: any) {
    req.log?.error({ err }, "Video generation failed");
    return res.status(500).json({ error: err?.message ?? "Internal server error" });
  }
});

export default router;
