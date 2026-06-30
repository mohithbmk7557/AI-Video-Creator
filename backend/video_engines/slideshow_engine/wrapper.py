"""
wrapper.py — audio-first hybrid video generator.

Pipeline (in order):
  1. Synthesize TTS for every slide  → measure actual spoken durations
  2. Compute final slide durations   → audio-driven, scaled to TARGET_SECONDS (59 s)
  3. Build video clips in parallel   → real footage or Ken Burns, at the correct duration
  4. Concatenate clips
  5. Mix pre-synthesized audio       → atempo-adjusted, never cut mid-sentence

This ordering guarantees that (a) no narration is ever trimmed and (b) the
video is always exactly 59 seconds long.
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

# ── Output dimensions ─────────────────────────────────────────────────────────
W, H, FPS = 1280, 720, 30
TARGET_SECONDS = 59.0    # target total video length
MIN_SLIDE_DUR  = 4.0     # minimum slide duration (seconds)
LEAD_IN        = 0.4     # silence before each narration starts (seconds)

# ── Import free video search (optional) ───────────────────────────────────────
try:
    from video_engines.free_video_search import find_free_video_url as _find_video
except ImportError:
    _find_video = None
    log.warning("free_video_search not importable — Ken Burns only")

_IMG_HEADERS = {
    "User-Agent": "AiVid/1.0 (educational video generator; https://replit.com)",
    "Accept": "image/jpeg,image/png,image/webp,image/*",
}


# ── Image helpers ─────────────────────────────────────────────────────────────

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


# ── TTS synthesis (phase 1) ───────────────────────────────────────────────────

def _synthesize_all_tts(slides: list, tmp_dir: Path) -> tuple[list, list]:
    """
    Synthesize gTTS for every slide that has narration text.
    Returns (tts_wav_paths, spoken_durations).
    Both lists are aligned to slides (None / 0.0 for silent slides).
    Done sequentially before the thread pool to avoid sys.path race conditions.
    """
    sys.path.insert(0, _ENGINE_DIR)
    try:
        from tts import synth_to_wav
        tts_paths: list = []
        spoken_durs: list = []

        for idx, slide in enumerate(slides):
            text = (slide.get("narration") or "").strip()
            if text:
                wav = tmp_dir / f"tts_{idx:02d}.wav"
                try:
                    _, spoken = synth_to_wav(text, str(wav))
                    tts_paths.append(str(wav))
                    spoken_durs.append(float(spoken))
                except Exception as exc:
                    log.warning("TTS failed for slide %d: %s", idx, exc)
                    tts_paths.append(None)
                    spoken_durs.append(0.0)
            else:
                tts_paths.append(None)
                spoken_durs.append(0.0)

        return tts_paths, spoken_durs

    finally:
        try:
            sys.path.remove(_ENGINE_DIR)
        except ValueError:
            pass


# ── Duration calculation (phase 2) ───────────────────────────────────────────

def _compute_final_durations(slides: list, spoken_durs: list) -> list:
    """
    Compute a final duration for each slide so that:
      • Every narration fits (natural pace + lead-in + small buffer)
      • All durations sum to exactly TARGET_SECONDS
    """
    raw = []
    for idx, slide in enumerate(slides):
        target = float(slide.get("duration", 10.0))
        spoken = spoken_durs[idx]
        if spoken > 0:
            # Speech-driven: ensure the full narration can play at natural speed
            raw.append(max(spoken + LEAD_IN + 0.6, target, MIN_SLIDE_DUR))
        else:
            raw.append(max(target, MIN_SLIDE_DUR))

    total = sum(raw)
    scale = TARGET_SECONDS / total if total > 0 else 1.0
    return [round(d * scale, 3) for d in raw]


# ── FFmpeg clip helpers ───────────────────────────────────────────────────────

def _drawtext_filter(heading: str) -> str:
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
            capture_output=True, timeout=180,
        )
        if proc.returncode != 0:
            raise RuntimeError(f"ffmpeg concat: {proc.stderr.decode()[-300:]}")
    finally:
        list_file.unlink(missing_ok=True)


# ── Free video clip (phase 3, per slide) ─────────────────────────────────────

def _download_video(url: str, dest: Path, max_mb: int = 40) -> bool:
    try:
        with httpx.stream("GET", url, timeout=30, follow_redirects=True) as r:
            r.raise_for_status()
            written = 0
            with open(dest, "wb") as fh:
                for chunk in r.iter_bytes(65536):
                    fh.write(chunk)
                    written += len(chunk)
                    if written > max_mb * 1024 * 1024:
                        break
        return dest.exists() and dest.stat().st_size > 4096
    except Exception as exc:
        log.debug("Video download failed: %s", exc)
        dest.unlink(missing_ok=True)
        return False


def _trim_and_overlay(raw: Path, dest: Path, duration: float, heading: str) -> bool:
    """Trim/loop raw clip to duration seconds, scale to 1280×720, add heading."""
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
            "-stream_loop", "-1",   # loop source if shorter than duration
            "-i", str(raw),
            "-t", str(duration),
            "-vf", ",".join(vf_parts),
            "-c:v", "libx264", "-pix_fmt", "yuv420p",
            "-preset", "fast", "-crf", "22",
            "-an",
            str(dest),
        ],
        capture_output=True, timeout=120,
    )
    raw.unlink(missing_ok=True)
    if proc.returncode != 0:
        log.debug("ffmpeg trim failed: %s", proc.stderr.decode()[-200:])
        return False
    return dest.exists() and dest.stat().st_size > 4096


def _try_free_video_clip(heading: str, duration: float, dest: Path) -> bool:
    if _find_video is None or not heading:
        return False
    url = _find_video(heading)
    if not url:
        return False
    raw = dest.parent / f"raw_{dest.stem}.tmp"
    if not _download_video(url, raw):
        return False
    return _trim_and_overlay(raw, dest, duration, heading)


# ── Ken Burns clip (phase 3, per slide) ──────────────────────────────────────

def _render_ken_burns_clip(
    img: "Image.Image",
    heading: str,
    duration: float,
    move_id: int,
    dest: Path,
) -> None:
    sys.path.insert(0, _ENGINE_DIR)
    try:
        from video_builder import VideoSpec, SlideSpec, TextOverlay, render_slide
        from video_builder import _ken_burns_frames

        texts = (
            [TextOverlay(text=heading, position="top", font_size=44,
                         color="#FFFFFF", background="#00000099", margin=32)]
            if heading else []
        )
        slide_spec = SlideSpec(image_index=0, duration=duration, texts=texts)
        video_spec  = VideoSpec(width=W, height=H, fps=FPS, slides=[slide_spec])

        base     = render_slide(img, video_spec, slide_spec)
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
    Build one MP4 clip.  duration is already set to the final scaled value.
    Priority: free video footage → Ken Burns on topic photo.
    """
    heading  = (slide.get("heading") or "").strip()
    duration = float(slide.get("duration", 10.0))
    dest     = tmp_dir / f"clip_{idx:02d}.mp4"

    # 1 — try real video footage
    try:
        if _try_free_video_clip(heading, duration, dest):
            log.info("Slide %d (%.1fs): real footage '%s'", idx, duration, heading[:50])
            return dest
    except Exception as exc:
        log.debug("Free video failed slide %d: %s", idx, exc)
        dest.unlink(missing_ok=True)

    # 2 — Ken Burns fallback
    img = _fetch_best_image(slide.get("image_urls", []))
    _render_ken_burns_clip(img, heading, duration, idx, dest)
    log.info("Slide %d (%.1fs): Ken Burns '%s'", idx, duration, heading[:50])
    return dest


