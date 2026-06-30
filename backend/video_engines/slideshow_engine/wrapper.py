"""
wrapper.py — hybrid video generator (no API key required).

For each slide:
  1. Try Wikimedia Commons / Internet Archive for actual free video footage
  2. Fall back to Ken Burns pan+zoom on a topic-relevant photo

All slide clips are generated concurrently, then concatenated and narration
audio is mixed in.
"""

import io
import logging
import os
import shutil
import subprocess
import sys
import tempfile
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import httpx
from PIL import Image, UnidentifiedImageError

log = logging.getLogger(__name__)

_ENGINE_DIR = os.path.abspath(os.path.dirname(__file__))

W, H, FPS = 1280, 720, 30

_IMG_HEADERS = {
    "User-Agent": "AiVid/1.0 (educational video generator; https://replit.com)",
    "Accept": "image/jpeg,image/png,image/webp,image/*",
}

# ── Try to import the free video search module (best-effort) ─────────────────
try:
    from video_engines.free_video_search import find_free_video_url as _find_video
except ImportError:
    _find_video = None
    log.warning("free_video_search not importable — video clips disabled, Ken Burns only")


# ── Image fetching ────────────────────────────────────────────────────────────

def _fetch_image(url: str) -> "Image.Image | None":
    try:
        r = httpx.get(url, timeout=15, follow_redirects=True, headers=_IMG_HEADERS)
        r.raise_for_status()
        img = Image.open(io.BytesIO(r.content))
        img.load()
        return img.convert("RGB")
    except (httpx.HTTPError, UnidentifiedImageError, OSError) as exc:
        log.debug("Image fetch failed %s — %s", url, exc)
        return None


def _blank_image() -> "Image.Image":
    return Image.new("RGB", (W, H), (18, 18, 28))


def _fetch_best_image(urls: list) -> "Image.Image":
    for url in (urls or []):
        img = _fetch_image(url)
        if img:
            return img
    return _blank_image()


# ── FFmpeg helpers ────────────────────────────────────────────────────────────

def _drawtext_filter(heading: str) -> str:
    """Return an FFmpeg drawtext filter string (empty string if no heading)."""
    if not heading:
        return ""
    safe = (
        heading
        .replace("\\", "\\\\")
        .replace("'", "\\'")
        .replace(":", "\\:")
        .replace("%", "\\%")
    )
    font_path = next(
        (p for p in [
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
            "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
        ] if Path(p).exists()),
        None,
    )
    dt = (
        f"drawtext=text='{safe}'"
        f":fontsize=52:fontcolor=white"
        f":x=(w-text_w)/2:y=40"
        f":box=1:boxcolor=black@0.6:boxborderw=14"
    )
    if font_path:
        dt += f":fontfile='{font_path}'"
    return dt


def _concat_clips(clip_paths: list, dest: Path) -> None:
    """Concatenate MP4 clips via FFmpeg concat demuxer (stream copy, no re-encode)."""
    list_file = dest.parent / f"list_{uuid.uuid4().hex}.txt"
    list_file.write_text("\n".join(f"file '{p}'" for p in clip_paths))
    try:
        proc = subprocess.run(
            [
                "ffmpeg", "-y",
                "-f", "concat", "-safe", "0", "-i", str(list_file),
                "-c", "copy", "-movflags", "+faststart",
                str(dest),
            ],
            capture_output=True,
            timeout=180,
        )
        if proc.returncode != 0:
            raise RuntimeError(f"ffmpeg concat: {proc.stderr.decode()[-300:]}")
    finally:
        list_file.unlink(missing_ok=True)


# ── Free video clip acquisition ───────────────────────────────────────────────

def _download_video(url: str, dest: Path, max_mb: int = 40) -> bool:
    """Stream-download a video URL to dest. Returns True on success."""
    try:
        with httpx.stream("GET", url, timeout=30, follow_redirects=True) as r:
            r.raise_for_status()
            written = 0
            with open(dest, "wb") as fh:
                for chunk in r.iter_bytes(65536):
                    fh.write(chunk)
                    written += len(chunk)
                    if written > max_mb * 1024 * 1024:
                        log.debug("Video too large (>%dMB), aborting: %s", max_mb, url)
                        break
        return dest.exists() and dest.stat().st_size > 4096
    except Exception as exc:
        log.debug("Video download failed: %s", exc)
        dest.unlink(missing_ok=True)
        return False


def _trim_and_overlay(raw: Path, dest: Path, duration: float, heading: str) -> bool:
    """Trim raw clip to duration, scale to 1280×720, add heading text overlay."""
    dt = _drawtext_filter(heading)
    vf_parts = [
        f"scale={W}:{H}:force_original_aspect_ratio=decrease",
        f"pad={W}:{H}:(ow-iw)/2:(oh-ih)/2:color=black",
    ]
    if dt:
        vf_parts.append(dt)

    proc = subprocess.run(
        [
            "ffmpeg", "-y",
            "-i", str(raw),
            "-t", str(duration),
            "-vf", ",".join(vf_parts),
            "-c:v", "libx264", "-pix_fmt", "yuv420p",
            "-preset", "fast", "-crf", "22",
            "-an",
            str(dest),
        ],
        capture_output=True,
        timeout=120,
    )
    raw.unlink(missing_ok=True)
    if proc.returncode != 0:
        log.debug("ffmpeg trim failed: %s", proc.stderr.decode()[-200:])
        return False
    return dest.exists() and dest.stat().st_size > 4096


def _try_free_video_clip(heading: str, duration: float, dest: Path) -> bool:
    """
    Search Wikimedia / Archive.org for a free video clip and process it.
    Returns True if dest was written successfully.
    """
    if _find_video is None or not heading:
        return False

    url = _find_video(heading)
    if not url:
        return False

    raw = dest.parent / f"raw_{dest.stem}.tmp"
    if not _download_video(url, raw):
        return False

    return _trim_and_overlay(raw, dest, duration, heading)


