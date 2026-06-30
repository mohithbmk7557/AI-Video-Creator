"""
wrapper.py — LTX-2.3 engine callable interface.

generate_ltx_video(slides, output_dir, api_key) -> (filepath, "ltx-2.3")

Each slide becomes one LTX-2.3 clip (video) + espeak narration audio.
The clips are muxed individually then concatenated into one final .mp4.
"""
import logging
import os
import subprocess
import sys
import tempfile
import uuid
from pathlib import Path

log = logging.getLogger(__name__)

_SLIDESHOW_DIR = os.path.join(os.path.dirname(__file__), "..", "slideshow_engine")


def _synth_narration(text: str, out_wav: str) -> bool:
    """Use espeak (via slideshow_engine/tts.py) to produce a WAV. Returns True on success."""
    sys.path.insert(0, os.path.abspath(_SLIDESHOW_DIR))
    try:
        from tts import synth_to_wav
        synth_to_wav(text, out_wav)
        return True
    except Exception as e:
        log.warning("espeak narration failed: %s", e)
        return False
    finally:
        try:
            sys.path.remove(os.path.abspath(_SLIDESHOW_DIR))
        except ValueError:
            pass


def _mux_audio_video(video_path: str, audio_path: str, out_path: str) -> None:
    """Combine a video clip with a WAV narration track into out_path."""
    subprocess.run(
        [
            "ffmpeg", "-y",
            "-i", video_path,
            "-i", audio_path,
            "-c:v", "copy",
            "-c:a", "aac", "-b:a", "128k",
            "-shortest",
            out_path,
        ],
        capture_output=True,
        check=True,
    )


def generate_ltx_video(slides: list, output_dir: str, api_key: str) -> tuple:
    """
    slides: list of dicts with keys: narration, duration, heading, image_urls
    output_dir: where to write the final .mp4
    api_key: LTX_API_KEY value passed as FAL_KEY
    Returns: (output_filepath, "ltx-2.3")
    """
    from video_engines.ltx_engine.ltx_client import generate_clip

    os.makedirs(output_dir, exist_ok=True)
    tmp = Path(tempfile.mkdtemp())
    muxed_clips: list[str] = []

    for i, slide in enumerate(slides):
        prompt = (slide.get("narration") or slide.get("heading") or "educational documentary scene").strip()
        duration = float(slide.get("duration", 10.0))

        log.info("LTX-2.3 clip %d/%d — %.1fs", i + 1, len(slides), duration)

        raw_clip = generate_clip(prompt, duration, api_key)

        narration_text = slide.get("narration", "").strip()
        if narration_text:
            wav_path = str(tmp / f"narr_{i}.wav")
            muxed_path = str(tmp / f"clip_{i}_muxed.mp4")
            if _synth_narration(narration_text, wav_path):
                try:
                    _mux_audio_video(raw_clip, wav_path, muxed_path)
                    os.unlink(raw_clip)
                    muxed_clips.append(muxed_path)
                except subprocess.CalledProcessError as e:
                    log.warning("Audio mux failed for clip %d, using silent clip: %s", i, e)
                    muxed_clips.append(raw_clip)
            else:
                muxed_clips.append(raw_clip)
        else:
            muxed_clips.append(raw_clip)

    concat_list = tmp / "concat.txt"
    concat_list.write_text("".join(f"file '{p}'\n" for p in muxed_clips))

    output_path = os.path.join(output_dir, f"{uuid.uuid4().hex}.mp4")
    result = subprocess.run(
        [
            "ffmpeg", "-y",
            "-f", "concat", "-safe", "0",
            "-i", str(concat_list),
            "-c:v", "libx264", "-crf", "22", "-preset", "fast",
            "-c:a", "aac", "-b:a", "128k",
            "-movflags", "+faststart",
            output_path,
        ],
        capture_output=True,
    )

    for p in muxed_clips:
        try:
            os.unlink(p)
        except OSError:
            pass

    if result.returncode != 0:
        raise RuntimeError(f"FFmpeg concat failed: {result.stderr.decode(errors='replace')[-500:]}")

    log.info("LTX-2.3 final video: %s", output_path)
    return output_path, "ltx-2.3"
