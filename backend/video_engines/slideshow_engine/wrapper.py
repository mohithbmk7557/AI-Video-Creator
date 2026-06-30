"""
wrapper.py — callable interface for the slideshow engine (zero-cost fallback).

generate_slideshow_video(slides, output_dir) -> (filepath, "slideshow-fallback")

Keeps video_builder.py / audio.py / tts.py completely untouched —
sys.path is patched just for the duration of the import so their bare
'from tts import …' / 'from video_builder import …' lines resolve correctly.
"""
import io
import logging
import os
import shutil
import sys
import tempfile
import uuid

import httpx
from PIL import Image

log = logging.getLogger(__name__)

_ENGINE_DIR = os.path.abspath(os.path.dirname(__file__))


def _download_image(url: str, timeout: int = 12) -> Image.Image | None:
    try:
        r = httpx.get(url, timeout=timeout, follow_redirects=True)
        r.raise_for_status()
        return Image.open(io.BytesIO(r.content)).convert("RGB")
    except Exception as e:
        log.warning("Image download failed %s: %s", url, e)
        return None


def _placeholder(width: int = 1280, height: int = 720) -> Image.Image:
    return Image.new("RGB", (width, height), color=(20, 20, 35))


def generate_slideshow_video(slides: list, output_dir: str) -> tuple:
    """
    slides: list of dicts with keys:
        narration   (str)        — spoken narration text
        image_urls  (list[str])  — ordered image URLs; first valid one is used
        duration    (float)      — slide length in seconds
        heading     (str)        — text overlay at the top of the slide

    output_dir: directory to write the final .mp4

    Returns: (output_filepath, "slideshow-fallback")
    """
    os.makedirs(output_dir, exist_ok=True)
    output_path = os.path.join(output_dir, f"{uuid.uuid4().hex}.mp4")
    silent_path = os.path.join(tempfile.gettempdir(), f"silent_{uuid.uuid4().hex}.mp4")

    sys.path.insert(0, _ENGINE_DIR)
    try:
        from video_builder import VideoSpec, SlideSpec, TextOverlay, build_video
        from audio import add_narration

        W, H, FPS = 1280, 720, 30

        pil_images: list[Image.Image] = []
        for s in slides:
            img = None
            for url in (s.get("image_urls") or []):
                img = _download_image(url)
                if img:
                    break
            pil_images.append(img or _placeholder(W, H))

        slide_specs: list[SlideSpec] = []
        for i, s in enumerate(slides):
            heading = (s.get("heading") or "").strip()
            texts = []
            if heading:
                texts.append(
                    TextOverlay(
                        text=heading,
                        position="top",
                        font_size=44,
                        color="#FFFFFF",
                        background="#00000099",
                        margin=32,
                    )
                )
            slide_specs.append(
                SlideSpec(
                    image_index=i,
                    duration=float(s.get("duration", 10.0)),
                    texts=texts,
                )
            )

        spec = VideoSpec(
            width=W,
            height=H,
            fps=FPS,
            default_duration=10.0,
            slides=slide_specs,
        )

        build_video(pil_images, spec, silent_path)

        narrations = [s.get("narration", "") for s in slides]
        durations = [float(s.get("duration", 10.0)) for s in slides]
        has_audio = any(n and n.strip() for n in narrations)

        if has_audio:
            add_narration(silent_path, narrations, durations, output_path)
            try:
                os.unlink(silent_path)
            except OSError:
                pass
        else:
            shutil.move(silent_path, output_path)

        log.info("Slideshow engine wrote: %s", output_path)
        return output_path, "slideshow-fallback"

    finally:
        try:
            sys.path.remove(_ENGINE_DIR)
        except ValueError:
            pass
