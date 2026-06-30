"""
ltx_client.py
Calls LTX-2.3 via Fal.ai hosted inference for a single video clip.
Authenticated with FAL_KEY (set from LTX_API_KEY env var by the wrapper).
"""
import os
import logging
import tempfile
import uuid

import httpx

log = logging.getLogger(__name__)

LTX_MODEL = "fal-ai/ltx-video"


def _download_clip(url: str, dest: str) -> None:
    with httpx.Client(timeout=180, follow_redirects=True) as client:
        with client.stream("GET", url) as r:
            r.raise_for_status()
            with open(dest, "wb") as f:
                for chunk in r.iter_bytes(chunk_size=65536):
                    f.write(chunk)


def generate_clip(prompt: str, duration: float, api_key: str) -> str:
    """
    Call Fal.ai LTX-2.3 for a single clip.
    Returns the local .mp4 path of the downloaded clip.
    """
    import fal_client

    os.environ["FAL_KEY"] = api_key

    clip_duration = int(max(5, min(10, duration)))

    log.info("LTX-2.3 requesting clip — duration=%ds prompt=%s", clip_duration, prompt[:80])

    result = fal_client.run(
        LTX_MODEL,
        arguments={
            "prompt": prompt,
            "duration": clip_duration,
            "num_inference_steps": 40,
            "guidance_scale": 3.0,
            "width": 1280,
            "height": 720,
        },
    )

    video_url = (
        (result.get("video") or {}).get("url")
        or (result.get("output") or {}).get("url")
        or result.get("url")
    )
    if not video_url:
        raise RuntimeError(f"LTX-2.3 response missing video URL. Response keys: {list(result.keys())}")

    clip_path = os.path.join(tempfile.gettempdir(), f"ltx_clip_{uuid.uuid4().hex}.mp4")
    log.info("LTX-2.3 downloading clip from %s", video_url)
    _download_clip(video_url, clip_path)
    return clip_path
