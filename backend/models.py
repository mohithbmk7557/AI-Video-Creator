import re
from pydantic import BaseModel, field_validator
from typing import Optional
from datetime import datetime

_EMAIL_RE = re.compile(r'^[\w\-\.]+@([\w\-]+\.)+[\w]{2,}$')


def _validate_email(v: str) -> str:
    v = v.strip().lower()
    if not _EMAIL_RE.match(v):
        raise ValueError('Invalid email address')
    return v


# ── Auth schemas ──────────────────────────────────────────────────────────────

class SignupRequest(BaseModel):
    name: str
    email: str
    password: str

    @field_validator('email')
    @classmethod
    def validate_email(cls, v: str) -> str:
        return _validate_email(v)

    @field_validator('name')
    @classmethod
    def validate_name(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 2:
            raise ValueError('Name must be at least 2 characters')
        return v

    @field_validator('password')
    @classmethod
    def validate_password(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError('Password must be at least 8 characters')
        return v


class LoginRequest(BaseModel):
    email: str
    password: str

    @field_validator('email')
    @classmethod
    def validate_email(cls, v: str) -> str:
        return _validate_email(v)


class ForgotPasswordRequest(BaseModel):
    email: str

    @field_validator('email')
    @classmethod
    def validate_email(cls, v: str) -> str:
        return _validate_email(v)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: str
    name: str
    email: str


class MessageResponse(BaseModel):
    message: str


# ── Video schemas ─────────────────────────────────────────────────────────────

class VideoGenerateRequest(BaseModel):
    topic: str

    @field_validator('topic')
    @classmethod
    def validate_topic(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError('Topic cannot be empty')
        return v


class VideoItem(BaseModel):
    id: str
    user_id: str
    topic: str
    video_url: str
    thumbnail_url: Optional[str] = None
    created_at: datetime


class VideoGenerateResponse(BaseModel):
    id: str
    topic: str
    video_url: str
    thumbnail_url: Optional[str] = None
    message: str = "Video generated successfully"


class VideoHistoryResponse(BaseModel):
    videos: list[VideoItem]
    total: int
