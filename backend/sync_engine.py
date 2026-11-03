import os
import sys
import json
import re
import shutil
import traceback
import threading
import hashlib
import time
from pathlib import Path
import requests
import yt_dlp
from mutagen.mp3 import MP3
from mutagen.id3 import ID3, TIT2, TPE1, TALB, APIC, TRCK

def clean_filename(name: str) -> str:
    """Bereinigt Dateinamen für Windows/Linux/Mac."""
    cleaned = re.sub(r'[<>:"/\\|?*]', '-', name)
    cleaned = re.sub(r'\s+', ' ', cleaned)
    cleaned = re.sub(r'-+', '-', cleaned)
    return cleaned.strip()

def extract_playlist_id(playlist_id_or_url: str) -> str:
    """Extrahiert die Playlist-ID aus URL oder String."""
    if not playlist_id_or_url:
        return ""
    text = playlist_id_or_url.strip()
    if "list=" in text:
        match = re.search(r'list=([^&?#]+)', text)
        if match:
            return match.group(1)
    parts = re.split(r'[&?#]', text)
    if parts:
        return parts[0].strip().strip('/')
    return text

def tag_mp3_file(mp3_path: str, artists, title: str, album: str = "", cover_url: str = None, track_number: int = None):
    """Schreibt ID3-Tags und bettet Cover-Art ein."""
    artist_str = ", ".join(artists) if isinstance(artists, list) else (artists or "Unknown Artist")
    try:
        try:
            audio = ID3(mp3_path)
        except Exception:
            audio = ID3()

        audio["TPE1"] = TPE1(encoding=3, text=artist_str)
        audio["TIT2"] = TIT2(encoding=3, text=title)
        if album:
            audio["TALB"] = TALB(encoding=3, text=album)
        if track_number is not None:
            audio["TRCK"] = TRCK(encoding=3, text=str(track_number))

        if cover_url:
            try:
                res = requests.get(cover_url, timeout=12)
                if res.status_code == 200:
                    mime = "image/png" if ".png" in cover_url.lower() else "image/jpeg"
                    audio["APIC"] = APIC(
                        encoding=3,
                        mime=mime,
                        type=3,
                        desc="Cover",
                        data=res.content
                    )
            except Exception:
                pass

        audio.save(mp3_path)
        return True
    except Exception as e:
        print(f"Fehler beim ID3-Tagging: {e}")
        return False

def update_track_number(mp3_path: str, track_number: int):
    """Aktualisiert nur den Track-Nummer Tag und schützt bestehende Hotcues."""
    if not mp3_path.lower().endswith('.mp3'):
        return
    try:
        try:
            audio = ID3(mp3_path)
        except Exception:
            audio = ID3()
        audio["TRCK"] = TRCK(encoding=3, text=str(track_number))
        audio.save(mp3_path)
    except Exception:
        pass

def song_file_exists(destination_path: str, cleaned_filename_no_ext: str):
    """Prüft, ob eine Audio-Datei bereits im Zielordner existiert."""
    extensions = ['.mp3', '.m4a', '.mp4', '.wav', '.aif', '.aiff', '.flac',
                  '.stem.mp4', '.stem.m4a', '.stem.mp3']
    for ext in extensions:
        test_path = os.path.join(destination_path, cleaned_filename_no_ext + ext)
        if os.path.exists(test_path):
            return test_path
    return None

