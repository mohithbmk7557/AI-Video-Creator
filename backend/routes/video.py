import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from models import VideoGenerateRequest, VideoGenerateResponse, VideoHistoryResponse, VideoItem
from auth_utils import get_current_user
from database import get_supabase, get_mock_videos

router = APIRouter()

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


def _use_mock() -> bool:
    return get_supabase() is None


# ── POST /video/generate ──────────────────────────────────────────────────────

@router.post("/generate", response_model=VideoGenerateResponse)
async def generate_video(
    body: VideoGenerateRequest,
    current_user: dict = Depends(get_current_user),
):
    if not body.topic or not body.topic.strip():
        raise HTTPException(status_code=400, detail="Topic cannot be empty")

    # Mock video generation — replace with real AI pipeline when ready
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
