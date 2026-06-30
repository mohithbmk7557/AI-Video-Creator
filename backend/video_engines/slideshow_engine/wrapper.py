"""
wrapper.py — integrates the uploaded FFmpeg slideshow engine with /video/build.

Mirrors the pipeline from the uploaded main.py POST /videos endpoint exactly:
  1. Load PIL images (from URLs instead of file uploads)
  2. Build spec dict and parse via VideoSpec.from_dict()  ← same as uploaded main.py
  3. build_video(pil_images, video_spec, silent_path)      ← same call
  4. add_narration(silent, narrations, durations, out)     ← same call
  5. Return (output_filepath, "slideshow-fallback")
"""

import io
import logging
import os
import sys
import tempfile
import uuid
from pathlib import Path

import httpx
from PIL import Image, UnidentifiedImageError

log = logging.getLogger(__name__)

_ENGINE_DIR = os.path.abspath(os.path.dirname(__file__))


_HEADERS = {
    "User-Agent": "AiVid/1.0 (educational video generator; https://replit.com)",
    "Accept": "image/jpeg,image/png,image/webp,image/*",
}


def _fetch_image(url: str) -> Image.Image | None:
    """Download an image from a URL and return as a PIL Image, or None on failure."""
    try:
        r = httpx.get(url, timeout=15, follow_redirects=True, headers=_HEADERS)
        r.raise_for_status()
        img = Image.open(io.BytesIO(r.content))
        img.load()
        return img.convert("RGB")
    except (httpx.HTTPError, UnidentifiedImageError, OSError) as exc:
        log.warning("Image fetch failed %s — %s", url, exc)
        return None


def _blank_image(width: int = 1280, height: int = 720) -> Image.Image:
    """Dark placeholder used when no URL resolves to a valid image."""
    return Image.new("RGB", (width, height), (18, 18, 28))


def generate_slideshow_video(slides: list, output_dir: str) -> tuple:
    """
    slides: list of dicts — {narration, image_urls, duration, heading}
    output_dir: directory to write the final .mp4 file
    Returns: (output_filepath, "slideshow-fallback")
    """
    os.makedirs(output_dir, exist_ok=True)

    # Patch sys.path so the uploaded files can resolve each other's bare imports
    # (audio.py does `from tts import synth_to_wav`, etc.)
    sys.path.insert(0, _ENGINE_DIR)
    try:
        from video_builder import VideoSpec, build_video  # uploaded file — not modified
        from audio import add_narration                    # uploaded file — not modified

        W, H, FPS = 1280, 720, 30

        # ── 1. Download images — one per slide (first working URL wins) ──────
        pil_images: list[Image.Image] = []
        for s in slides:
            img = None
            for url in (s.get("image_urls") or []):
                img = _fetch_image(url)
                if img:
                    break
            pil_images.append(img or _blank_image(W, H))

        # ── 2. Build spec dict and parse via VideoSpec.from_dict() ───────────
        # This is exactly how the uploaded main.py constructs the spec.
        raw_slides = []
        for i, s in enumerate(slides):
            heading = (s.get("heading") or "").strip()
            slide_entry: dict = {
                "image_index": i,
                "duration": float(s.get("duration", 10.0)),
            }
            if heading:
                # Use the `texts` list format so we can control position/style,
                # matching the TextOverlay.from_dict() path in the uploaded video_builder.py
                slide_entry["texts"] = [
                    {
                        "text": heading,
                        "position": "top",
                        "font_size": 44,
                        "color": "#FFFFFF",
                        "background": "#00000099",
                        "margin": 32,
                    }
                ]
            raw_slides.append(slide_entry)

        spec_dict = {
            "width": W,
            "height": H,
            "fps": FPS,
            "default_duration": 10.0,
            "slides": raw_slides,
        }

        # VideoSpec.from_dict() validates the spec exactly as in the uploaded main.py
        video_spec = VideoSpec.from_dict(spec_dict, num_images=len(pil_images))

        # ── 3. Pull narrations aligned to spec.slides (same as uploaded main.py) ─
        narrations = [s.get("narration") or None for s in slides]
        durations = [s.duration for s in video_spec.slides]
        has_audio = any(n and n.strip() for n in narrations)

        # ── 4. Render silent video — identical call to the uploaded main.py ───
        tmp = Path(tempfile.gettempdir())
        silent_path = tmp / f"silent_{uuid.uuid4().hex}.mp4"
        out_path = Path(output_dir) / f"{uuid.uuid4().hex}.mp4"

        build_video(pil_images, video_spec, str(silent_path))

        # ── 5. Mux narration audio — identical call to the uploaded main.py ──
        if has_audio:
            add_narration(str(silent_path), narrations, durations, str(out_path))
            try:
                silent_path.unlink(missing_ok=True)
            except Exception:
                pass
        else:
            silent_path.rename(out_path)

        log.info("Slideshow engine wrote %s", out_path)
        return str(out_path), "slideshow-fallback"

    finally:
        try:
            sys.path.remove(_ENGINE_DIR)
        except ValueError:
            pass
