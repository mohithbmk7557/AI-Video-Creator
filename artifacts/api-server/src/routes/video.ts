import { Router } from "express";
import fs from "fs";
import path from "path";
import OpenAI from "openai";

const router = Router();

const openai = new OpenAI({
  baseURL: process.env["AI_INTEGRATIONS_OPENAI_BASE_URL"],
  apiKey: process.env["AI_INTEGRATIONS_OPENAI_API_KEY"],
});

const FASTAPI_URL = "http://localhost:8000";
const VIDEOS_DIR = "/tmp/aivid_videos";

const ACCENT_PALETTE = [
  "#0d2137", "#1a0d3b", "#0a2820", "#2b0f27",
  "#0d1f0d", "#1a0c07", "#0d1a2e", "#220d0d",
];

// ─── Image source types ───────────────────────────────────────────────────────
interface Photo {
  url: string;
  caption: string;
}

// ─── Wikipedia / Wikimedia sources ───────────────────────────────────────────
async function fetchWikiPhotos(topic: string): Promise<Photo[]> {
  const UA = "AiVid/1.0 (educational; https://replit.com)";
  const photos: Photo[] = [];

  try {
    const summRes = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(topic)}`,
      { headers: { "User-Agent": UA } }
    );
    let pageTitle = topic;
    if (summRes.ok) {
      const d = await summRes.json() as {
        title?: string;
        originalimage?: { source: string };
        thumbnail?: { source: string };
      };
      pageTitle = d.title ?? topic;
      const src = d.originalimage?.source ?? d.thumbnail?.source ?? "";
      if (src && isPhoto(src)) photos.push({ url: ensureHttps(src), caption: pageTitle });
    }

    const mediaRes = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/media-list/${encodeURIComponent(pageTitle)}`,
      { headers: { "User-Agent": UA } }
    );
    if (mediaRes.ok) {
      const d = await mediaRes.json() as {
        items?: Array<{
          type: string;
          showInGallery?: boolean;
          title?: string;
          srcset?: Array<{ src: string; scale: string }>;
          captions?: Record<string, string>;
          caption?: { html?: string };
        }>;
      };
      for (const item of d.items ?? []) {
        if (item.type !== "image") continue;
        const src = item.srcset?.find(s => s.scale === "2x")?.src
          ?? item.srcset?.[0]?.src ?? "";
        if (!src || !isPhoto(src)) continue;
        const url = ensureHttps(src);
        const caption = item.captions?.en
          ?? stripHtml(item.caption?.html ?? "")
          ?? item.title?.replace(/^File:/, "").replace(/_/g, " ").replace(/\.\w+$/, "")
          ?? "";
        if (!photos.find(p => p.url === url)) photos.push({ url, caption });
        if (photos.length >= 18) break;
      }
    }

    const commRes = await fetch(
      `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(topic)}&gsrnamespace=6&prop=imageinfo&iiprop=url|mime&format=json&gsrlimit=12&origin=*`,
      { headers: { "User-Agent": UA } }
    );
    if (commRes.ok) {
      const d = await commRes.json() as {
        query?: { pages?: Record<string, {
          title?: string;
          imageinfo?: Array<{ url: string; mime: string }>;
        }> };
      };
      for (const page of Object.values(d.query?.pages ?? {})) {
        const ii = page.imageinfo?.[0];
        if (!ii?.url || !isPhoto(ii.url)) continue;
        if (!ii.mime?.startsWith("image/jpeg") && !ii.mime?.startsWith("image/png")) continue;
        const caption = page.title?.replace(/^File:/, "").replace(/_/g, " ").replace(/\.\w+$/, "") ?? "";
        if (!photos.find(p => p.url === ii.url)) photos.push({ url: ii.url, caption });
        if (photos.length >= 18) break;
      }
    }
  } catch { /* best-effort */ }

  return photos;
}

// ─── OpenVerse (CC-licensed images) ──────────────────────────────────────────
async function fetchOpenVersePhotos(query: string): Promise<Photo[]> {
  try {
    const res = await fetch(
      `https://api.openverse.org/v1/images/?q=${encodeURIComponent(query)}&page_size=6&license_type=all&aspect_ratio=wide`,
      { headers: { "User-Agent": "AiVid/1.0 (educational; https://replit.com)" } }
    );
    if (!res.ok) return [];
    const d = await res.json() as {
      results?: Array<{ url: string; thumbnail: string; title: string; source: string }>;
    };
    return (d.results ?? [])
      .filter(r => r.url && isPhoto(r.url))
      .map(r => ({ url: r.url, caption: `${r.title} – ${r.source}` }));
  } catch {
    return [];
  }
}

// ─── Unsplash Source fallback ─────────────────────────────────────────────────
function unsplashUrl(query: string, seed: number): string {
  return `https://source.unsplash.com/900x600/?${encodeURIComponent(query)}&sig=${seed}`;
}

// ─── Utilities ────────────────────────────────────────────────────────────────
function isPhoto(url: string): boolean {
  const u = url.toLowerCase();
  if (u.match(/\.(svg|gif|tiff|bmp|ico)($|\?)/)) return false;
  if (/logo|flag_of|coat_of_arms|_icon|icon_|commons-logo|map/.test(u)) return false;
  return /\.(jpg|jpeg|png|webp)($|\?)/.test(u);
}
function ensureHttps(url: string) { return url.startsWith("//") ? "https:" + url : url; }
function stripHtml(html: string) { return html.replace(/<[^>]+>/g, "").trim(); }

