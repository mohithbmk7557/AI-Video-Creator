"""
tts.py — Text-to-speech using gTTS (Google TTS, free, no API key, human-quality voice).
Drop-in replacement for the espeak-ng version.
Returns (sample_rate, duration_seconds) to stay compatible with audio.py.
"""
import os
import subprocess
import tempfile
import wave


def synth_to_wav(text: str, out_path: str, rate: int = 150, **kwargs) -> tuple:
    """
    Synthesize `text` to a WAV file at `out_path`.
    Returns (sample_rate: int, duration_seconds: float).
    """
    tmp_mp3 = tempfile.mktemp(suffix=".mp3")
    try:
        from gtts import gTTS
        tts = gTTS(text=text, lang="en", slow=False)
        tts.save(tmp_mp3)

        # Convert MP3 → 44100 Hz mono WAV so audio.py can mux it with ffmpeg
        subprocess.run(
            ["ffmpeg", "-y", "-i", tmp_mp3, "-ar", "44100", "-ac", "1", out_path],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )

        # Return actual duration from the WAV file
        with wave.open(out_path, "r") as wf:
            sample_rate = wf.getframerate()
            duration = wf.getnframes() / float(sample_rate)

        return sample_rate, duration

    except Exception:
        # Fallback: silence so the video still renders even if gTTS network fails
        duration = max(1.0, len(text.split()) * 0.4)
        subprocess.run(
            [
                "ffmpeg", "-y", "-f", "lavfi",
                "-i", "anullsrc=channel_layout=mono:sample_rate=44100",
                "-t", str(duration), out_path,
            ],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        return 44100, duration

    finally:
        if os.path.exists(tmp_mp3):
            try:
                os.unlink(tmp_mp3)
            except OSError:
                pass
