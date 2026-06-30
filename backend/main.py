import logging
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routes import auth, video

logging.basicConfig(level=logging.INFO)

VIDEOS_DIR = "/tmp/aivid_videos"
os.makedirs(VIDEOS_DIR, exist_ok=True)

app = FastAPI(
    title="AiVid API",
    description="AI Video Generator - Backend API",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/auth", tags=["Authentication"])
app.include_router(video.router, prefix="/video", tags=["Video"])


@app.get("/")
def root():
    return {"message": "AiVid API is running", "version": "1.0.0"}


@app.get("/health")
def health():
    return {"status": "ok"}
