"""
audio.py
Generates per-slide narration and muxes it onto a silent video.

The pipeline:
  1. For each slide that has narration text, synthesize speech to a WAV (tts.py).
  2. Pad/trim each clip to exactly the slide's duration (with a short lead-in)
     so the audio stays aligned with the visuals.
  3. Concatenate the per-slide clips into one track.
  4. Mux that track onto the silent MP4 (H.264 video copied, AAC audio added).

Requires ffmpeg on PATH. TTS is offline via espeak-ng (see tts.py); swap
synth_to_wav for a better engine (Piper, cloud TTS) without touching this file.
"""

import subprocess
import tempfile
from pathlib import Path
from typing import Optional

from tts import synth_to_wav


def _run(cmd):
    p = subprocess.run(cmd, capture_output=True)
    if p.returncode != 0:
        raise RuntimeError(f"ffmpeg failed: {p.stderr.decode(errors='replace')[-500:]}")


def add_narration(
    silent_video: str,
    narrations: list,          # list[Optional[str]] aligned with spec.slides
    durations: list,           # list[float] slide durations in seconds
    output_path: str,
    lead_in: float = 0.4,      # silence before each clip's speech, seconds
    speech_rate: int = 148,    # espeak words-per-minute-ish
) -> None:
    """Attach narration audio to a silent video.

    narrations[i] is the text spoken over slide i (or None/"" for silence).
    durations[i] is that slide's length; each audio clip is fit to it exactly.
    """
    if len(narrations) != len(durations):
        raise ValueError("narrations and durations must be the same length")

    work = Path(tempfile.mkdtemp())
    seg_paths = []

    for i, (text, dur) in enumerate(zip(narrations, durations)):
        seg = work / f"seg_{i}.wav"
        if text and text.strip():
            raw = work / f"raw_{i}.wav"
            _, spoken = synth_to_wav(text, str(raw), rate=speech_rate)
            if spoken > dur:
                # speech longer than the slide: warn via exception-free clamp
                # (caller should shorten text; we trim to avoid desync)
                pass
            # delay speech by lead_in, then pad with silence, then cut to dur
            _run([
                "ffmpeg", "-y", "-i", str(raw),
                "-af", f"adelay={int(lead_in*1000)}|{int(lead_in*1000)},apad",
                "-t", str(dur), "-ar", "44100", "-ac", "2", str(seg),
            ])
        else:
            # pure silence for this slide
            _run([
                "ffmpeg", "-y", "-f", "lavfi",
                "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
                "-t", str(dur), str(seg),
            ])
        seg_paths.append(seg)

    # concat all segments
    list_file = work / "list.txt"
    list_file.write_text("".join(f"file '{p}'\n" for p in seg_paths))
    full_audio = work / "audio.wav"
    _run(["ffmpeg", "-y", "-f", "concat", "-safe", "0",
          "-i", str(list_file), "-c", "copy", str(full_audio)])

    # mux onto video
    _run([
        "ffmpeg", "-y", "-i", silent_video, "-i", str(full_audio),
        "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
        "-shortest", "-movflags", "+faststart", output_path,
    ])
