"""
pexels_engine/wrapper.py
Uses the free Pexels Videos API to fetch actual video clips for each slide,
trims them to the slide duration, overlays the heading text, then concatenates
everything into one MP4 with narration audio.

Activated when PEXELS_API_KEY env var is set.
"""

import hashlib
import os
import subprocess
import tempfile
from pathlib import Path
from typing import Optional

import httpx

from ..slideshow_engine.tts import synthesize_narration

PEXELS_VIDEOS_URL = "https://api.pexels.com/videos/search"

# ── helpers ─────────────────────────────────────────────────────────────────

def _search_video(query: str, api_key: str, duration_max: int = 30) -> Optional[str]:
    """
    Returns the URL of the best-fit HD video clip for the query, or None.
    Tries landscape orientation first, falls back to any result.
    """
    try:
        r = httpx.get(
            PEXELS_VIDEOS_URL,
            params={
                "query": query,
                "per_page": 5,
                "orientation": "landscape",
                "size": "medium",   # avoids huge 4K files
            },
            headers={"Authorization": api_key},
            timeout=10,
        )
        r.raise_for_status()
        videos = r.json().get("videos", [])
    except Exception as exc:
        print(f"[pexels] search error for '{query}': {exc}")
        return None

    if not videos:
        return None

    # Pick the first video that is not too long
    for vid in videos:
        dur = vid.get("duration", 999)
        if dur <= max(duration_max, 5):
            return _best_file_url(vid.get("video_files", []))

    return _best_file_url(videos[0].get("video_files", []))


def _best_file_url(video_files: list) -> Optional[str]:
    """Pick the 1280×720 (or nearest HD) file URL."""
    if not video_files:
        return None
    # prefer 1280×720 or closest width >= 720
    hd = [f for f in video_files if f.get("width", 0) >= 720]
    pool = hd or video_files
    return min(pool, key=lambda f: abs(f.get("width", 0) - 1280))["link"]


def _download(url: str, dest: Path) -> bool:
    """Stream-download a URL to dest. Returns True on success."""
    try:
        with httpx.stream("GET", url, timeout=30, follow_redirects=True) as r:
            r.raise_for_status()
            with open(dest, "wb") as fh:
                for chunk in r.iter_bytes(chunk_size=65536):
                    fh.write(chunk)
        return dest.stat().st_size > 1024
    except Exception as exc:
        print(f"[pexels] download error: {exc}")
        return False


def _trim_and_overlay(
    src: Path,
    dest: Path,
    duration: float,
    heading: str,
    out_w: int = 1280,
    out_h: int = 720,
) -> bool:
    """
    Trim src to `duration` seconds, scale to out_w×out_h, add bold heading text.
    Returns True on success.
    """
    # Escape ffmpeg drawtext special chars
    safe_text = (
        heading.replace("\\", "\\\\")
               .replace("'", "\\'")
               .replace(":", "\\:")
               .replace("%", "\\%")
    )

    # Font path — try common system fonts
    font_path = None
    for p in [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    ]:
        if Path(p).exists():
            font_path = p
            break

    drawtext = (
        f"drawtext=text='{safe_text}'"
        f":fontsize=52:fontcolor=white"
        f":x=(w-text_w)/2:y=50"
        f":box=1:boxcolor=black@0.55:boxborderw=14"
    )
    if font_path:
        drawtext += f":fontfile='{font_path}'"

    vf = (
        f"scale={out_w}:{out_h}:force_original_aspect_ratio=decrease,"
        f"pad={out_w}:{out_h}:(ow-iw)/2:(oh-ih)/2:color=black,"
        f"{drawtext}"
    )

    proc = subprocess.run(
        [
            "ffmpeg", "-y",
            "-i", str(src),
            "-t", str(duration),
            "-vf", vf,
            "-c:v", "libx264", "-pix_fmt", "yuv420p",
            "-preset", "fast", "-crf", "22",
            "-an",                  # drop any source audio (we add narration later)
            str(dest),
        ],
        capture_output=True,
        timeout=120,
    )
    if proc.returncode != 0:
        print(f"[pexels] ffmpeg trim error: {proc.stderr.decode()[-300:]}")
        return False
    return dest.exists() and dest.stat().st_size > 1024