# ── Public entry point ────────────────────────────────────────────────────────

def generate_slideshow_video(slides: list, output_dir: str) -> tuple:
    """
    slides: list of {narration, image_urls, duration, heading}
    Returns (output_filepath, "hybrid")
    """
    os.makedirs(output_dir, exist_ok=True)
    tmp_dir = Path(tempfile.mkdtemp(prefix="aivid_"))

    try:
        # ── Phase 1: Synthesize all TTS (sequential, thread-safe) ────────────
        log.info("Phase 1: synthesizing TTS for %d slides", len(slides))
        tts_paths, spoken_durs = _synthesize_all_tts(slides, tmp_dir)

        # ── Phase 2: Compute final durations (audio-driven, scaled to 59 s) ──
        final_durs = _compute_final_durations(slides, spoken_durs)
        log.info(
            "Phase 2: durations = %s  (total=%.1fs)",
            [f"{d:.1f}" for d in final_durs],
            sum(final_durs),
        )

        # Attach final durations to slides before passing to thread pool
        slides_final = [
            {**s, "duration": final_durs[i]}
            for i, s in enumerate(slides)
        ]

        # ── Phase 3: Build video clips in parallel ────────────────────────────
        n = len(slides_final)
        clip_paths: list = [None] * n

        with ThreadPoolExecutor(max_workers=min(n, 4)) as pool:
            futures = {
                pool.submit(_process_slide, idx, slide, tmp_dir): idx
                for idx, slide in enumerate(slides_final)
            }
            for fut in as_completed(futures):
                idx = futures[fut]
                try:
                    clip_paths[idx] = fut.result()
                except Exception as exc:
                    log.error("Slide %d failed: %s — inserting blank", idx, exc)
                    blank = tmp_dir / f"blank_{idx:02d}.mp4"
                    _render_ken_burns_clip(
                        _blank_image(), "", final_durs[idx], idx, blank
                    )
                    clip_paths[idx] = blank

        # ── Phase 4: Concatenate video clips ──────────────────────────────────
        silent_path = tmp_dir / "silent.mp4"
        _concat_clips([str(p) for p in clip_paths], silent_path)

        # ── Phase 5: Mix audio (pre-synthesized WAVs + atempo sync) ──────────
        out_path = Path(output_dir) / f"{uuid.uuid4().hex}.mp4"
        has_audio = any(p is not None for p in tts_paths)

        if has_audio:
            sys.path.insert(0, _ENGINE_DIR)
            try:
                from audio import add_narration_from_wavs
                add_narration_from_wavs(
                    str(silent_path),
                    tts_paths,
                    final_durs,
                    spoken_durs,
                    str(out_path),
                    lead_in=LEAD_IN,
                )
            except Exception as exc:
                log.warning("Audio mux failed: %s — using silent video", exc)
                shutil.copy2(str(silent_path), str(out_path))
            finally:
                try:
                    sys.path.remove(_ENGINE_DIR)
                except ValueError:
                    pass
        else:
            shutil.copy2(str(silent_path), str(out_path))

        log.info(
            "Hybrid engine done: %s  (%.1f s, %d slides)",
            out_path.name, sum(final_durs), n,
        )
        return str(out_path), "hybrid"

    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)
