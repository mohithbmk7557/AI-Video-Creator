import { Router } from "express";
import OpenAI from "openai";

const router = Router();

const openai = new OpenAI({
  baseURL: process.env["AI_INTEGRATIONS_OPENAI_BASE_URL"],
  apiKey: process.env["AI_INTEGRATIONS_OPENAI_API_KEY"],
});

const ACCENT_PALETTE = [
  "#1a3a5c", "#2d1b69", "#0f4c35", "#4a1942",
  "#1c3a1c", "#2c1810", "#1a2a4a", "#3d1a1a",
];

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
      ? `This is a follow-up about a previous topic: "${continuationOf}". Connect naturally.`
      : "";

    const systemPrompt = `You are an expert documentary scriptwriter and video content producer.
You create engaging, informative 59-second video experiences structured as a sequence of slides.
Each slide is a visual scene with narration. Be factual, vivid, and educational.
Always include real places, facts, and landmarks when relevant.`;

    const userPrompt = `Create a 59-second documentary-style slideshow video about: "${topic}"
${contextNote}

Produce 5-6 slides that together tell a complete story about this topic.
Each slide should last about 10 seconds and cover one key aspect.

For example, for "London" you would cover: overview/history, famous landmarks (London Eye, Tower Bridge, Buckingham Palace), culture/food, Thames river and parks, modern London and future.

Return ONLY valid JSON (no markdown, no extra text) with this exact structure:
{
  "title": "Descriptive title for the video",
  "slides": [
    {
      "id": "slide-1",
      "duration": 10,
      "heading": "Short impactful heading (4-6 words)",
      "fact": "One compelling fact or key information sentence about this aspect (15-25 words)",
      "narration": "Exactly what the narrator says for this slide (20-30 words, natural spoken English)",
      "imageQuery": "specific vivid image search query for background photo (5-8 words)"
    }
  ],
  "script": "Complete 59-second narration combining all slides naturally",
  "suggestions": [
    "related topic 1",
    "related topic 2",
    "related topic 3",
    "related topic 4"
  ]
}

IMPORTANT: Always include exactly 5-6 slides. Suggestions should be related but distinct topics.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-5.4",
      max_completion_tokens: 3000,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";

    let parsed: {
      title: string;
      slides: Array<{
        id: string;
        duration: number;
        heading: string;
        fact: string;
        narration: string;
        imageQuery: string;
      }>;
      script: string;
      suggestions: string[];
    };

    try {
      parsed = JSON.parse(raw);
    } catch {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("Failed to parse AI response");
      parsed = JSON.parse(jsonMatch[0]);
    }

    if (!parsed.slides || !Array.isArray(parsed.slides)) {
      throw new Error("Invalid AI response structure");
    }

    const slides = parsed.slides.slice(0, 6).map((s, i) => ({
      id: s.id ?? `slide-${i + 1}`,
      duration: s.duration ?? 10,
      heading: s.heading ?? "",
      fact: s.fact ?? "",
      narration: s.narration ?? "",
      imageQuery: s.imageQuery ?? topic,
      accent: ACCENT_PALETTE[i % ACCENT_PALETTE.length],
    }));

    return res.json({
      title: parsed.title ?? topic,
      slides,
      script: parsed.script ?? "",
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
