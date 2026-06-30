"""
video_builder.py
Turns a list of images + a JSON spec into an MP4 slideshow with text overlays.

Pipeline: PIL renders each slide (resize/letterbox + draw text) -> frames are
piped to ffmpeg as raw RGB -> ffmpeg encodes H.264 MP4.
"""

import subprocess
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

from PIL import Image, ImageDraw, ImageFont

# ---------------------------------------------------------------------------
# Spec models (parsed from the incoming JSON)
# ---------------------------------------------------------------------------

DEFAULT_FONT_PATHS = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/Library/Fonts/Arial.ttf",
    "C:/Windows/Fonts/arial.ttf",
]


@dataclass
class TextOverlay:
    text: str
    position: str = "bottom"          # top | center | bottom
    font_size: int = 48
    color: str = "#FFFFFF"
    background: Optional[str] = "#00000080"  # RGBA hex or None
    margin: int = 40

    @classmethod
    def from_dict(cls, d: dict) -> "TextOverlay":
        return cls(
            text=str(d.get("text", "")),
            position=d.get("position", "bottom"),
            font_size=int(d.get("font_size", 48)),
            color=d.get("color", "#FFFFFF"),
            background=d.get("background", "#00000080"),
            margin=int(d.get("margin", 40)),
        )


@dataclass
class SlideSpec:
    image_index: int                  # which uploaded image this slide uses
    duration: float = 3.0             # seconds
    texts: list = field(default_factory=list)  # list[TextOverlay]

    @classmethod
    def from_dict(cls, d: dict, default_duration: float) -> "SlideSpec":
        texts = [TextOverlay.from_dict(t) for t in d.get("texts", [])]
        # convenience: allow a plain "text" string instead of a "texts" list
        if not texts and d.get("text"):
            texts = [TextOverlay(text=str(d["text"]))]
        return cls(
            image_index=int(d.get("image_index", 0)),
            duration=float(d.get("duration", default_duration)),
            texts=texts,
        )


@dataclass
class VideoSpec:
    width: int = 1280
    height: int = 720
    fps: int = 30
    background: str = "#000000"
    default_duration: float = 3.0
    slides: list = field(default_factory=list)  # list[SlideSpec]

    @classmethod
    def from_dict(cls, d: dict, num_images: int) -> "VideoSpec":
        spec = cls(
            width=int(d.get("width", 1280)),
            height=int(d.get("height", 720)),
            fps=int(d.get("fps", 30)),
            background=d.get("background", "#000000"),
            default_duration=float(d.get("default_duration", 3.0)),
        )
        slides_raw = d.get("slides")
        if slides_raw:
            spec.slides = [SlideSpec.from_dict(s, spec.default_duration) for s in slides_raw]
        else:
            # no slide list given: one slide per image, in order
            spec.slides = [SlideSpec(image_index=i, duration=spec.default_duration)
                           for i in range(num_images)]
        # validation
        if spec.width % 2 or spec.height % 2:
            raise ValueError("width and height must be even numbers (H.264 requirement)")
        if not (1 <= spec.fps <= 60):
            raise ValueError("fps must be between 1 and 60")
        for s in spec.slides:
            if not (0 <= s.image_index < num_images):
                raise ValueError(f"image_index {s.image_index} out of range (got {num_images} images)")
            if not (0.1 <= s.duration <= 60):
                raise ValueError("slide duration must be between 0.1 and 60 seconds")
        total = sum(s.duration for s in spec.slides)
        if total > 300:
            raise ValueError("total video length is capped at 300 seconds")
        return spec


# ---------------------------------------------------------------------------
# Rendering
# ---------------------------------------------------------------------------

def _load_font(size: int) -> ImageFont.FreeTypeFont:
    for path in DEFAULT_FONT_PATHS:
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def _hex_to_rgba(value: str) -> tuple:
    v = value.lstrip("#")
    if len(v) == 6:
        v += "FF"
    return tuple(int(v[i:i + 2], 16) for i in (0, 2, 4, 6))


def _wrap_text(draw, text, font, max_width):
    lines, line = [], ""
    for word in text.split():
        trial = f"{line} {word}".strip()
        if draw.textlength(trial, font=font) <= max_width:
            line = trial
        else:
            if line:
                lines.append(line)
            line = word
    if line:
        lines.append(line)
    return lines or [""]


def render_slide(image: Image.Image, spec: VideoSpec, slide: SlideSpec) -> Image.Image:
    """Resize/letterbox the image onto the canvas and draw all text overlays."""
    canvas = Image.new("RGB", (spec.width, spec.height), _hex_to_rgba(spec.background)[:3])

    img = image.convert("RGB")
    scale = min(spec.width / img.width, spec.height / img.height)
    new_size = (max(1, int(img.width * scale)), max(1, int(img.height * scale)))
    img = img.resize(new_size, Image.LANCZOS)
    canvas.paste(img, ((spec.width - new_size[0]) // 2, (spec.height - new_size[1]) // 2))

    overlay = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)

    for t in slide.texts:
        font = _load_font(t.font_size)
        max_text_width = spec.width - 2 * t.margin
        lines = _wrap_text(draw, t.text, font, max_text_width)
        line_height = int(t.font_size * 1.25)
        block_height = line_height * len(lines)

        if t.position == "top":
            y0 = t.margin
        elif t.position == "center":
            y0 = (spec.height - block_height) // 2
        else:  # bottom
            y0 = spec.height - block_height - t.margin

        if t.background:
            pad = 16
            widest = max(draw.textlength(l, font=font) for l in lines)
            x0 = (spec.width - widest) // 2 - pad
            draw.rounded_rectangle(
                [x0, y0 - pad, x0 + widest + 2 * pad, y0 + block_height + pad],
                radius=12, fill=_hex_to_rgba(t.background),
            )

        for i, line in enumerate(lines):
            w = draw.textlength(line, font=font)
            draw.text(((spec.width - w) // 2, y0 + i * line_height),
                      line, font=font, fill=_hex_to_rgba(t.color))

    return Image.alpha_composite(canvas.convert("RGBA"), overlay).convert("RGB")


# ---------------------------------------------------------------------------
# Encoding
# ---------------------------------------------------------------------------

def build_video(images: list, spec: VideoSpec, output_path: str) -> None:
    """images: list[PIL.Image] indexed by SlideSpec.image_index."""
    cmd = [
        "ffmpeg", "-y",
        "-f", "rawvideo", "-pix_fmt", "rgb24",
        "-s", f"{spec.width}x{spec.height}",
        "-r", str(spec.fps),
        "-i", "pipe:0",
        "-c:v", "libx264", "-pix_fmt", "yuv420p",
        "-preset", "medium", "-crf", "20",
        "-movflags", "+faststart",
        output_path,
    ]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE,
                            stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    try:
        for slide in spec.slides:
            frame = render_slide(images[slide.image_index], spec, slide)
            raw = frame.tobytes()
            n_frames = max(1, round(slide.duration * spec.fps))
            for _ in range(n_frames):
                proc.stdin.write(raw)
    except BrokenPipeError:
        pass
    finally:
        try:
            proc.stdin.close()
        except (BrokenPipeError, OSError):
            pass
    err = proc.stderr.read()
    proc.stderr.close()
    if proc.wait(timeout=300) != 0:
        raise RuntimeError(f"ffmpeg failed: {err.decode(errors='replace')[-500:]}")
