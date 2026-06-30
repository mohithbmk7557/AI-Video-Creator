"""
audio.py
Muxes narration audio onto a silent video.

Pipeline:
  1. Each slide's pre-synthesized WAV is tempo-adjusted (atempo) to fit within
     its allocated duration — no hard-cut mid-sentence.
  2. A short lead-in silence is prepended, then silence pads the remainder.
  3. All per-slide segments are concatenated → one audio track.
  4. That track is muxed onto the silent MP4 (video stream copied, AAC audio added).
"""

import subprocess
import tempfile
from pathlib import Path


def _run(cmd: list) -> None:
    p = subprocess.run(cmd, capture_output=True)
    if p.returncode != 0:
        raise RuntimeError(
            f"ffmpeg failed:\n{p.stderr.decode(errors='replace')[-600:]}"
        )


def _build_atempo(speed: float) -> str:
    """
    Return a chained atempo filter string.
    atempo only accepts 0.5-2.0; chain two filters for values outside that range.
    """
    speed = max(0.25, min(4.0, speed))
    if 0.5 <= speed <= 2.0:
        return f"atempo={speed:.5f}"
    elif speed > 2.0:
        # e.g. 3.2x → atempo=2.0,atempo=1.6
        second = min(2.0, speed / 2.0)
        return f"atempo=2.0,atempo={second:.5f}"
    else:
        # e.g. 0.3x → atempo=0.5,atempo=0.6
        second = max(0.5, speed / 0.5)
        return f"atempo=0.5,atempo={second:.5f}"


def add_narration_from_wavs(
    silent_video: str,
    tts_wav_paths: list,       # list of str|None — pre-synthesized WAV per slide
    durations: list,           # list of float — final video duration for each slide (s)
    spoken_durations: list,    # list of float — actual TTS speech duration (s)
    output_path: str,
    lead_in: float = 0.4,      # silence before speech starts (s)
) -> None:
    """
    Mix pre-synthesized TTS WAVs onto a silent video.

    Each WAV is tempo-adjusted so speech fits within (duration − lead_in) seconds,
    then padded with silence to exactly fill the slide duration.
    No speech is ever hard-cut mid-sentence.
    """
    if not (len(tts_wav_paths) == len(durations) == len(spoken_durations)):
        raise ValueError("tts_wav_paths, durations, spoken_durations must all be same length")

    work = Path(tempfile.mkdtemp(prefix="aivid_audio_"))
    seg_paths = []

    for i, (wav_path, dur, spoken) in enumerate(
        zip(tts_wav_paths, durations, spoken_durations)
    ):
        seg = work / f"seg_{i}.wav"

        if wav_path and Path(wav_path).exists() and spoken > 0.05:
            available = max(0.1, dur - lead_in)   # time available for speech
            speed = spoken / available             # how fast speech needs to play
            # Keep speed in a sane range: 0.6 (40% slower) – 2.5 (2.5× faster)
            # Outside this range the audio sounds unnatural; cap and let padding fill.
            speed = max(0.6, min(2.5, speed))

            atempo = _build_atempo(speed)
            delay_ms = int(lead_in * 1000)
            af = f"adelay={delay_ms}|{delay_ms},{atempo},apad"

            _run([
                "ffmpeg", "-y",
                "-i", str(wav_path),
                "-af", af,
                "-t", str(dur),
                "-ar", "44100", "-ac", "2",
                str(seg),
            ])
        else:
            # Pure silence for this slide
            _run([
                "ffmpeg", "-y",
                "-f", "lavfi",
                "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
                "-t", str(dur),
                str(seg),
            ])

        seg_paths.append(seg)

    # Concatenate all segments into one audio track
    list_file = work / "list.txt"
    list_file.write_text("".join(f"file '{p}'\n" for p in seg_paths))
    full_audio = work / "audio.wav"
    _run([
        "ffmpeg", "-y",
        "-f", "concat", "-safe", "0", "-i", str(list_file),
        "-c", "copy",
        str(full_audio),
    ])

    # Mux onto video (copy video stream, encode audio as AAC)
    _run([
        "ffmpeg", "-y",
        "-i", silent_video,
        "-i", str(full_audio),
        "-c:v", "copy",
        "-c:a", "aac", "-b:a", "192k",
        "-shortest",
        "-movflags", "+faststart",
        output_path,
    ])


def add_narration(
    silent_video: str,
    narrations: list,          # list[str|None] — narration text per slide
    durations: list,           # list[float] — video duration per slide (s)
    output_path: str,
    lead_in: float = 0.4,
    speech_rate: int = 148,    # ignored for gTTS (kept for API compatibility)
) -> None:
    """
    Legacy entry point — synthesizes TTS inline then delegates to add_narration_from_wavs.
    Kept for backward-compatibility with the /render endpoint.
    """
    from tts import synth_to_wav

    if len(narrations) != len(durations):
        raise ValueError("narrations and durations must be the same length")

    work = Path(tempfile.mkdtemp(prefix="aivid_tts_"))
    tts_paths = []
    spoken_durations = []

    for i, (text, dur) in enumerate(zip(narrations, durations)):
        if text and text.strip():
            raw = work / f"raw_{i}.wav"
            _, spoken = synth_to_wav(text, str(raw), rate=speech_rate)
            tts_paths.append(str(raw))
            spoken_durations.append(spoken)
        else:
            tts_paths.append(None)
            spoken_durations.append(0.0)

    add_narration_from_wavs(
        silent_video, tts_paths, durations, spoken_durations, output_path, lead_in
    )
