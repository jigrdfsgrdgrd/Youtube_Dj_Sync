import os
import json
import io
from pathlib import Path
from typing import Optional
from fastapi import FastAPI, HTTPException, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, Response, JSONResponse
from pydantic import BaseModel
from mutagen.id3 import ID3
try:
    from backend.sync_engine import SyncManager, scan_tracks_library
except ImportError:
    from sync_engine import SyncManager, scan_tracks_library

app = FastAPI(title="YouTube DJ Sync API", version="1.0.0")

# CORS Setup für Frontend (localhost:3000)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CONFIG_FILE = os.path.join(BASE_DIR, "config.json")
sync_manager = SyncManager(BASE_DIR)

def load_config() -> dict:
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {
        "youtube_music": {"playlist_ids": [], "auth_file": "headers_auth.json"},
        "downloads": {"destination_path": "../storage/downloads", "ffmpeg_path": "", "audio_quality": "320"}
    }

def save_config(cfg: dict):
    with open(CONFIG_FILE, "w", encoding="utf-8") as f:
        json.dump(cfg, f, indent=2, ensure_ascii=False)

class SyncRequest(BaseModel):
    playlist_url_or_id: str
    quality: Optional[str] = "320"
    destination_path: Optional[str] = None

class ConfigUpdateRequest(BaseModel):
    destination_path: Optional[str] = None
    audio_quality: Optional[str] = None
    ffmpeg_path: Optional[str] = None

@app.get("/api/health")
def health():
    return {"status": "ok", "app": "YouTube DJ Sync Backend", "version": "1.0.0"}

@app.get("/api/config")
def get_config():
    cfg = load_config()
    # Absoluten Pfad berechnen für die Anzeige im Frontend
    dest = cfg.get("downloads", {}).get("destination_path", "../storage/downloads")
    if not os.path.isabs(dest):
        dest_abs = os.path.normpath(os.path.join(BASE_DIR, dest))
    else:
        dest_abs = dest
    return {
        "config": cfg,
        "resolved_destination": dest_abs
    }

@app.post("/api/config")
def update_config(req: ConfigUpdateRequest):
    cfg = load_config()
    if "downloads" not in cfg:
        cfg["downloads"] = {}
    if req.destination_path is not None:
        cfg["downloads"]["destination_path"] = req.destination_path
    if req.audio_quality is not None:
        cfg["downloads"]["audio_quality"] = req.audio_quality
    if req.ffmpeg_path is not None:
        cfg["downloads"]["ffmpeg_path"] = req.ffmpeg_path
    save_config(cfg)
    return {"status": "success", "config": cfg}

@app.post("/api/sync")
def start_sync(req: SyncRequest):
    cfg = load_config()
    dest = req.destination_path or cfg.get("downloads", {}).get("destination_path")
    quality = req.quality or cfg.get("downloads", {}).get("audio_quality", "320")
    
    success, msg = sync_manager.start_sync(
        playlist_url_or_id=req.playlist_url_or_id,
        quality=quality,
        custom_dest=dest
    )
    if not success:
        raise HTTPException(status_code=400, detail=msg)
    return {"status": "started", "message": msg}

@app.get("/api/status")
def get_status():
    return sync_manager.get_status()

@app.post("/api/cancel")
def cancel_sync():
    cancelled = sync_manager.cancel()
    return {"cancelled": cancelled}

@app.get("/api/tracks")
def list_tracks():
    cfg = load_config()
    dest = cfg.get("downloads", {}).get("destination_path")
    tracks = scan_tracks_library(BASE_DIR, dest)
    return {"tracks": tracks, "count": len(tracks)}

def find_track_by_id(track_id: str):
    cfg = load_config()
    dest = cfg.get("downloads", {}).get("destination_path")
    tracks = scan_tracks_library(BASE_DIR, dest)
    for t in tracks:
        if t["id"] == track_id:
            return t
    return None

@app.get("/api/cover/{track_id}")
def get_track_cover(track_id: str):
    track = find_track_by_id(track_id)
    if not track or not os.path.exists(track["file_path"]):
        raise HTTPException(status_code=404, detail="Track nicht gefunden")

    file_path = track["file_path"]
    if file_path.lower().endswith(".mp3"):
        try:
            tags = ID3(file_path)
            for k in tags.keys():
                if k.startswith("APIC"):
                    apic = tags[k]
                    media_type = apic.mime or "image/jpeg"
                    return Response(content=apic.data, media_type=media_type)
        except Exception:
            pass
    raise HTTPException(status_code=404, detail="Kein Cover vorhanden")

@app.get("/api/audio/{track_id}")
def stream_audio(track_id: str, request: Request):
    """Streaming mit HTTP-Range-Unterstützung für das Vor- und Zurückspulen."""
    track = find_track_by_id(track_id)
    if not track or not os.path.exists(track["file_path"]):
        raise HTTPException(status_code=404, detail="Audio-Datei nicht gefunden")

    file_path = track["file_path"]
    file_size = os.path.getsize(file_path)
    range_header = request.headers.get("range")

    content_type = "audio/mpeg"
    if file_path.lower().endswith(".m4a") or file_path.lower().endswith(".mp4"):
        content_type = "audio/mp4"
    elif file_path.lower().endswith(".wav"):
        content_type = "audio/wav"
    elif file_path.lower().endswith(".flac"):
        content_type = "audio/flac"

    if range_header:
        byte_range = range_header.replace("bytes=", "").split("-")
        start = int(byte_range[0]) if byte_range[0] else 0
        end = int(byte_range[1]) if len(byte_range) > 1 and byte_range[1] else file_size - 1
        length = end - start + 1

        def iter_file():
            with open(file_path, "rb") as f:
                f.seek(start)
                bytes_left = length
                chunk_size = 1024 * 128
                while bytes_left > 0:
                    read_len = min(chunk_size, bytes_left)
                    data = f.read(read_len)
                    if not data:
                        break
                    bytes_left -= len(data)
                    yield data

        headers = {
            "Content-Range": f"bytes {start}-{end}/{file_size}",
            "Accept-Ranges": "bytes",
            "Content-Length": str(length),
            "Content-Type": content_type,
        }
        return StreamingResponse(iter_file(), status_code=status.HTTP_206_PARTIAL_CONTENT, headers=headers)
    else:
        def iter_full_file():
            with open(file_path, "rb") as f:
                while chunk := f.read(1024 * 128):
                    yield chunk

        headers = {
            "Accept-Ranges": "bytes",
            "Content-Length": str(file_size),
            "Content-Type": content_type,
        }
        return StreamingResponse(iter_full_file(), headers=headers)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="127.0.0.1", port=8000, reload=True)
