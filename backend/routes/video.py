import io
import json
import logging
import os
import sys
import tempfile
import uuid
from pathlib import Path
from typing import List

from fastapi import APIRouter, BackgroundTasks, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from PIL import Image, UnidentifiedImageError
from pydantic import BaseModel

log = logging.getLogger(__name__)
router = APIRouter()

VIDEOS_DIR = "/tmp/aivid_videos"
_ENGINE_DIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "video_engines", "slideshow_engine")
)

MAX_IMAGES = 50
MAX_IMAGE_BYTES = 15 * 1024 * 1024  # 15 MB


# ── Pydantic models ───────────────────────────────────────────────────────────

class SlideInput(BaseModel):
    narration: str = ""
    image_urls: List[str] = []
    duration: float = 10.0
    heading: str = ""


class BuildRequest(BaseModel):
    topic: str = ""
    slides: List[SlideInput]


class BuildResponse(BaseModel):
    filename: str
    engine: str


# ── POST /video/build  (internal — called by Express API server) ──────────────

@router.post("/build", response_model=BuildResponse)
async def build_video_file(body: BuildRequest):
    """
    Receives slides with image_urls from Express, builds an MP4.

    Engine priority:
      1. Pexels video engine  — if PEXELS_API_KEY is set (real video footage)
      2. Slideshow engine     — Ken Burns pan/zoom on topic-relevant photos (always available)
    """
    if not body.slides:
        raise HTTPException(status_code=400, detail="slides required")

    os.makedirs(VIDEOS_DIR, exist_ok=True)
    slides = [s.model_dump() for s in body.slides]
    pexels_key = os.environ.get("PEXELS_API_KEY", "").strip()

    filepath: str | None = None
    engine: str = "unknown"

    # ── 1. Try Pexels if we have a key ────────────────────────────────────────
    if pexels_key:
        try:
            from video_engines.pexels_engine.wrapper import generate_pexels_video
            filepath, engine = generate_pexels_video(slides, VIDEOS_DIR, pexels_key)
            log.info("Pexels engine success — topic=%s file=%s", body.topic, filepath)
        except Exception as pex_exc:
            log.warning("Pexels engine failed (%s) — falling back to slideshow", pex_exc)
            filepath = None

    # ── 2. Slideshow engine (Ken Burns animated) — always-available fallback ──
    if not filepath:
        try:
            from video_engines.slideshow_engine.wrapper import generate_slideshow_video
            filepath, engine = generate_slideshow_video(slides, VIDEOS_DIR)
            log.info("Slideshow engine success — engine=%s topic=%s file=%s",
                     engine, body.topic, filepath)
        except Exception as exc:
            log.error("Video generation failed for topic '%s': %s", body.topic, exc)
            raise HTTPException(status_code=500, detail=f"Video generation failed: {exc}")

    return BuildResponse(filename=os.path.basename(filepath), engine=engine)


# ── POST /video/render  (direct FFmpeg render — accepts uploaded image files) ──
# Mirrors the /videos endpoint from the uploaded main.py, integrated here.

@router.post("/render")
async def render_video(
    background_tasks: BackgroundTasks,
    images: List[UploadFile] = File(..., description="Image files in slide order"),
    spec: str = Form("{}", description="JSON spec string"),
):
    """
    Direct FFmpeg render endpoint (from the uploaded main.py).
    Accepts multipart image uploads + a JSON spec, returns an MP4 file.
    """
    # Parse spec
    try:
        spec_dict = json.loads(spec)
        if not isinstance(spec_dict, dict):
            raise ValueError("spec must be a JSON object")
    except (json.JSONDecodeError, ValueError) as e:
        raise HTTPException(status_code=422, detail=f"Invalid spec JSON: {e}")

    # Load images
    if not images or len(images) > MAX_IMAGES:
        raise HTTPException(status_code=422, detail=f"Provide 1–{MAX_IMAGES} images")

    pil_images = []
    for i, up in enumerate(images):
        data = await up.read()
        if len(data) > MAX_IMAGE_BYTES:
            raise HTTPException(status_code=413, detail=f"Image {i} exceeds 15 MB")
        try:
            img = Image.open(io.BytesIO(data))
            img.load()
        except UnidentifiedImageError:
            raise HTTPException(
                status_code=422,
                detail=f"File {i} ({up.filename}) is not a valid image",
            )
        pil_images.append(img)

    # Validate spec and build video using the uploaded engine
    sys.path.insert(0, _ENGINE_DIR)
    try:
        from video_builder import VideoSpec, build_video
        from audio import add_narration

        try:
            video_spec = VideoSpec.from_dict(spec_dict, num_images=len(pil_images))
        except (ValueError, TypeError, KeyError) as e:
            raise HTTPException(status_code=422, detail=str(e))

        raw_slides = spec_dict.get("slides")
        narrations = [s.get("narration") for s in raw_slides] if raw_slides else [None] * len(video_spec.slides)
        durations = [s.duration for s in video_spec.slides]
        has_audio = any(n and n.strip() for n in narrations)

        tmp = Path(tempfile.gettempdir())
        silent_path = tmp / f"silent_{uuid.uuid4().hex}.mp4"
        out_path = tmp / f"video_{uuid.uuid4().hex}.mp4"

        try:
            build_video(pil_images, video_spec, str(silent_path))
        except RuntimeError as e:
            raise HTTPException(status_code=500, detail=f"Video render failed: {e}")

        if has_audio:
            try:
                add_narration(str(silent_path), narrations, durations, str(out_path))
            except (RuntimeError, ValueError) as e:
                raise HTTPException(status_code=500, detail=f"Audio step failed: {e}")
            background_tasks.add_task(silent_path.unlink, missing_ok=True)
            final = out_path
        else:
            final = silent_path

        background_tasks.add_task(final.unlink, missing_ok=True)
        return FileResponse(str(final), media_type="video/mp4", filename="output.mp4")

    finally:
        try:
            sys.path.remove(_ENGINE_DIR)
        except ValueError:
            pass
