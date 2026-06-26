# AiVid — Python FastAPI Backend

REST API for the AiVid Flutter app. Built with FastAPI, python-jose, passlib, and supabase-py.

## Prerequisites

- Python 3.11+
- pip

## Setup

```bash
# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env with your Supabase credentials

# Start the server (development)
uvicorn main:app --reload --port 8000

# Or use the run script
bash run.sh
```

## Supabase Setup

1. Create a project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor** and run the contents of `supabase_schema.sql`
3. Copy your **Project URL** and **anon/service key** into `.env`

## API Endpoints

### Authentication

| Method | Endpoint | Body | Description |
|---|---|---|---|
| POST | `/auth/signup` | `{name, email, password}` | Register a new user |
| POST | `/auth/login` | `{email, password}` | Login, returns JWT |
| POST | `/auth/forgot-password` | `{email}` | Send password reset email |

### Video (requires Bearer token)

| Method | Endpoint | Body | Description |
|---|---|---|---|
| POST | `/video/generate` | `{topic}` | Generate a video for a topic |
| GET | `/video/history` | — | Get user's video history |

### Example

```bash
# Sign up
curl -X POST http://localhost:8000/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"name":"Jane","email":"jane@example.com","password":"secret123"}'

# Generate video (use the token from signup/login)
curl -X POST http://localhost:8000/video/generate \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"topic":"Climate change"}'
```

## Project Structure

```
backend/
├── main.py              FastAPI app + CORS + router registration
├── config.py            Settings (reads from .env)
├── models.py            Pydantic request/response schemas
├── database.py          Supabase client + in-memory mock fallback
├── auth_utils.py        JWT creation/validation, password hashing
├── routes/
│   ├── auth.py          /auth/* endpoints
│   └── video.py         /video/* endpoints
├── supabase_schema.sql  DB schema to run in Supabase SQL editor
├── requirements.txt     Python dependencies
└── .env.example         Environment variable template
```

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `SUPABASE_URL` | Yes (prod) | Your Supabase project URL |
| `SUPABASE_KEY` | Yes (prod) | Your Supabase anon or service key |
| `JWT_SECRET` | Yes | Secret key for signing JWTs (change in prod!) |
| `JWT_ALGORITHM` | No | Default: `HS256` |
| `JWT_EXPIRE_MINUTES` | No | Default: `1440` (24 hours) |

> **Without Supabase credentials** the app runs in mock/in-memory mode — perfect for local development and testing.

## Interactive API Docs

When the server is running, visit:
- Swagger UI: http://localhost:8000/docs
- ReDoc:       http://localhost:8000/redoc