# ── Ken Burns clip generation ─────────────────────────────────────────────────

def _render_ken_burns_clip(
    img: "Image.Image",
    heading: str,
    duration: float,
    move_id: int,
    dest: Path,
) -> None:
    """Render a single Ken Burns animated clip (photo + pan/zoom) to dest."""
    sys.path.insert(0, _ENGINE_DIR)
    try:
        from video_builder import VideoSpec, SlideSpec, TextOverlay, render_slide
        from video_builder import _ken_burns_frames

        texts = []
        if heading:
            texts = [TextOverlay(
                text=heading,
                position="top",
                font_size=44,
                color="#FFFFFF",
                background="#00000099",
                margin=32,
            )]
        slide_spec = SlideSpec(image_index=0, duration=duration, texts=texts)
        video_spec = VideoSpec(width=W, height=H, fps=FPS, slides=[slide_spec])

        base = render_slide(img, video_spec, slide_spec)
        n_frames = max(1, round(duration * FPS))

        proc = subprocess.Popen(
            [
                "ffmpeg", "-y",
                "-f", "rawvideo", "-pix_fmt", "rgb24",
                "-s", f"{W}x{H}", "-r", str(FPS),
                "-i", "pipe:0",
                "-c:v", "libx264", "-pix_fmt", "yuv420p",
                "-preset", "fast", "-crf", "22",
                "-movflags", "+faststart",
                str(dest),
            ],
            stdin=subprocess.PIPE,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
        )
        try:
            for frame in _ken_burns_frames(base, n_frames, move_id, W, H):
                proc.stdin.write(frame.tobytes())
        except BrokenPipeError:
            pass
        finally:
            try:
                proc.stdin.close()
            except (BrokenPipeError, OSError):
                pass
        err = proc.stderr.read()
        proc.stderr.close()
        if proc.wait(timeout=120) != 0:
            raise RuntimeError(f"Ken Burns encode failed: {err.decode()[-300:]}")
    finally:
        try:
            sys.path.remove(_ENGINE_DIR)
        except ValueError:
            pass


# ── Per-slide processor (runs in thread pool) ─────────────────────────────────

def _process_slide(idx: int, slide: dict, tmp_dir: Path) -> Path:
    """
    Build one MP4 clip for a slide.
    Priority: free video footage → Ken Burns on topic photo.
    Returns the path to the clip.
    """
    heading = (slide.get("heading") or "").strip()
    duration = float(slide.get("duration", 10.0))
    dest = tmp_dir / f"clip_{idx:02d}.mp4"

    # 1 — Try real video footage from Wikimedia / Archive.org
    try:
        if _try_free_video_clip(heading, duration, dest):
            log.info("Slide %d: real video clip '%s'", idx, heading[:50])
            return dest
    except Exception as exc:
        log.debug("Free video failed slide %d: %s", idx, exc)
        dest.unlink(missing_ok=True)

    # 2 — Ken Burns fallback
    img = _fetch_best_image(slide.get("image_urls", []))
    _render_ken_burns_clip(img, heading, duration, idx, dest)
    log.info("Slide %d: Ken Burns clip '%s'", idx, heading[:50])
    return dest


# ── Public entry point ────────────────────────────────────────────────────────

def generate_slideshow_video(slides: list, output_dir: str) -> tuple:
    """
    slides: list of {narration, image_urls, duration, heading}
    output_dir: directory to write the final .mp4 file
    Returns (output_filepath, "hybrid")
    """
    os.makedirs(output_dir, exist_ok=True)
    tmp_dir = Path(tempfile.mkdtemp(prefix="aivid_"))

    try:
        n = len(slides)

        # ── 1. Build all slide clips concurrently ─────────────────────────────
        clip_paths: list[Path] = [Path()] * n
        with ThreadPoolExecutor(max_workers=min(n, 4)) as pool:
            futures = {
                pool.submit(_process_slide, idx, slide, tmp_dir): idx
                for idx, slide in enumerate(slides)
            }
            for fut in as_completed(futures):
                idx = futures[fut]
                try:
                    clip_paths[idx] = fut.result()
                except Exception as exc:
                    # Last-resort blank clip so concat doesn't fail
                    log.error("Slide %d failed: %s — inserting blank", idx, exc)
                    blank = tmp_dir / f"blank_{idx:02d}.mp4"
                    _render_ken_burns_clip(_blank_image(), "", 5.0, idx, blank)
                    clip_paths[idx] = blank

        # ── 2. Concatenate ───────────────────────────────────────────────────
        silent_path = tmp_dir / "silent.mp4"
        _concat_clips([str(p) for p in clip_paths], silent_path)

        # ── 3. Narration audio ───────────────────────────────────────────────
        narrations = [s.get("narration") or None for s in slides]
        durations = [float(s.get("duration", 10.0)) for s in slides]
        has_audio = any(n and n.strip() for n in narrations)

        out_path = Path(output_dir) / f"{uuid.uuid4().hex}.mp4"

        sys.path.insert(0, _ENGINE_DIR)
        try:
            from audio import add_narration
            if has_audio:
                add_narration(str(silent_path), narrations, durations, str(out_path))
            else:
                shutil.copy2(str(silent_path), str(out_path))
        except Exception as exc:
            log.warning("Audio mux failed: %s — using silent video", exc)
            shutil.copy2(str(silent_path), str(out_path))
        finally:
            try:
                sys.path.remove(_ENGINE_DIR)
            except ValueError:
                pass

        log.info("Hybrid engine wrote %s (%d slides)", out_path, n)
        return str(out_path), "hybrid"

    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)
