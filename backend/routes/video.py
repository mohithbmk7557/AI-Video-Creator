import logging
import os
import uuid
from datetime import datetime, timezone
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from auth_utils import get_current_user
from database import get_supabase, get_mock_videos
from models import VideoGenerateRequest, VideoGenerateResponse, VideoHistoryResponse, VideoItem

log = logging.getLogger(__name__)
router = APIRouter()

VIDEOS_DIR = "/tmp/aivid_videos"

MOCK_VIDEO_URLS = [
    "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
    "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4",
    "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
    "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/SubaruOutbackOnStreetAndDirt.mp4",
]

MOCK_THUMBNAILS = [
    "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c5/Big_buck_bunny_poster_big.jpg/220px-Big_buck_bunny_poster_big.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8b/Elephants_Dream_s5_both.jpg/320px-Elephants_Dream_s5_both.jpg",
]


# ── Internal build models ─────────────────────────────────────────────────────

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


# ── POST /video/build  (internal — called by Express API server) ───────────────

@router.post("/build", response_model=BuildResponse)
async def build_video_file(body: BuildRequest):
    """
    Internal endpoint: Express calls this with parsed slides.
    Tries LTX-2.3 first (if LTX_API_KEY set), falls back to slideshow engine.
    Writes the .mp4 to VIDEOS_DIR and returns the filename + engine name.
    """
    if not body.slides:
        raise HTTPException(status_code=400, detail="slides required")

    os.makedirs(VIDEOS_DIR, exist_ok=True)
    slides = [s.model_dump() for s in body.slides]

    ltx_key = os.environ.get("LTX_API_KEY", "").strip()
    filepath = None
    engine = "slideshow-fallback"

    if ltx_key:
        try:
            from video_engines.ltx_engine.wrapper import generate_ltx_video
            filepath, engine = generate_ltx_video(slides, VIDEOS_DIR, ltx_key)
            log.info("LTX-2.3 succeeded for topic: %s", body.topic)
        except Exception as exc:
            log.warning(
                "LTX-2.3 failed for topic '%s', falling back to slideshow: %s",
                body.topic, exc,
            )
            filepath = None
    else:
        log.info("LTX_API_KEY not set — using slideshow fallback for topic: %s", body.topic)

    if filepath is None:
        try:
            from video_engines.slideshow_engine.wrapper import generate_slideshow_video
            filepath, engine = generate_slideshow_video(slides, VIDEOS_DIR)
            log.info("Slideshow fallback succeeded for topic: %s", body.topic)
        except Exception as exc:
            log.error("Slideshow engine also failed for topic '%s': %s", body.topic, exc)
            raise HTTPException(
                status_code=500,
                detail=f"Video generation failed: {exc}",
            )

    return BuildResponse(filename=os.path.basename(filepath), engine=engine)


# ── POST /video/generate  (authenticated, external clients) ───────────────────

def _use_mock() -> bool:
    return get_supabase() is None


@router.post("/generate", response_model=VideoGenerateResponse)
async def generate_video(
    body: VideoGenerateRequest,
    current_user: dict = Depends(get_current_user),
):
    if not body.topic or not body.topic.strip():
        raise HTTPException(status_code=400, detail="Topic cannot be empty")

    import random
    video_id = str(uuid.uuid4())
    video_url = random.choice(MOCK_VIDEO_URLS)
    thumbnail_url = random.choice(MOCK_THUMBNAILS)
    now = datetime.now(timezone.utc)

    video_record = {
        "id": video_id,
        "user_id": current_user["sub"],
        "topic": body.topic.strip(),
        "video_url": video_url,
        "thumbnail_url": thumbnail_url,
        "created_at": now.isoformat(),
    }

    if _use_mock():
        get_mock_videos().append(video_record)
    else:
        get_supabase().table("videos").insert(video_record).execute()

    return VideoGenerateResponse(
        id=video_id,
        topic=body.topic.strip(),
        video_url=video_url,
        thumbnail_url=thumbnail_url,
        message=f'Video for "{body.topic}" generated successfully',
    )


# ── GET /video/history ────────────────────────────────────────────────────────

@router.get("/history", response_model=VideoHistoryResponse)
async def video_history(current_user: dict = Depends(get_current_user)):
    user_id = current_user["sub"]

    if _use_mock():
        user_videos = [v for v in get_mock_videos() if v["user_id"] == user_id]
    else:
        result = (
            get_supabase()
            .table("videos")
            .select("*")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .execute()
        )
        user_videos = result.data or []

    items = [VideoItem(**v) for v in user_videos]
    return VideoHistoryResponse(videos=items, total=len(items))
