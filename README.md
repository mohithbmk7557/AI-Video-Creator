# AiVid — AI Video Generator

A full-stack AI video generator with a Flutter mobile frontend and Python FastAPI backend.

## Project Structure

```
├── frontend/        Flutter (Dart) mobile app
│   ├── lib/
│   │   ├── screens/         Login, Sign Up, Forgot Password, Home
│   │   ├── providers/       AuthProvider, VideoProvider (state management)
│   │   ├── services/        ApiService, StorageService (secure JWT storage)
│   │   ├── models/          UserModel, VideoModel
│   │   └── config/          API base URL config
│   └── pubspec.yaml
│
└── backend/         Python FastAPI REST API
    ├── main.py              App entry point
    ├── routes/              /auth/* and /video/* endpoints
    ├── models.py            Pydantic schemas
    ├── auth_utils.py        JWT + bcrypt password hashing
    ├── database.py          Supabase client (with in-memory fallback)
    └── supabase_schema.sql  Run this in Supabase SQL Editor
```

## Quick Start

### 1. Backend

```bash
cd backend
pip install -r requirements.txt
cp .env.example .env      # Fill in your Supabase credentials
uvicorn main:app --reload --port 8000
```

### 2. Frontend

```bash
cd frontend
flutter pub get
flutter run
```

See `backend/README.md` and `frontend/README.md` for detailed setup.

## Stack

| Layer | Technology |
|---|---|
| Mobile frontend | Flutter 3 (Dart) |
| Backend API | Python 3.11 + FastAPI |
| Authentication | JWT (python-jose + passlib/bcrypt) |
| Database | Supabase (PostgreSQL) |
| State management | Provider |
| Secure storage | flutter_secure_storage |
| Video playback | video_player |

## Design

- Background: `#FFFFFF` (white)
- Primary color: `#3D35A8` (deep indigo)
- Border radius: `12px`
- Clean, minimal — inspired by Claude / ChatGPT chat UI
