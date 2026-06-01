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
    // 1. Summary + main image
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

    // 2. Article gallery (srcset-based)
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

    // 3. Wikimedia Commons search for the topic
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

// ─── OpenVerse (CC-licensed images from Flickr, Europeana, Wikimedia, etc.) ──
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

// ─── Unsplash Source (topic-specific free photos, no key needed) ──────────────
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

// ─── Route ────────────────────────────────────────────────────────────────────
router.post("/generate", async (req, res) => {
  try {
    const { topic } = req.body as { topic: string };
    if (!topic || typeof topic !== "string")
      return res.status(400).json({ error: "topic is required" });

    // Fire AI + image sources simultaneously
    const [wikiPhotos, overversePhotos, aiResult] = await Promise.all([
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
      "keyPhrase": "THE most striking 3-4 word phrase from this scene (shown LARGE on screen)",
      "fact": "One specific, fascinating fact with real numbers/dates (20-30 words)",
      "narration": "What the narrator says, natural spoken English, documentary tone (25-35 words)",
      "imageQueries": [
        "establishing shot query — wide scenic view (5-7 words)",
        "detail/close-up query — specific element of this scene (5-7 words)",
        "dramatic/climactic query — most visually striking aspect (5-7 words)"
      ],
      "stat": "The single most impressive number/fact in short form e.g. '2,300 miles' or '776 BC' or '1.4 billion'",
      "statLabel": "what the stat means in 3-5 words e.g. 'of wall constructed' or 'first Olympic Games'"
    }
  ],
  "script": "Complete 59-second narration, all scenes connected",
  "suggestions": ["related topic 1", "related topic 2", "related topic 3", "related topic 4"]
}

RULES:
- keyPhrase must be 3-4 WORDS ONLY — these appear HUGE on screen
- stat must be SHORT (under 15 chars) — appears as big graphic callout
- imageQueries[0] = wide establishing shot, [1] = close detail, [2] = dramatic/different angle
- Make facts specific: use real numbers, dates, names
- Narration = conversational, not academic`,
          },
        ],
      }),
    ]);

    // Parse AI response
    const raw = aiResult.choices[0]?.message?.content ?? "{}";
    let parsed: {
      title: string;
      slides: Array<{
        id: string; duration: number; heading: string; keyPhrase: string;
        fact: string; narration: string; imageQueries: string[];
        stat: string; statLabel: string;
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

    // Merge all real photos into one pool (Wikipedia + OpenVerse)
    const photoPool: Photo[] = [...wikiPhotos];
    for (const p of overversePhotos) {
      if (!photoPool.find(x => x.url === p.url)) photoPool.push(p);
    }

    // Assign 3 images per slide
    const slides = parsed.slides.slice(0, 6).map((s, slideIdx) => {
      const queries = Array.isArray(s.imageQueries) ? s.imageQueries : [topic, topic, topic];

      // Pick 3 different photos for this slide
      const imgUrls: string[] = [];
      for (let shot = 0; shot < 3; shot++) {
        const poolIdx = slideIdx * 3 + shot;
        const photo = photoPool[poolIdx % Math.max(photoPool.length, 1)];
        if (photo && photo.url !== imgUrls[0] && photo.url !== imgUrls[1]) {
          imgUrls.push(photo.url);
        } else {
          // Fallback: Unsplash with the specific imageQuery for this shot
          imgUrls.push(unsplashUrl(queries[shot] ?? topic, slideIdx * 10 + shot));
        }
      }

      const firstCaption = photoPool[slideIdx * 3 % Math.max(photoPool.length, 1)]?.caption ?? "";

      return {
        id: s.id ?? `slide-${slideIdx + 1}`,
        duration: s.duration ?? 10,
        heading: s.heading ?? "",
        keyPhrase: s.keyPhrase ?? s.heading?.split(" ").slice(0, 4).join(" ") ?? "",
        fact: s.fact ?? "",
        narration: s.narration ?? "",
        imageQueries: queries,
        imageUrls: imgUrls,
        imageCaption: firstCaption,
        stat: s.stat ?? "",
        statLabel: s.statLabel ?? "",
        accent: ACCENT_PALETTE[slideIdx % ACCENT_PALETTE.length],
      };
    });

    return res.json({
      title: parsed.title ?? topic,
      slides,
      script: parsed.script ?? "",
      suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions.slice(0, 4) : [],
    });
  } catch (err: any) {
    req.log?.error({ err }, "Video generation failed");
    return res.status(500).json({ error: err?.message ?? "Internal server error" });
  }
});

export default router;