class SyncManager:
    """Verwaltet den Hintergrund-Download-Prozess thread-safe."""
    def __init__(self, base_dir: str):
        self.base_dir = base_dir
        self.lock = threading.Lock()
        self.stop_event = threading.Event()
        self.thread = None

        self.state = {
            "status": "idle", # "idle", "running", "completed", "error", "cancelled"
            "active_playlist": "",
            "current_index": 0,
            "total_tracks": 0,
            "percent": 0,
            "current_track": "",
            "success_count": 0,
            "skipped_count": 0,
            "failed_count": 0,
            "error": None,
            "logs": []
        }

    def add_log(self, message: str):
        with self.lock:
            timestamp = time.strftime("%H:%M:%S")
            log_line = f"[{timestamp}] {message}"
            self.state["logs"].append(log_line)
            if len(self.state["logs"]) > 200:
                self.state["logs"].pop(0)

    def get_status(self):
        with self.lock:
            return dict(self.state)

    def cancel(self):
        with self.lock:
            if self.state["status"] == "running":
                self.stop_event.set()
                self.state["status"] = "cancelling"
                self.add_log("Abbruch angefordert...")
                return True
            return False

    def start_sync(self, playlist_url_or_id: str, quality: str = "320", custom_dest: str = None):
        with self.lock:
            if self.state["status"] == "running":
                return False, "Ein Download-Vorgang läuft bereits."

            self.stop_event.clear()
            self.state = {
                "status": "running",
                "active_playlist": playlist_url_or_id,
                "current_index": 0,
                "total_tracks": 0,
                "percent": 0,
                "current_track": "Initialisiere...",
                "success_count": 0,
                "skipped_count": 0,
                "failed_count": 0,
                "error": None,
                "logs": []
            }

        self.thread = threading.Thread(
            target=self._run_sync,
            args=(playlist_url_or_id, quality, custom_dest),
            daemon=True
        )
        self.thread.start()
        return True, "Sync gestartet."

    def _resolve_destination(self, custom_dest: str) -> str:
        if custom_dest and custom_dest.strip():
            dest = os.path.expandvars(custom_dest.strip())
            if not os.path.isabs(dest):
                dest = os.path.normpath(os.path.join(self.base_dir, dest))
            return dest
        # Standard: storage/downloads
        return os.path.normpath(os.path.join(self.base_dir, "..", "storage", "downloads"))

    def _get_tracks(self, playlist_id: str):
        """Holt Track-Liste über ytmusicapi mit yt-dlp Fallback."""
        tracks = []
        playlist_title = f"Playlist_{playlist_id}"

        # 1. Versuch mit ytmusicapi
        try:
            from ytmusicapi import YTMusic
            auth_file = os.path.join(self.base_dir, "headers_auth.json")
            if os.path.exists(auth_file):
                yt = YTMusic(auth_file)
            else:
                yt = YTMusic()
            
            pdata = yt.get_playlist(playlist_id, limit=None)
            playlist_title = pdata.get('title', playlist_title)
            for item in pdata.get('tracks', []):
                vid = item.get('videoId')
                if not vid:
                    continue
                artists = [a['name'] for a in item.get('artists', []) if a.get('name')]
                cover = item['thumbnails'][-1]['url'] if item.get('thumbnails') else None
                album = item['album'].get('name', '') if item.get('album') else ''
                tracks.append({
                    'title': item.get('title', 'Unknown Title'),
                    'artists': artists,
                    'album': album,
                    'video_id': vid,
                    'cover_url': cover
                })
            if tracks:
                return playlist_title, tracks
        except Exception as e:
            self.add_log(f"Hinweis: ytmusicapi Fallback auf yt-dlp ({e})")

        # 2. Fallback auf yt-dlp Direktextraktion
        ydl_opts = {
            'extract_flat': True,
            'quiet': True,
            'no_warnings': True,
        }
        playlist_url = f"https://www.youtube.com/playlist?list={playlist_id}"
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(playlist_url, download=False)
            if info:
                playlist_title = info.get('title', playlist_title)
                entries = info.get('entries', []) or []
                for entry in entries:
                    if not entry:
                        continue
                    vid = entry.get('id')
                    raw_title = entry.get('title', 'Unknown Title')
                    uploader = entry.get('uploader') or entry.get('channel') or 'YouTube'
                    thumbnails = entry.get('thumbnails') or []
                    cover = thumbnails[-1]['url'] if thumbnails else None
                    tracks.append({
                        'title': raw_title,
                        'artists': [uploader],
                        'album': playlist_title,
                        'video_id': vid,
                        'cover_url': cover
                    })

        return playlist_title, tracks

    def _run_sync(self, playlist_input: str, quality: str, custom_dest: str):
        try:
            self.add_log("Analysiere Playlist-URL...")
            playlist_id = extract_playlist_id(playlist_input)
            if not playlist_id:
                raise ValueError("Ungültige Playlist-URL oder Playlist-ID.")

            dest_base = self._resolve_destination(custom_dest)
            os.makedirs(dest_base, exist_ok=True)

            self.add_log(f"Lade Playlist-Informationen für ID: {playlist_id}...")
            playlist_title, tracks = self._get_tracks(playlist_id)

            if not tracks:
                raise ValueError("Keine Tracks in der Playlist gefunden.")

            clean_p_title = clean_filename(playlist_title)
            final_folder = os.path.join(dest_base, clean_p_title)
            os.makedirs(final_folder, exist_ok=True)

            temp_dir = os.path.join(self.base_dir, ".temp_downloads")
            os.makedirs(temp_dir, exist_ok=True)

            with self.lock:
                self.state["active_playlist"] = playlist_title
                self.state["total_tracks"] = len(tracks)

            self.add_log(f"Gefunden: '{playlist_title}' ({len(tracks)} Songs)")
            self.add_log(f"Zielordner: {final_folder}")

            for idx, track in enumerate(tracks, 1):
                if self.stop_event.is_set():
                    self.add_log("Download durch Benutzer abgebrochen.")
                    with self.lock:
                        self.state["status"] = "cancelled"
                    return

                title = track['title']
                artists = track['artists']
                video_id = track['video_id']
                album = track.get('album', '')
                cover_url = track.get('cover_url')

                artist_str = ", ".join(artists) if artists else "Unknown Artist"
                raw_filename = f"{artist_str} - {title}"
                clean_name = clean_filename(raw_filename)
                final_mp3 = os.path.join(final_folder, clean_name + ".mp3")

                with self.lock:
                    self.state["current_index"] = idx
                    self.state["current_track"] = f"{artist_str} - {title}"
                    self.state["percent"] = int((idx / len(tracks)) * 100)

                # Hotcue-Schutz
                existing_file = song_file_exists(final_folder, clean_name)
                if existing_file:
                    self.add_log(f"[{idx}/{len(tracks)}] Existiert bereits -> Überspringe (Hotcue-Schutz): {clean_name}")
                    update_track_number(existing_file, idx)
                    with self.lock:
                        self.state["skipped_count"] += 1
                    continue

                self.add_log(f"[{idx}/{len(tracks)}] Lade herunter: {artist_str} - {title}...")

                ydl_opts = {
                    'format': 'bestaudio/best',
                    'outtmpl': os.path.join(temp_dir, f"{video_id}.%(ext)s"),
                    'postprocessors': [{
                        'key': 'FFmpegExtractAudio',
                        'preferredcodec': 'mp3',
                        'preferredquality': quality or '320',
                    }],
                    'nocheckcertificate': True,
                    'quiet': True,
                    'no_warnings': True,
                }

                temp_mp3 = os.path.join(temp_dir, f"{video_id}.mp3")
                if os.path.exists(temp_mp3):
                    try:
                        os.remove(temp_mp3)
                    except Exception:
                        pass

                try:
                    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                        ydl.download([f"https://www.youtube.com/watch?v={video_id}"])

                    if not os.path.exists(temp_mp3):
                        raise FileNotFoundError("Audio-Konvertierung fehlgeschlagen.")

                    tag_mp3_file(temp_mp3, artists, title, album=album, cover_url=cover_url, track_number=idx)
                    shutil.move(temp_mp3, final_mp3)
                    self.add_log(f"[{idx}/{len(tracks)}] Fertig: {clean_name}.mp3")
                    with self.lock:
                        self.state["success_count"] += 1
                except Exception as dl_err:
                    self.add_log(f"[{idx}/{len(tracks)}] Fehler bei '{title}': {dl_err}")
                    with self.lock:
                        self.state["failed_count"] += 1

            # Aufräumen
            try:
                shutil.rmtree(temp_dir)
            except Exception:
                pass

            self.add_log("Synchronisation vollständig abgeschlossen!")
            with self.lock:
                self.state["status"] = "completed"
                self.state["percent"] = 100

        except Exception as e:
            err_msg = str(e)
            self.add_log(f"FEHLER: {err_msg}")
            with self.lock:
                self.state["status"] = "error"
                self.state["error"] = err_msg

