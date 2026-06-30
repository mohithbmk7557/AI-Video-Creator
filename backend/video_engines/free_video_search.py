"""
free_video_search.py
Find freely available video clips — zero API key required.

Sources (tried in order):
  1. Wikimedia Commons  — curated encyclopedia videos (Tower Bridge, waterfalls, etc.)
  2. Internet Archive   — historical footage, newsreels, public-domain films

Timeouts are kept tight so the caller gets a fast failure and can fall back
to the Ken Burns photo engine instead of hanging.
"""

import logging
from typing import Optional

import httpx

log = logging.getLogger(__name__)

WIKIMEDIA_API = "https://commons.wikimedia.org/w/api.php"
ARCHIVE_SEARCH = "https://archive.org/advancedsearch.php"

_HEADERS = {"User-Agent": "AiVid/1.0 (educational video generator)"}

_MAX_FILE_MB = 40      # skip files larger than this
_TIMEOUT     = 4       # per-request timeout (s) — tight to fail fast


# ── Wikimedia Commons ────────────────────────────────────────────────────────

def _wikimedia_video(query: str) -> Optional[str]:
    """Search Wikimedia Commons for a short video clip matching query."""
    try:
        r = httpx.get(
            WIKIMEDIA_API,
            params={
                "action": "query",
                "list":   "search",
                "srsearch":   query,
                "srnamespace": "6",
                "srlimit":     "8",       # fewer results → faster
                "srwhat":      "text",
                "format":      "json",
                "origin":      "*",
            },
            headers=_HEADERS,
            timeout=_TIMEOUT,
        )
        r.raise_for_status()
        results = r.json().get("query", {}).get("search", [])
    except Exception as exc:
        log.debug("Wikimedia search error: %s", exc)
        return None

    video_titles = [
        res["title"]
        for res in results
        if any(res["title"].lower().endswith(ext)
               for ext in (".webm", ".ogv", ".mp4", ".ogg"))
    ]
    if not video_titles:
        return None

    # Resolve direct URLs for first 3 candidates only
    titles_param = "|".join(video_titles[:3])
    try:
        r2 = httpx.get(
            WIKIMEDIA_API,
            params={
                "action": "query",
                "titles": titles_param,
                "prop":   "imageinfo",
                "iiprop": "url|size",
                "format": "json",
                "origin": "*",
            },
            headers=_HEADERS,
            timeout=_TIMEOUT,
        )
        r2.raise_for_status()
        pages = r2.json().get("query", {}).get("pages", {})
    except Exception as exc:
        log.debug("Wikimedia imageinfo error: %s", exc)
        return None

    candidates = []
    for page in pages.values():
        for info in page.get("imageinfo", []):
            size = info.get("size", 0)
            url  = info.get("url", "")
            if url and size < _MAX_FILE_MB * 1024 * 1024:
                candidates.append((size, url))

    if not candidates:
        return None

    candidates.sort()
    return candidates[0][1]


# ── Internet Archive ─────────────────────────────────────────────────────────

def _archive_video(query: str) -> Optional[str]:
    """Search Internet Archive for a short, small video clip."""
    try:
        r = httpx.get(
            ARCHIVE_SEARCH,
            params={
                "q":    f"({query}) AND mediatype:movies",
                "fl[]": ["identifier"],
                "rows": "3",        # only 3 results — fewer metadata round-trips
                "page": "1",
                "output": "json",
            },
            headers=_HEADERS,
            timeout=_TIMEOUT,
        )
        r.raise_for_status()
        docs = r.json().get("response", {}).get("docs", [])
    except Exception as exc:
        log.debug("Archive.org search error: %s", exc)
        return None

    # Only check the top 2 identifiers to limit total latency
    for doc in docs[:2]:
        identifier = doc.get("identifier", "")
        if not identifier:
            continue
        try:
            meta = httpx.get(
                f"https://archive.org/metadata/{identifier}",
                headers=_HEADERS,
                timeout=_TIMEOUT,
            ).json()
        except Exception:
            continue

        files = meta.get("files", [])
        candidates = []
        for f in files:
            name = f.get("name", "")
            ext  = name.lower().rsplit(".", 1)[-1] if "." in name else ""
            size = float(f.get("size", 999_999_999))
            if ext in ("mp4", "webm", "ogv") and size < _MAX_FILE_MB * 1024 * 1024:
                priority = 0 if ext == "mp4" else 1
                candidates.append((priority, size, name))

        if candidates:
            candidates.sort()
            best_name = candidates[0][2]
            return f"https://archive.org/download/{identifier}/{best_name}"

    return None


# ── Public API ───────────────────────────────────────────────────────────────

def find_free_video_url(query: str) -> Optional[str]:
    """
    Return a direct URL to a free, downloadable video clip for the query.
    Tries Wikimedia Commons first (fast CDN), then Archive.org.
    Returns None quickly if nothing is found so callers can fall back to Ken Burns.
    """
    words = [w for w in query.split() if len(w) > 3]
    queries = list(dict.fromkeys([
        query,
        " ".join(words[:3]) if len(words) >= 2 else query,
        words[0] if words else query,
    ]))

    for q in queries[:2]:          # limit to 2 Wikimedia attempts
        url = _wikimedia_video(q)
        if url:
            log.info("Free video found on Wikimedia for '%s'", q)
            return url

    for q in queries[:1]:          # only 1 Archive.org attempt
        url = _archive_video(q)
        if url:
            log.info("Free video found on Archive.org for '%s'", q)
            return url

    log.debug("No free video found for '%s'", query)
    return None