def _concat_clips(clip_paths: list, dest: Path) -> bool:
    """Concat all clip_paths into dest using ffmpeg concat demuxer."""
    list_file = dest.parent / "concat_list.txt"
    list_file.write_text("\n".join(f"file '{p}'" for p in clip_paths))
    proc = subprocess.run(
        [
            "ffmpeg", "-y",
            "-f", "concat", "-safe", "0", "-i", str(list_file),
            "-c", "copy",
            "-movflags", "+faststart",
            str(dest),
        ],
        capture_output=True, timeout=120,
    )
    list_file.unlink(missing_ok=True)
    if proc.returncode != 0:
        print(f"[pexels] concat error: {proc.stderr.decode()[-300:]}")
        return False
    return True


def _mux_audio(video: Path, audio: Path, dest: Path) -> bool:
    """Mix narration audio onto the silent video (audio loops/cuts to video length)."""
    proc = subprocess.run(
        [
            "ffmpeg", "-y",
            "-i", str(video),
            "-i", str(audio),
            "-shortest",
            "-c:v", "copy", "-c:a", "aac", "-b:a", "128k",
            "-movflags", "+faststart",
            str(dest),
        ],
        capture_output=True, timeout=120,
    )
    if proc.returncode != 0:
        print(f"[pexels] mux error: {proc.stderr.decode()[-300:]}")
        return False
    return True


# ── public entry point ───────────────────────────────────────────────────────

def generate_pexels_video(slides: list, output_dir: str, api_key: str) -> tuple[str, str]:
    """
    slides: list of dicts — {heading, narration, image_urls, duration}
    output_dir: directory where the final MP4 is saved
    api_key: Pexels API key

    Returns (filepath, "pexels")

    Falls back silently to None if every clip fetch fails (caller should then
    try the slideshow engine).
    """
    tmp = Path(tempfile.mkdtemp(prefix="pexels_"))
    clip_paths: list[Path] = []

    for idx, slide in enumerate(slides):
        heading = slide.get("heading", "")
        duration = float(slide.get("duration", 10))

        # Build search queries: prefer specific heading words, then general topic
        queries = []
        words = [w for w in heading.split() if len(w) > 3]
        if words:
            queries.append(" ".join(words[:4]))
        for iu in slide.get("image_urls", [])[:1]:
            pass   # could use alt text — skip for now

        # Always add the full heading as a fallback query
        if heading:
            queries.append(heading)

        clip_dest = tmp / f"clip_{idx:02d}.mp4"
        raw_clip = tmp / f"raw_{idx:02d}.mp4"
        found = False

        for q in queries:
            video_url = _search_video(q, api_key, duration_max=int(duration) + 5)
            if not video_url:
                continue
            if not _download(video_url, raw_clip):
                continue
            if _trim_and_overlay(raw_clip, clip_dest, duration, heading):
                found = True
                break

        if not found:
            # This slide failed — skip it (remaining slides still included)
            print(f"[pexels] slide {idx} ('{heading}') failed — skipping")
            continue

        clip_paths.append(clip_dest)

    if not clip_paths:
        raise RuntimeError("Pexels engine: could not fetch any video clips")

    # Concatenate clips
    silent_video = tmp / "silent.mp4"
    if not _concat_clips(clip_paths, silent_video):
        raise RuntimeError("Pexels engine: concat failed")

    # Build narration from all slide texts
    full_narration = " ".join(s.get("narration", "") for s in slides)
    audio_path = str(tmp / "narration.wav")
    try:
        synthesize_narration(full_narration, audio_path)
        has_audio = Path(audio_path).exists() and Path(audio_path).stat().st_size > 0
    except Exception as exc:
        print(f"[pexels] TTS failed: {exc}")
        has_audio = False

    # Compute output filename
    content = (full_narration + str(slides)).encode()
    stem = hashlib.md5(content).hexdigest()
    out_path = str(Path(output_dir) / f"{stem}.mp4")

    if has_audio:
        if not _mux_audio(silent_video, Path(audio_path), Path(out_path)):
            # Fallback: use silent video
            import shutil
            shutil.copy2(silent_video, out_path)
    else:
        import shutil
        shutil.copy2(silent_video, out_path)

    return out_path, "pexels"