def scan_tracks_library(base_dir: str, custom_dest: str = None):
    """Scannt die Download-Ordner nach Audio-Dateien und liefert Metadaten."""
    if custom_dest and custom_dest.strip():
        dest = os.path.expandvars(custom_dest.strip())
        if not os.path.isabs(dest):
            dest = os.path.normpath(os.path.join(base_dir, dest))
    else:
        dest = os.path.normpath(os.path.join(base_dir, "..", "storage", "downloads"))

    if not os.path.exists(dest):
        return []

    tracks = []
    extensions = {'.mp3', '.m4a', '.wav', '.flac'}

    for root, _, files in os.walk(dest):
        for f in files:
            ext = os.path.splitext(f)[1].lower()
            if ext in extensions:
                full_path = os.path.join(root, f)
                rel_path = os.path.relpath(full_path, dest)
                track_id = hashlib.md5(full_path.encode('utf-8')).hexdigest()
                stat = os.stat(full_path)

                title = os.path.splitext(f)[0]
                artist = "Unbekannt"
                album = os.path.basename(root) if root != dest else "Downloads"
                duration = 0
                has_cover = False

                if ext == '.mp3':
                    try:
                        audio = MP3(full_path, ID3=ID3)
                        duration = int(audio.info.length) if audio.info else 0
                        if audio.tags:
                            if "TIT2" in audio.tags:
                                title = str(audio.tags["TIT2"])
                            if "TPE1" in audio.tags:
                                artist = str(audio.tags["TPE1"])
                            if "TALB" in audio.tags:
                                album = str(audio.tags["TALB"])
                            if "APIC:" in audio.tags or any(k.startswith("APIC") for k in audio.tags.keys()):
                                has_cover = True
                    except Exception:
                        pass

                tracks.append({
                    "id": track_id,
                    "title": title,
                    "artist": artist,
                    "album": album,
                    "duration": duration,
                    "size_mb": round(stat.st_size / (1024 * 1024), 2),
                    "file_path": full_path,
                    "filename": f,
                    "relative_path": rel_path,
                    "has_cover": has_cover,
                    "modified": int(stat.st_mtime)
                })

    # Sortiere nach Änderungsdatum absteigend (neueste zuerst)
    tracks.sort(key=lambda x: x["modified"], reverse=True)
    return tracks
