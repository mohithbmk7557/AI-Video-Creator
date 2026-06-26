import uuid
from fastapi import APIRouter, HTTPException, status
from models import SignupRequest, LoginRequest, ForgotPasswordRequest, TokenResponse, MessageResponse
from auth_utils import hash_password, verify_password, create_access_token
from database import get_supabase, get_mock_users

router = APIRouter()


def _use_mock() -> bool:
    return get_supabase() is None


# ── POST /auth/signup ─────────────────────────────────────────────────────────

@router.post("/signup", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def signup(body: SignupRequest):
    if _use_mock():
        # In-memory mock mode
        users = get_mock_users()
        if body.email in users:
            raise HTTPException(status_code=400, detail="Email already registered")
        user_id = str(uuid.uuid4())
        users[body.email] = {
            "id": user_id,
            "name": body.name,
            "email": body.email,
            "password_hash": hash_password(body.password),
        }
        token = create_access_token({"sub": user_id, "email": body.email})
        return TokenResponse(access_token=token, user_id=user_id, name=body.name, email=body.email)

    # Supabase mode
    db = get_supabase()
    existing = db.table("users").select("id").eq("email", body.email).execute()
    if existing.data:
        raise HTTPException(status_code=400, detail="Email already registered")

    user_id = str(uuid.uuid4())
    db.table("users").insert({
        "id": user_id,
        "name": body.name,
        "email": body.email,
        "password_hash": hash_password(body.password),
    }).execute()

    token = create_access_token({"sub": user_id, "email": body.email})
    return TokenResponse(access_token=token, user_id=user_id, name=body.name, email=body.email)


# ── POST /auth/login ──────────────────────────────────────────────────────────

@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest):
    if _use_mock():
        users = get_mock_users()
        user = users.get(body.email)
        if not user or not verify_password(body.password, user["password_hash"]):
            raise HTTPException(status_code=401, detail="Invalid email or password")
        token = create_access_token({"sub": user["id"], "email": body.email})
        return TokenResponse(access_token=token, user_id=user["id"], name=user["name"], email=body.email)

    db = get_supabase()
    result = db.table("users").select("*").eq("email", body.email).execute()
    if not result.data:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    user = result.data[0]
    if not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token = create_access_token({"sub": user["id"], "email": body.email})
    return TokenResponse(access_token=token, user_id=user["id"], name=user["name"], email=body.email)


# ── POST /auth/forgot-password ────────────────────────────────────────────────

@router.post("/forgot-password", response_model=MessageResponse)
async def forgot_password(body: ForgotPasswordRequest):
    if _use_mock():
        # In mock mode just confirm the request (no actual email sent)
        return MessageResponse(message="If an account exists for this email, a reset link has been sent.")

    db = get_supabase()
    result = db.table("users").select("id").eq("email", body.email).execute()
    if not result.data:
        # Don't reveal whether email exists
        return MessageResponse(message="If an account exists for this email, a reset link has been sent.")

    # Use Supabase Auth reset (requires Supabase Auth setup)
    try:
        db.auth.reset_password_email(body.email)
    except Exception:
        pass  # Fail silently for security

    return MessageResponse(message="If an account exists for this email, a reset link has been sent.")
