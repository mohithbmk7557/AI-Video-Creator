import { Router } from "express";
import OpenAI from "openai";

const router = Router();

const openai = new OpenAI({
  baseURL: process.env["AI_INTEGRATIONS_OPENAI_BASE_URL"],
  apiKey: process.env["AI_INTEGRATIONS_OPENAI_API_KEY"],
});

const ACCENT_PALETTE = [
  "#0d2137", "#1a0d3b", "#0a2820", "#2b0f27",
  "#0d1f0d", "#1a0c07", "#0d1a2e", "#220d0d",
];

// ─── Wikipedia helpers ────────────────────────────────────────────────────────

interface WikiPhoto {
  url: string;
  caption: string;
  width: number;
  height: number;
}

async function fetchWikipediaPhotos(topic: string): Promise<{
  summary: string;
  mainPhoto: WikiPhoto | null;
  photos: WikiPhoto[];
}> {
  const encoded = encodeURIComponent(topic);
  const UA = "AiVid/1.0 (educational app; https://replit.com)";

  try {
    // 1. Get article summary + main image
    const summaryRes = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encoded}`,
      { headers: { "User-Agent": UA } }
    );

    let summary = "";
    let mainPhoto: WikiPhoto | null = null;
    let pageTitle = topic;

    if (summaryRes.ok) {
      const summaryData = await summaryRes.json() as {
        title?: string;
        extract?: string;
        originalimage?: { source: string; width: number; height: number };
        thumbnail?: { source: string; width: number; height: number };
      };
      summary = summaryData.extract?.slice(0, 600) ?? "";
      pageTitle = summaryData.title ?? topic;
      const img = summaryData.originalimage ?? summaryData.thumbnail;
      if (img?.source && isGoodPhoto(img.source)) {
        mainPhoto = { url: ensureHttps(img.source), caption: pageTitle, width: img.width, height: img.height };
      }
    }

    // Run media-list and Commons search in parallel
    const [mediaRes, commonsRes] = await Promise.all([
      fetch(
        `https://en.wikipedia.org/api/rest_v1/page/media-list/${encodeURIComponent(pageTitle)}`,
        { headers: { "User-Agent": UA } }
      ),
      fetch(
        `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encoded}&gsrnamespace=6&prop=imageinfo&iiprop=url|size|mime&format=json&gsrlimit=15&origin=*`,
        { headers: { "User-Agent": UA } }
      ),
    ]);

    const photos: WikiPhoto[] = [];
    if (mainPhoto) photos.push(mainPhoto);

    // 2. Wikipedia article media-list (uses srcset array)
    if (mediaRes.ok) {
      const mediaData = await mediaRes.json() as {
        items?: Array<{
          type: string;
          title?: string;
          showInGallery?: boolean;
          srcset?: Array<{ src: string; scale: string }>;
          caption?: { html?: string; text?: string };
          captions?: Record<string, string>;
        }>;
      };

      const items = (mediaData.items ?? []).filter(
        (it) => it.type === "image" && it.showInGallery !== false
      );

      for (const item of items) {
        // Prefer 2x (1280px) if available, else 1x
        const srcEntry = item.srcset?.find((s) => s.scale === "2x") ?? item.srcset?.[0];
        if (!srcEntry?.src) continue;
        const url = ensureHttps(srcEntry.src);
        if (!isGoodPhoto(url)) continue;
        const caption =
          item.captions?.en ??
          stripHtml(item.caption?.html ?? "") ??
          item.title?.replace(/^File:/, "").replace(/_/g, " ").replace(/\.\w+$/, "") ??
          "";
        if (!photos.find((p) => p.url === url)) {
          photos.push({ url, caption: caption.slice(0, 120), width: 0, height: 0 });
        }
        if (photos.length >= 12) break;
      }
    }

    // 3. Wikimedia Commons search — fills in gaps with diverse topic photos
    if (photos.length < 6 && commonsRes.ok) {
      const commonsData = await commonsRes.json() as {
        query?: { pages?: Record<string, {
          title?: string;
          imageinfo?: Array<{ url: string; width: number; height: number; mime: string }>;
        }> };
      };
      const pages = Object.values(commonsData.query?.pages ?? {});
      for (const page of pages) {
        const ii = page.imageinfo?.[0];
        if (!ii?.url || !isGoodPhoto(ii.url)) continue;
        if (ii.mime && !ii.mime.startsWith("image/jpeg") && !ii.mime.startsWith("image/png")) continue;
        if (ii.width > 0 && ii.height > 0 && ii.width < ii.height * 0.5) continue;
        const caption = page.title?.replace(/^File:/, "").replace(/_/g, " ").replace(/\.\w+$/, "") ?? "";
        if (!photos.find((p) => p.url === ii.url)) {
          photos.push({ url: ii.url, caption: caption.slice(0, 120), width: ii.width, height: ii.height });
        }
        if (photos.length >= 12) break;
      }
    }

    return { summary, mainPhoto, photos };
  } catch {
    return { summary: "", mainPhoto: null, photos: [] };
  }
}