// ─── Call FastAPI /video/build ────────────────────────────────────────────────
async function callFastApiBuild(
  topic: string,
  slides: Array<{ narration: string; image_urls: string[]; duration: number; heading: string }>
): Promise<{ filename: string; engine: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 180_000); // 3 min timeout
  try {
    const res = await fetch(`${FASTAPI_URL}/video/build`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic, slides }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`FastAPI /video/build returned ${res.status}: ${body.slice(0, 200)}`);
    }
    return await res.json() as { filename: string; engine: string };
  } finally {
    clearTimeout(timeout);
  }
}

// ─── GET /api/video/files/:filename — serve generated .mp4 files ──────────────
router.get("/files/:filename", (req, res) => {
  const { filename } = req.params;
  if (!/^[a-f0-9]+\.mp4$/.test(filename)) {
    res.status(400).json({ error: "invalid filename" });
    return;
  }
  const filePath = path.join(VIDEOS_DIR, filename);
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: "video not found" });
    return;
  }
  res.setHeader("Content-Type", "video/mp4");
  res.setHeader("Accept-Ranges", "bytes");
  res.sendFile(filePath);
});

// ─── POST /api/video/generate ─────────────────────────────────────────────────
router.post("/generate", async (req, res) => {
  try {
    const { topic } = req.body as { topic: string };
    if (!topic || typeof topic !== "string")
      return res.status(400).json({ error: "topic is required" });

    // Fire AI + image fetching simultaneously
    const [wikiPhotos, openversePhotos, aiResult] = await Promise.all([
      fetchWikiPhotos(topic),
      fetchOpenVersePhotos(topic),
      openai.chat.completions.create({
        model: "gpt-5.4",
        max_completion_tokens: 4000,
        messages: [
          {
            role: "system",
            content: `You are an expert YouTube documentary scriptwriter. You create punchy, educational, visually-driven video scripts where every scene has a dramatic visual hook and a memorable statistic.`,
          },
          {
            role: "user",
            content: `Create a 59-second YouTube-style documentary about: "${topic}"

Produce exactly 5-6 scenes. Each scene = one "shot sequence" lasting ~10 seconds.

Return ONLY valid JSON (no markdown):
{
  "title": "YouTube-style title with a hook (8-12 words)",
  "slides": [
    {
      "id": "slide-1",
      "duration": 10,
      "heading": "Scene title — short, punchy (4-6 words)",
      "narration": "What the narrator says, natural spoken English, documentary tone (25-35 words)",
      "imageQueries": [
        "establishing shot query — wide scenic view (5-7 words)",
        "detail/close-up query — specific element of this scene (5-7 words)",
        "dramatic/climactic query — most visually striking aspect (5-7 words)"
      ]
    }
  ],
  "script": "Complete 59-second narration, all scenes connected",
  "suggestions": ["related topic 1", "related topic 2", "related topic 3", "related topic 4"]
}

RULES:
- imageQueries[0] = wide establishing shot, [1] = close detail, [2] = dramatic angle
- Make narration conversational, not academic — 25-35 words per scene
- Total video = 59 seconds`,
          },
        ],
      }),
    ]);

    // Parse AI response
    const raw = aiResult.choices[0]?.message?.content ?? "{}";
    let parsed: {
      title: string;
      slides: Array<{
        id: string; duration: number; heading: string;
        narration: string; imageQueries: string[];
      }>;
      script: string;
      suggestions: string[];
    };
    try {
      parsed = JSON.parse(raw);
    } catch {
      const m = raw.match(/\{[\s\S]*\}/);
      if (!m) throw new Error("Failed to parse AI response");
      parsed = JSON.parse(m[0]);
    }
    if (!Array.isArray(parsed.slides)) throw new Error("Invalid AI response");

    // Build image pool
    const photoPool: Photo[] = [...wikiPhotos];
    for (const p of openversePhotos) {
      if (!photoPool.find(x => x.url === p.url)) photoPool.push(p);
    }

    // Build slides with 3 images each for FastAPI
    const slides = parsed.slides.slice(0, 6).map((s, slideIdx) => {
      const queries = Array.isArray(s.imageQueries) ? s.imageQueries : [topic, topic, topic];
      const imageUrls: string[] = [];
      for (let shot = 0; shot < 3; shot++) {
        const poolIdx = slideIdx * 3 + shot;
        const photo = photoPool[poolIdx % Math.max(photoPool.length, 1)];
        if (photo && !imageUrls.includes(photo.url)) {
          imageUrls.push(photo.url);
        } else {
          imageUrls.push(unsplashUrl(queries[shot] ?? topic, slideIdx * 10 + shot));
        }
      }
      return {
        heading: s.heading ?? "",
        narration: s.narration ?? "",
        duration: s.duration ?? 10,
        image_urls: imageUrls,
      };
    });

    // Call FastAPI to build the actual .mp4
    req.log?.info({ topic }, "Calling FastAPI /video/build");
    const { filename, engine } = await callFastApiBuild(topic, slides);
    req.log?.info({ topic, engine, filename }, "Video built successfully");

    return res.json({
      title: parsed.title ?? topic,
      videoUrl: `/api/video/files/${filename}`,
      engine,
      script: parsed.script ?? "",
      suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions.slice(0, 4) : [],
    });
  } catch (err: any) {
    req.log?.error({ err }, "Video generation failed");
    return res.status(500).json({ error: err?.message ?? "Internal server error" });
  }
});

export default router;
