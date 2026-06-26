from typing import Optional

try:
    from supabase import create_client, Client
    _supabase_available = True
except ImportError:
    _supabase_available = False
    Client = None  # type: ignore

from config import get_settings

_client = None


def get_supabase() -> Optional[object]:
    """
    Returns a Supabase client.
    Returns None if supabase-py is not installed or credentials are not configured.
    The app automatically falls back to in-memory storage in that case.
    """
    global _client
    if not _supabase_available:
        return None

    settings = get_settings()
    if not settings.supabase_url or not settings.supabase_key:
        return None

    if _client is None:
        _client = create_client(settings.supabase_url, settings.supabase_key)

    return _client


# ── In-memory store (used when Supabase is not configured) ───────────────────

_mock_users: dict = {}   # email -> {id, name, email, password_hash}
_mock_videos: list = []  # list of video dicts


def get_mock_users() -> dict:
    return _mock_users


def get_mock_videos() -> list:
    return _mock_videos