function ensureHttps(url: string): string {
  if (url.startsWith("//")) return "https:" + url;
  return url;
}

function isGoodPhoto(url: string): boolean {
  const u = url.toLowerCase();
  if (u.match(/\.(svg|gif|webp|tiff|bmp|ico)$/)) return false;
  if (u.includes("commons-logo") || u.includes("wikimedia-logo")) return false;
  if (u.includes("flag_of") || u.includes("coat_of_arms")) return false;
  if (u.includes("_icon") || u.includes("icon_")) return false;
  if (u.includes("logo") || u.includes("_map")) return false;
  return u.match(/\.(jpg|jpeg|png)($|\?)/) !== null;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, "").trim();
}

// ─── Route ────────────────────────────────────────────────────────────────────

router.post("/generate", async (req, res) => {
  try {
    const { topic, continuationOf } = req.body as {
      topic: string;
      continuationOf?: string;
    };

    if (!topic || typeof topic !== "string") {
      return res.status(400).json({ error: "topic is required" });
    }

    // Fetch real Wikipedia photos + summary in parallel with AI call
    const wikiPromise = fetchWikipediaPhotos(topic);

    const contextNote = continuationOf
      ? `This is a follow-up about: "${continuationOf}". Connect naturally.`
      : "";

    const systemPrompt = `You are an expert documentary scriptwriter.
Create engaging, fact-rich 59-second video scripts structured as visual scenes.
Use precise, verifiable facts. Be vivid and educational.`;

    const userPrompt = `Create a 59-second documentary slideshow about: "${topic}"
${contextNote}

Produce exactly 5-6 slides covering distinct aspects of the topic (e.g. for London: history/origins, iconic landmarks, culture/food, the Thames & parks, modern economy, future).

Return ONLY valid JSON:
{
  "title": "Compelling descriptive title (6-10 words)",
  "slides": [
    {
      "id": "slide-1",
      "duration": 10,
      "heading": "Scene heading (4-6 bold words)",
      "fact": "Specific, fascinating fact about this aspect (20-30 words, include real numbers/dates/names)",
      "narration": "Natural spoken narration for this scene (25-35 words, TV documentary tone)",
      "imageQuery": "precise image search query to find a real photo of this (5-8 words)"
    }
  ],
  "script": "Complete flowing 59-second narration",
  "suggestions": ["related topic 1", "related topic 2", "related topic 3", "related topic 4"]
}`;

    const [wikiData, completion] = await Promise.all([
      wikiPromise,
      openai.chat.completions.create({
        model: "gpt-5.4",
        max_completion_tokens: 3000,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    ]);

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

    const { photos, summary } = wikiData;

    // Assign real photos to slides — cycle through available Wikipedia photos
    const slides = parsed.slides.slice(0, 6).map((s, i) => {
      // Try to pick a different photo for each slide
      const photo = photos[i % Math.max(photos.length, 1)];
      const fallbackUrl = `https://source.unsplash.com/900x600/?${encodeURIComponent(s.imageQuery)}&sig=${i}`;

      return {
        id: s.id ?? `slide-${i + 1}`,
        duration: s.duration ?? 10,
        heading: s.heading ?? "",
        fact: s.fact ?? "",
        narration: s.narration ?? "",
        imageQuery: s.imageQuery ?? topic,
        imageUrl: photo?.url ?? fallbackUrl,
        imageCaption: photo?.caption ?? s.imageQuery,
        accent: ACCENT_PALETTE[i % ACCENT_PALETTE.length],
      };
    });

    return res.json({
      title: parsed.title ?? topic,
      slides,
      script: parsed.script ?? "",
      suggestions: Array.isArray(parsed.suggestions)
        ? parsed.suggestions.slice(0, 4)
        : [],
      wikiSummary: summary,
    });
  } catch (err: any) {
    req.log?.error({ err }, "Video generation failed");
    return res.status(500).json({ error: err?.message ?? "Internal server error" });
  }
});

export default router;
