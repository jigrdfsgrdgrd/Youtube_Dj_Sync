"""
DJ Analytics Suite - v3.2 (Premium Glass UI)
Features: Full-screen responsive layout, Modern Glassmorphism, Premium Typography, Smooth Animations
"""

import flet as ft
import yt_dlp
import os
import threading
import time
import requests
import traceback
import socket # WLED UDP
import concurrent.futures
from mutagen.easyid3 import EasyID3
from mutagen.id3 import ID3, APIC, TKEY, TBPM, TIT2, TPE1, TALB
import math
from pathlib import Path
import random

# --- MONKEY PATCH FOR SCIPY >= 1.13 ---
# Must be applied BEFORE librosa is imported
try:
    import scipy.signal
    import scipy.signal.windows
    if not hasattr(scipy.signal, 'hann'):
        scipy.signal.hann = scipy.signal.windows.hann
    if not hasattr(scipy.signal, 'hanning'):
        scipy.signal.hanning = scipy.signal.windows.hann
    if not hasattr(scipy.signal, 'hamming'):
        scipy.signal.hamming = scipy.signal.windows.hamming
    if not hasattr(scipy.signal, 'bartlett'):
        scipy.signal.bartlett = scipy.signal.windows.bartlett
    if not hasattr(scipy.signal, 'blackman'):
        scipy.signal.blackman = scipy.signal.windows.blackman
    print("Scipy Compatibility Patch: APPLIED")
except Exception as e: 
    print(f"Scipy Compatibility Patch: SKIPPED ({e})")
# --------------------------------------

# Audio Analysis check
try:
    import librosa
    import numpy as np
    ANALYSIS_AVAILABLE = True
    print("Audio Analysis Module (Librosa): ONLINE")
except ImportError as e:
    ANALYSIS_AVAILABLE = False
    print(f"Audio Analysis Module (Librosa): OFFLINE ({e})")

class FileItem(ft.Container):
    """File item with Premium Glass visuals"""
    def __init__(self, name, path, is_folder, bpm=None, key=None, on_click=None, on_play=None, delay=0):
        super().__init__()
        self.path = path
        self.is_folder = is_folder
        self.on_click_handler = on_click
        self.on_play_handler = on_play
        self.bpm = str(bpm) if bpm else "?"
        self.key = str(key) if key else "?"
        
        # Premium Glass Style
        self.padding = ft.padding.symmetric(horizontal=20, vertical=16)
        self.border_radius = 16
        # Subtle gradient background for depth
        self.gradient = ft.LinearGradient(
            begin=ft.alignment.top_left,
            end=ft.alignment.bottom_right,
            colors=[
                ft.colors.with_opacity(0.08, ft.colors.WHITE),
                ft.colors.with_opacity(0.03, ft.colors.WHITE),
            ]
        )
        self.blur = ft.Blur(10, 10, ft.BlurTileMode.MIRROR)
        self.border = ft.border.all(1, ft.colors.with_opacity(0.1, ft.colors.WHITE))
        self.animate = ft.Animation(300, "easeOutCubic")
        self.animate_scale = ft.Animation(300, "easeOutBack")
        
        # Entrance Animation
        self.opacity = 0
        self.offset = ft.transform.Offset(0, 0.5)
        self.animate_opacity = ft.Animation(600 + delay, "easeOut")
        self.animate_offset = ft.Animation(600 + delay, "easeOutQuart")
        
        self.on_hover = self.hover
        self.on_click = lambda _: self.on_click_handler(self.path) if self.on_click_handler else None

        # Icon & Typography
        icon_color = "#ffd700" if is_folder else "#FFFFFFFF" 
        if not is_folder: icon_color = "#F0F0F0"
            
        icon = ft.Icon(
            ft.Icons.FOLDER_ROUNDED if is_folder else ft.Icons.MUSIC_NOTE_ROUNDED, 
            color=icon_color, 
            size=24,
            opacity=0.9
        )
        
        meta_controls = []
        if not is_folder:
            # Modern badges
            badge_style = {
                "size": 10, "weight": "bold", "font_family": "SpaceGrotesk"
            }
            if self.bpm != "?":
                meta_controls.append(
                    ft.Container(
                        content=ft.Text(f"{self.bpm} BPM", **badge_style, color="#09090b"), 
                        bgcolor="#00f3ff", padding=ft.padding.symmetric(6, 8), border_radius=8,
                        shadow=ft.BoxShadow(blur_radius=8, color=ft.colors.with_opacity(0.4, "#00f3ff"))
                    )
                )
            if self.key != "?":
                meta_controls.append(
                    ft.Container(
                        content=ft.Text(f"{self.key}", **badge_style, color="white"), 
                        bgcolor="#ff0080", padding=ft.padding.symmetric(6, 8), border_radius=8,
                        shadow=ft.BoxShadow(blur_radius=8, color=ft.colors.with_opacity(0.4, "#ff0080"))
                    )
                )

        self.content = ft.Row([
            ft.Row([
                ft.Container(
                    content=icon, 
                    shadow=ft.BoxShadow(blur_radius=10, color=ft.colors.with_opacity(0.2, icon_color)) if is_folder else None
                ), 
                ft.Text(name, size=15, weight="w500", font_family="Outfit", color="white", width=450, no_wrap=True, overflow="ellipsis")
            ], spacing=20),
            ft.Row(meta_controls, spacing=10),
            ft.IconButton(
                ft.Icons.PLAY_ARROW_ROUNDED, 
                icon_color="white", 
                icon_size=24, 
                style=ft.ButtonStyle(bgcolor=ft.colors.with_opacity(0.1, "white"), shape=ft.CircleBorder()),
                visible=not is_folder, 
                on_click=lambda e: self.on_play_handler(self.path)
            ) if not is_folder else ft.Container()
        ], alignment="spaceBetween")

    def did_mount(self):
        self.opacity = 1
        self.offset = ft.transform.Offset(0, 0)
        self.update()

    def hover(self, e):
        is_hover = e.data == "true"
        self.bgcolor = ft.colors.with_opacity(0.12 if is_hover else 0.0, ft.colors.WHITE) 
        self.border = ft.border.all(1, ft.colors.with_opacity(0.4 if is_hover else 0.1, ft.colors.WHITE))
        self.scale = 1.01 if is_hover else 1.0
        self.shadow = ft.BoxShadow(blur_radius=15, color=ft.colors.with_opacity(0.1, "#00f3ff")) if is_hover else None
        self.update()

    def set_match_state(self, is_bpm_match, is_key_match):
        """Updates visuals based on DJ compatibility"""
        if is_bpm_match or is_key_match:
            self.bgcolor = ft.colors.with_opacity(0.1, "#00ff80" if is_bpm_match else "#a020f0")
            self.border = ft.border.all(1, "#00ff80" if is_bpm_match else "#a020f0")
            
            # Add dynamic badges if not present
            badge_content = []
            if is_bpm_match: badge_content.append(ft.Container(content=ft.Text("BPM SYNC", size=9, weight="bold", color="black"), bgcolor="#00ff80", padding=4, border_radius=4))
            if is_key_match: badge_content.append(ft.Container(content=ft.Text("HARMONIC", size=9, weight="bold", color="white"), bgcolor="#a020f0", padding=4, border_radius=4))
            
            # We inject these badges into the existing structure (a bit hacky but efficient)
            # Find the row with meta controls (index 1 in main content row)
            if len(self.content.controls) > 1 and isinstance(self.content.controls[1], ft.Row):
                 self.content.controls[1].controls.extend(badge_content)
        else:
             # Reset
             self.bgcolor = ft.colors.with_opacity(0.00, ft.colors.WHITE)
             self.border = ft.border.all(1, ft.colors.with_opacity(0.1, ft.colors.WHITE))
             
             # Clean up badges (remove if > 2, assuming 2 original badges)
             # Simplification: just reset text if needed, but for now we rely on re-scan mostly. 
             # Ideally we should store references to temporary badges.
        self.update()

class DJSuiteApp:
    def __init__(self, page: ft.Page):
        self.page = page
        self.setup_page()
        
        # Audio
        self.audio_player = ft.Audio(src="dummy.mp3", autoplay=False, volume=1.0, on_position_changed=self.on_pos_change)
        self.page.overlay.append(self.audio_player)
        self.folder_picker = ft.FilePicker(on_result=self.folder_picked)
        self.page.overlay.append(self.folder_picker)
        
        # Recommendation Engine
        # Recommendation Engine
        self.reco_engine = RecommendationEngine(self)

        # WLED Client
        self.wled_client = WLEDClient()
        
        # State
        self.current_library_path = str(Path.home() / "Music" / "DJ-Library")
        self.root_library_path = self.current_library_path
        self.root_library_path = self.current_library_path
        self.pulsing = False
        self.is_playing = False
        
        # DJ State
        self.current_bpm = 0
        self.current_key = None
        self.beat_counter = 0 # Track beats for phrasing
        self.speed_label_ref = ft.Ref()
        self.fs_play_btn_ref = ft.Ref()
        
        self.build_ui()
        self.navigate_to(self.current_library_path)

    def setup_page(self):
        self.page.title = "DJ Suite Pro v3.2"
        self.page.theme_mode = ft.ThemeMode.DARK
        self.page.bgcolor = "#050508"
        self.page.padding = 0
        self.page.window.width = 1260
        self.page.window.height = 950
        
        # Load Premium Fonts
        self.page.fonts = {
            "Outfit": "https://fonts.gstatic.com/s/outfit/v11/QGYyz_MVcBeNP4NjuGObqx1XmO1I.woff2",
            "SpaceGrotesk": "https://fonts.gstatic.com/s/spacegrotesk/v16/V8mQoQDjQSkFtoMM3T6r8E7mF71Q-gOoraIAEj7oLXsk.woff2"
        }
        self.page.theme = ft.Theme(font_family="Outfit")

        # Atmospheric Background
        self.bg_glow_1 = ft.Container(
            width=800, height=800, bgcolor="#ff0080", 
            border_radius=400,
            opacity=0.15, left=-200, top=-200,
            shadow=ft.BoxShadow(blur_radius=200, color="#ff0080", spread_radius=50)
        )
        self.bg_glow_2 = ft.Container(
            width=700, height=700, bgcolor="#00f3ff", 
            border_radius=350,
            opacity=0.1, right=-150, bottom=-150,
             shadow=ft.BoxShadow(blur_radius=200, color="#00f3ff", spread_radius=50)
        )

    # --- Actions ---
    def play_track(self, path):
        try:
            self.audio_player.src = path
            self.audio_player.autoplay = True
            self.audio_player.update()
            self.is_playing = True
            
            # Reset Play/Pause button to Pause state since we are auto-playing
            self.play_pause_btn.icon = ft.Icons.PAUSE_CIRCLE_FILLED_ROUNDED
            self.play_pause_btn.update()
            
            self.player_track_name.value = os.path.basename(path).replace(".mp3", "")
            
            # Extract BPM/Key from file for Smart Match
            try:
                tags = ID3(path)
                bpm = tags.get("TBPM")
                key = tags.get("TKEY")
                self.current_bpm = int(float(bpm.text[0])) if bpm else 0
                self.current_key = key.text[0] if key else None
                
                # Trigger Library Update
                self.update_smart_matches()
                
                # Update Lightshow State
                self.wled_client.update_state(self.current_key)
            except: 
                self.current_bpm = 0
                self.current_key = None
                
            self.player_bar.offset = ft.transform.Offset(0, 0)
            self.player_bar.opacity = 1
            self.player_bar.update()
            
            # Start Analysis for Perfect Sync
            self.current_beat_grid = []
            self.beat_index_cursor = 0
            threading.Thread(target=self.calculate_beat_grid, args=(path,), daemon=True).start()

            self.pulsing = True
            threading.Thread(target=self.pulse_worker, daemon=True).start()
        except: pass

    def calculate_beat_grid(self, path):
        """Analyzes track to find EXACT timestamps of beats"""
        try:
            # Thread-Local Scipy Patch
            try:
                 import scipy.signal
                 import scipy.signal.windows
                 if not hasattr(scipy.signal, 'hann'): scipy.signal.hann = scipy.signal.windows.hann
                 if not hasattr(scipy.signal, 'hanning'): scipy.signal.hanning = scipy.signal.windows.hann
                 if not hasattr(scipy.signal, 'hamming'): scipy.signal.hamming = scipy.signal.windows.hamming
                 if not hasattr(scipy.signal, 'bartlett'): scipy.signal.bartlett = scipy.signal.windows.bartlett
                 if not hasattr(scipy.signal, 'blackman'): scipy.signal.blackman = scipy.signal.windows.blackman
            except: pass
            
            import librosa
            print(f"Generating Beat Grid for {os.path.basename(path)}...")
            
            # Load audio (lightweight if possible, or full)
            # Duration=None loads full file. For speed we could limit, but for sync we need full.
            y, sr = librosa.load(path, sr=22050) 
            
            # Extract Beat Frames
            tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr)
            
            # --- DROP DETECTION (Energy Based) ---
            rms = librosa.feature.rms(y=y)[0]
            times = librosa.times_like(rms, sr=sr)
            avg_rms = np.mean(rms)
            drop_threshold = avg_rms * 1.3 
            
            self.drop_mask = (rms > drop_threshold)
            self.drop_times = times
            # -------------------------------------

            # --- FULL SPECTRUM ANALYSIS (LedFX Style) ---
            # 1. Mel Spectrogram (Human hearing simulation)
            # We want frequent updates (hop_length=512 is ~43fps at 22050Hz)
            hop_length = 512
            S = librosa.feature.melspectrogram(y=y, sr=sr, n_mels=6, fmax=8000, hop_length=hop_length)
            S_dB = librosa.power_to_db(S, ref=np.max)
            
            # 2. Compress to 3 Bands: Low(Bass), Mid, High
            # S is shape (6, Time)
            # Band 0-1: Bass, 2-3: Mids, 4-5: Highs
            self.spec_bass = np.mean(S_dB[0:2, :], axis=0)
            self.spec_mid = np.mean(S_dB[2:4, :], axis=0)
            self.spec_high = np.mean(S_dB[4:6, :], axis=0)
            
            # Normalize signals to 0.0 - 1.0 range (approx)
            # dB usually -80 to 0. We map -40 to 0 -> 0.0 to 1.0
            def norm_band(b):
                b = (b + 40) / 40
                return np.clip(b, 0, 1)

            self.spec_bass = norm_band(self.spec_bass)
            self.spec_mid = norm_band(self.spec_mid)
            self.spec_high = norm_band(self.spec_high)
            
            self.spec_times = librosa.frames_to_time(np.arange(S.shape[1]), sr=sr, hop_length=hop_length)
            print(f"Spectrum Analysis Complete: {len(self.spec_times)} frames.")
            # --------------------------------------------
            
            # Convert to Timestamps
            self.current_beat_grid = librosa.frames_to_time(beat_frames, sr=sr)
            self.beat_index_cursor = 0 
            
            print(f"Beat Grid Ready. Drop Logic Active. Full Spectrum Active.")
            self.current_bpm = int(tempo) 
            
        except Exception as e:
            print(f"Beat Grid Failed: {e}")
            self.current_beat_grid = []

    def pulse_worker(self):
        last_frame_time = time.time()
        
        while self.pulsing:
            try:
                loop_start = time.time()
                
                # --- AUDIO / LIGHT SYNC ENGINE ---
                bass_val = 0.0
                high_val = 0.0
                is_drop = False
                
                # Get Spectrum & Drop Data if Playing
                if self.is_playing and hasattr(self, 'current_beat_grid'):
                    try:
                        pos_ms = self.audio_player.get_current_position()
                        if pos_ms is not None:
                            pos_sec = pos_ms / 1000.0
                            
                            # 1. Spectrum Lookup
                            if hasattr(self, 'spec_times') and hasattr(self, 'spec_bass'):
                                s_idx = np.searchsorted(self.spec_times, pos_sec)
                                if s_idx < len(self.spec_bass):
                                    bass_val = self.spec_bass[s_idx]
                                    high_val = self.spec_high[s_idx]
                            
                            # 2. Drop Lookup
                            if hasattr(self, 'drop_mask') and hasattr(self, 'drop_times'):
                                d_idx = np.searchsorted(self.drop_times, pos_sec)
                                if d_idx < len(self.drop_mask):
                                    is_drop = self.drop_mask[d_idx]
                                    
                            # 3. Beat Trigger
                            if len(self.current_beat_grid) > 0 and self.beat_index_cursor < len(self.current_beat_grid):
                                next_beat_time = self.current_beat_grid[self.beat_index_cursor]
                                if pos_sec >= next_beat_time:
                                    self.beat_index_cursor += 1
                                    self.beat_counter += 1
                                    self.wled_client.beat(self.beat_counter, strobe=True, is_drop=is_drop)
                                    # Catchup
                                    while self.beat_index_cursor < len(self.current_beat_grid) and \
                                          pos_sec > self.current_beat_grid[self.beat_index_cursor]:
                                          self.beat_index_cursor += 1

                    except Exception as e: pass

                # Fallback if no specific beat grid but playing (Basic Timer)
                elif self.is_playing and self.current_bpm > 40:
                    if not hasattr(self, 'beat_timer'): self.beat_timer = time.time()
                    if time.time() - self.beat_timer >= (60/self.current_bpm):
                         self.beat_timer = time.time()
                         self.beat_counter += 1
                         self.wled_client.beat(self.beat_counter, strobe=True, is_drop=False)
                
                # --- RENDER FRAME ---
                # Update Physics & Send UDP (Limit to ~30 FPS for Network Specs)
                if loop_start - last_frame_time > 0.030:
                    self.wled_client.tick(bass=bass_val, high=high_val)
                    last_frame_time = loop_start
                    
                    # Update UI Visualizer (Low Priority)
                    for bar in self.visualizer_bars: 
                        target_h = 10 + int(bass_val * 40) if bass_val > 0 else random.randint(10, 30)
                        bar.height = target_h
                    self.visualizer_row.update()
                
                # Prevent CPU spin
                time.sleep(0.005)
                
            except Exception as e:
                 print(f"Loop Error: {e}")
                 break

    def stop_track(self, e):
        self.audio_player.pause()
        self.pulsing = False
        self.is_playing = False
        self.current_bpm = 0 # Reset smart match
        self.update_smart_matches()
        
        self.player_bar.offset = ft.transform.Offset(0, 1.2)
        self.player_bar.opacity = 0
        self.player_bar.update()

    def set_volume(self, e):
        self.audio_player.volume = e.control.value
        self.audio_player.update()
        # Update icon based on volume
        if e.control.value == 0: self.vol_icon.name = ft.Icons.VOLUME_MUTE
        elif e.control.value < 0.5: self.vol_icon.name = ft.Icons.VOLUME_DOWN
        else: self.vol_icon.name = ft.Icons.VOLUME_UP
        self.vol_icon.update()

    def set_speed(self, e):
        """Pro DJ Pitch Control"""
        speed = e.control.value
        self.audio_player.playback_rate = speed
        self.audio_player.update()
        self.speed_label.value = f"PITCH: {int((speed-1)*100)}%"
        self.speed_label.color = "#00ff80" if speed != 1.0 else "grey"
        self.speed_label.update()

    def update_smart_matches(self):
        """Highlights tracks with compatible BPM/Key"""
        for control in self.library_list.controls:
             if isinstance(control, FileItem) and not control.is_folder:
                 is_bpm = False
                 is_key = False
                 
                 # BPM Match logic (+/- 8%)
                 if self.current_bpm > 0 and control.bpm != "?":
                     try:
                         track_bpm = float(control.bpm)
                         diff = abs(track_bpm - self.current_bpm)
                         if diff / self.current_bpm <= 0.08: is_bpm = True
                     except: pass
                 
                 # Simple Key Match (Same Root) - could be expanded to Camelot
                 if self.current_key and control.key != "?" and control.key == self.current_key:
                     is_key = True
                 
                 control.set_match_state(is_bpm, is_key)

    def folder_picked(self, e):
        if e.path:
            self.folder_path_txt.value = e.path
            self.folder_path_txt.update()
            self.navigate_to(e.path)

    def navigate_to(self, path):
        if not os.path.exists(path):
            try: 
                os.makedirs(path)
            except: 
                pass
        self.current_library_path = path
        threading.Thread(target=self.scan_folder, args=(path,), daemon=True).start()

    def scan_folder(self, path):
        self.library_loading.visible = True; self.library_loading.update()
        self.library_list.controls.clear()
        self.library_path_text.value = path; self.library_path_text.update()

        items = []
        try:
            if path != self.root_library_path:
                 back_btn = ft.Container(
                     content=ft.Row([ft.Icon(ft.Icons.ARROW_BACK_ROUNDED, color="#00f3ff"), ft.Text("GO BACK", color="#00f3ff", weight="bold")]), 
                     on_click=lambda _: self.navigate_to(os.path.dirname(path)),
                     padding=15, border_radius=12, bgcolor=ft.colors.with_opacity(0.05, "#00f3ff"),
                     ink=True
                 )
                 self.library_list.controls.append(back_btn)

            with os.scandir(path) as it:
                entries = sorted(list(it), key=lambda e: (not e.is_dir(), e.name.lower()))
                delay_counter = 0
                for entry in entries:
                    if entry.name.startswith('.'): continue
                    delay = min(delay_counter * 30, 600)
                    
                    if entry.is_dir():
                        items.append(FileItem(entry.name, entry.path, True, on_click=self.navigate_to, delay=delay))
                    elif entry.name.lower().endswith('.mp3'):
                        bpm, key = "?", "?"
                        try:
                            # Basic check to avoid reading everything if not needed, but we read ID3 for display
                            audio = ID3(entry.path)
                            tkey = audio.get("TKEY"); tbpm = audio.get("TBPM")
                            if tkey: key = tkey.text[0]
                            if tbpm: bpm = tbpm.text[0]
                        except: pass
                        items.append(FileItem(entry.name, entry.path, False, bpm, key, on_play=self.play_track, delay=delay))
                    delay_counter += 1
        except: pass

        if not items: self.library_list.controls.append(ft.Container(content=ft.Text("This folder is empty.", color="grey", size=16), alignment=ft.alignment.center, padding=50))
        else: self.library_list.controls.extend(items)
        
        self.library_loading.visible = False; self.library_loading.update(); self.library_list.update()

    def start_download_thread(self, e):
        url = self.url_input.value
        folder = self.folder_path_txt.value
        if not url: return

        self.start_btn.disabled = True; self.start_btn.opacity = 0.5
        self.start_btn.content = ft.Row([ft.ProgressRing(width=20, height=20, stroke_width=2, color="white"), ft.Text("IGNITION...", color="white", weight="bold")], alignment="center")
        self.start_btn.update()
        self.log_list.controls.clear()
        
        def run():
            try:
                self.add_log("Connecting to Neural Net...", "#00f3ff")
                with yt_dlp.YoutubeDL({'quiet':True, 'extract_flat':True}) as ydl: info = ydl.extract_info(url, download=False)
                
                pl_title = info.get('title','Playlist'); entries = info.get('entries', [info])
                target = os.path.join(folder, "".join([c for c in pl_title if c.isalnum() or c in " .-_"]))
                os.makedirs(target, exist_ok=True)
                
                self.add_log(f"Target locked: {target}", "white")
                self.add_log(f"Queued {len(entries)} tracks.", "white")
                
                with concurrent.futures.ThreadPoolExecutor(max_workers=3) as ex:
                    futures = [ex.submit(self.process_track, x, target, self.quality_dropdown.value, pl_title) for x in entries if x]
                    done = 0
                    for f in concurrent.futures.as_completed(futures):
                        res = f.result()
                        done += 1
                        val = done/len(entries)
                        self.pg_bar.value = val; self.pg_text.value = f"{int(val*100)}%"; self.page.update()
                        
                        if res and 'error' not in res: 
                            self.add_log(f"IMPORTED: {res['name']}", "#00ff80")
                        elif res and 'error' in res:
                            self.add_log(f"FAILED: {res['name']} ({res['error'][:30]}...)", "#ff3333")
                        else:
                            self.add_log(f"FAILED: Unknown error", "#ff3333")

                self.add_log("MISSION ACCOMPLISHED", "#00ff80")
                if self.current_library_path == self.root_library_path: self.navigate_to(self.root_library_path)
            except Exception as e: self.add_log(f"ERR: {e}", "#ff0080")
            finally: 
                self.start_btn.disabled = False
                self.start_btn.opacity = 1
                self.start_btn.content = ft.Text("INITIALIZE DOWNLOAD", size=15, weight="bold", font_family="SpaceGrotesk")
                self.start_btn.update()

        threading.Thread(target=run, daemon=True).start()

    def process_track(self, entry, folder, quality, pl_title):
        try:
            title = entry.get('title', 'Unknown')
            safe_title = "".join([c for c in title if c.isalnum() or c in " .-_"])
            path = os.path.join(folder, f"{safe_title}.mp3")
            
            # self.add_log(f"Processing: {title[:20]}...", "grey") # Avoid spamming main log from thread directly if possible, or use thread-safe method
            
            if not os.path.exists(path):
                opts = {
                    'format':'bestaudio/best', 
                    'outtmpl':os.path.join(folder,f'{safe_title}.%(ext)s'), 
                    'postprocessors':[{'key':'FFmpegExtractAudio','preferredcodec':'mp3','preferredquality':quality}], 
                    'quiet':True,
                    'no_warnings': True
                }
                try:
                    with yt_dlp.YoutubeDL(opts) as ydl: ydl.extract_info(entry['url'])
                except Exception as e:
                    print(f"DL Error {title}: {e}")
                    return {'error': str(e), 'name': title}
            
            bpm, key = 0, "?"
            self.add_log(f"DBG: Sw={self.bpm_switch.value} lib={ANALYSIS_AVAILABLE}", "grey")
            
            if self.bpm_switch.value:
                # --- THREAD-LOCAL PATCH ---
                try:
                    import scipy.signal
                    import scipy.signal.windows
                    if not hasattr(scipy.signal, 'hann'): scipy.signal.hann = scipy.signal.windows.hann
                    if not hasattr(scipy.signal, 'hanning'): scipy.signal.hanning = scipy.signal.windows.hann
                    if not hasattr(scipy.signal, 'hamming'): scipy.signal.hamming = scipy.signal.windows.hamming
                    if not hasattr(scipy.signal, 'bartlett'): scipy.signal.bartlett = scipy.signal.windows.bartlett
                    if not hasattr(scipy.signal, 'blackman'): scipy.signal.blackman = scipy.signal.windows.blackman
                except: pass
                # --------------------------

                if not ANALYSIS_AVAILABLE:
                     self.add_log(f"SKIP ANALYSIS: Librosa missing", "yellow")
                else: 
                     try:
                        # self.add_log(f"Analyzing {safe_title}...", "blue") # Optional, might spam
                        # Load 45s from 10s mark to speed up
                        y, sr = librosa.load(path, offset=10, duration=45)
                        
                        # BPM
                        tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
                        bpm = int(round(tempo if np.isscalar(tempo) else tempo[0]))
                        
                        # Key
                        chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
                        key_idx = np.argmax(np.sum(chroma, axis=1))
                        key = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'][key_idx]
                        
                        # self.add_log(f" > BPM: {bpm} | Key: {key}", "cyan")
                     except Exception as e: 
                        self.add_log(f"FAIL: {e}", "red") # Full error
                        print(f"Analysis Failed for {safe_title}: {e}")
            
            if self.tag_switch.value:
                try: 
                    try: a = ID3(path)
                    except: a = ID3()
                    a.add(TIT2(encoding=3, text=title))
                    a.add(TPE1(encoding=3, text=entry.get('uploader','Unknown')))
                    a.add(TALB(encoding=3, text=pl_title))
                    if bpm: a.add(TBPM(encoding=3, text=str(bpm)))
                    if key: a.add(TKEY(encoding=3, text=key))
                    a.save(path, v2_version=3)
                except: pass
            return {'name': safe_title}
        except: return None

    def add_log(self, t, c):
        self.log_list.controls.insert(0, ft.Text(f"> {t}", color=c, font_family="SpaceGrotesk", size=13))
        self.log_list.update()

    # --- UI Building ---
    def build_ui(self):
        # Styled Controls
        self.url_input = ft.TextField(
            label="YOUTUBE PLAYLIST URL", 
            label_style=ft.TextStyle(color="#00f3ff", size=11, weight="bold", font_family="SpaceGrotesk"),
            text_style=ft.TextStyle(color="white", size=14, font_family="Outfit"),
            border_width=0, bgcolor=ft.colors.with_opacity(0.08, "white"), border_radius=12,
            prefix_icon=ft.Icons.LINK, prefix_style=ft.TextStyle(color="#00f3ff"),
            focused_bgcolor=ft.colors.with_opacity(0.12, "white"), selection_color="#ff0080"
        )
        self.folder_path_txt = ft.TextField(
            value=self.current_library_path, read_only=True, expand=True, text_size=12, 
            border_color="transparent", bgcolor=ft.colors.with_opacity(0.3, "#09090b"), border_radius=8
        )
        self.quality_dropdown = ft.Dropdown(
            value="320", 
            options=[ft.dropdown.Option("320"), ft.dropdown.Option("128")], 
            width=100, border_radius=8, bgcolor="#1a1a25", border_color="transparent", text_size=14
        )
        self.bpm_switch = ft.Switch(label="Analyze BPM/Key", value=ANALYSIS_AVAILABLE, active_color="#ff0080")
        self.tag_switch = ft.Switch(label="Write ID3 Tags", value=True, active_color="#00f3ff")
        
        self.start_btn = ft.Container(
            content=ft.Text("INITIALIZE DOWNLOAD", size=15, weight="bold", font_family="SpaceGrotesk"),
            alignment=ft.alignment.center, height=65, border_radius=16,
            gradient=ft.LinearGradient(colors=["#ff0080", "#9d00ff"], begin=ft.alignment.top_left, end=ft.alignment.bottom_right),
            shadow=ft.BoxShadow(blur_radius=20, color=ft.colors.with_opacity(0.5, "#ff0080")),
            on_click=self.start_download_thread, animate_scale=ft.Animation(100),
            on_hover=lambda e: self.animate_btn(e, self.start_btn)
        )

        self.pg_bar = ft.ProgressBar(value=0, color="#00f3ff", bgcolor="#333344", height=6, border_radius=ft.border_radius.all(3))
        self.pg_text = ft.Text("SYSTEM READY", color="#00f3ff", size=10, weight="bold", font_family="SpaceGrotesk")
        self.log_list = ft.ListView(expand=True, spacing=6, padding=10)
        
        self.library_list = ft.ListView(expand=True, spacing=12, padding=30)
        self.library_loading = ft.ProgressBar(color="#ff0080", bgcolor="transparent", visible=False)
        self.library_path_text = ft.Text("Scanning...", color="grey", italic=True, size=13, font_family="SpaceGrotesk")

        # Engine View
        engine_view = ft.Container(
            padding=35,
            content=ft.Row([
                # Left Panel: Controls
                ft.Container(
                    expand=5,
                    content=ft.Column([
                        ft.Text("SOURCE", size=11, weight="bold", color="grey", font_family="SpaceGrotesk"),
                        self.url_input,
                        ft.Container(height=25),
                        ft.Text("DESTINATION", size=11, weight="bold", color="grey", font_family="SpaceGrotesk"),
                        ft.Row([self.folder_path_txt, ft.IconButton(ft.Icons.FOLDER_OPEN_ROUNDED, icon_color="#ff0080", bgcolor=ft.colors.with_opacity(0.1,"white"), on_click=lambda _: self.folder_picker.get_directory_path())]),
                        ft.Container(height=25),
                        ft.Text("PROCESSING MODULES", size=11, weight="bold", color="grey", font_family="SpaceGrotesk"),
                        ft.Container(
                            padding=20, border_radius=16, bgcolor=ft.colors.with_opacity(0.04,"white"),
                            border=ft.border.all(1, ft.colors.with_opacity(0.05,"white")),
                            content=ft.Row([
                                ft.Row([ft.Text("Quality", color="grey", size=12), self.quality_dropdown], alignment="center"),
                                self.bpm_switch, 
                                self.tag_switch
                            ], alignment="spaceBetween", wrap=True)
                        ),
                        ft.Container(expand=True),
                        self.start_btn
                    ])
                ),
                ft.VerticalDivider(width=80, color="transparent"),
                # Right Panel: Terminal/Logs
                ft.Container(
                    expand=6,
                    border_radius=24, bgcolor=ft.colors.with_opacity(0.4, "#000000"),
                    blur=(25, 25),
                    border=ft.border.all(1, ft.colors.with_opacity(0.1, "white")),
                    padding=25,
                    content=ft.Column([
                        ft.Row([
                            ft.Icon(ft.Icons.TERMINAL_ROUNDED, color="#00f3ff"), 
                            ft.Text("SYSTEM LOG", weight="bold", color="white", font_family="SpaceGrotesk"), 
                            ft.Container(expand=True), 
                            self.pg_text
                        ]),
                        ft.Divider(height=20, color="transparent"),
                        self.pg_bar,
                        ft.Divider(height=20, color=ft.colors.with_opacity(0.1, "white")),
                        self.log_list
                    ])
                )
            ], expand=True)
        )

        # Library View
        library_view = ft.Column([
            ft.Container(
                padding=ft.padding.symmetric(horizontal=40, vertical=20), 
                gradient=ft.LinearGradient(colors=[ft.colors.with_opacity(0.8, "#050508"), ft.colors.with_opacity(0, "#050508")], begin=ft.alignment.top_center, end=ft.alignment.bottom_center),
                content=ft.Row([
                    ft.Icon(ft.Icons.LIBRARY_MUSIC_ROUNDED, color="#ff0080", size=28), 
                    self.library_path_text, 
                    ft.Container(expand=True), 
                    self.library_loading
                ])
            ),
            ft.Container(content=self.library_list, expand=True)
        ], expand=True, spacing=0)

        # Tabs
        self.tabs = ft.Tabs(
            selected_index=0, animation_duration=400, 
            indicator_color="#00f3ff", indicator_border_radius=4, 
            indicator_padding=10, divider_color="transparent",
            label_color="white", unselected_label_color="#666666",
            tabs=[
                ft.Tab(
                    tab_content=ft.Container(
                        content=ft.Row([ft.Icon(ft.Icons.MEMORY), ft.Text("ENGINE CORE", font_family="SpaceGrotesk", weight="bold")], spacing=10),
                        padding=ft.padding.only(bottom=15)
                    ),
                    content=engine_view
                ), 
                ft.Tab(
                    tab_content=ft.Container(
                        content=ft.Row([ft.Icon(ft.Icons.GRID_VIEW_ROUNDED), ft.Text("MEDIA LIBRARY", font_family="SpaceGrotesk", weight="bold")], spacing=10),
                        padding=ft.padding.only(bottom=15)
                    ),
                    content=library_view
                ),
            ], expand=True
        )

        # Sticky Player Bar
        self.visualizer_bars = [
            ft.Container(width=4, height=10, bgcolor="#00f3ff", border_radius=2, animate=ft.Animation(100, "linear")) for _ in range(4)
        ]
        self.visualizer_row = ft.Row(self.visualizer_bars, spacing=2, alignment="end", height=30)
        
        self.player_track_name = ft.Text("Waiting for track...", weight="bold", color="white", size=15, font_family="Outfit")
        self.vol_icon = ft.Icon(ft.Icons.VOLUME_UP_ROUNDED, size=18, color="#888888")
        self.speed_label = ft.Text("PITCH: 0%", size=9, weight="bold", color="grey") # Helper ref
        # ...existing play button...
        self.play_pause_btn = ft.IconButton(
            ft.Icons.PAUSE_CIRCLE_FILLED_ROUNDED, icon_color="white", icon_size=48, 
            on_click=self.toggle_pause,
            style=ft.ButtonStyle(shadow_color=ft.colors.with_opacity(0.5, "#00f3ff"))
        )
        
        self.player_bar = ft.Container(
            offset=ft.transform.Offset(0, 1.5), opacity=0, visible=True,
            animate_offset=ft.Animation(500, "elasticOut"), animate_opacity=ft.Animation(300),
            left=30, right=30, bottom=30, height=90,
            padding=ft.padding.symmetric(horizontal=35), border_radius=20,
            bgcolor=ft.colors.with_opacity(0.85, "#12121f"),
            blur=ft.Blur(20, 20),
            border=ft.border.all(1, ft.colors.with_opacity(0.15, "#00f3ff")),
            shadow=ft.BoxShadow(blur_radius=50, color=ft.colors.with_opacity(0.5, "black")),
            content=ft.Row([
                ft.Row([
                    ft.Container(
                        content=ft.Icon(ft.Icons.ALBUM, color="#ff0080", size=35),
                        shadow=ft.BoxShadow(blur_radius=15, color=ft.colors.with_opacity(0.4, "#ff0080"))
                    ),
                    ft.Column([
                         ft.Text("NOW PLAYING", size=10, color="#00f3ff", weight="bold", font_family="SpaceGrotesk"),
                         self.player_track_name
                    ], spacing=2, alignment="center")
                ], spacing=20),
                
                # Center Controls
                ft.Row([
                    ft.IconButton(ft.Icons.STOP_CIRCLE_OUTLINED, icon_color="#ff3333", icon_size=28, on_click=self.stop_track, tooltip="Stop"),
                    ft.Container(width=10),
                    self.play_pause_btn,
                ], alignment="center"),

                # Right Controls
                ft.Row([
                    self.visualizer_row,
                    ft.Container(width=15),
                    
                    # Pitch Control
                    ft.Column([
                         ft.Text("TEMPO", size=9, weight="bold", color="grey", ref=self.speed_label_ref),
                         ft.Slider(min=0.8, max=1.2, value=1.0, width=100, active_color="#00ff80", thumb_color="white", on_change=self.set_speed, divisions=20, label="{value}x"),
                    ], spacing=0, alignment="center"),
                    
                    ft.Container(width=10),
                    self.vol_icon,
                    ft.Slider(min=0, max=1, value=1, width=100, active_color="#ff0080", thumb_color="white", on_change=self.set_volume),
                ], alignment="center")
            ], alignment="spaceBetween")
        )


        # Fullscreen Player Overlay
        self.fs_player = FullscreenPlayer(self)
        
        # Assemble Main View
        self.page.add(
            ft.Stack([
                # 1. Background Layers
                ft.Container(expand=True, bgcolor="#050508"), # Fallback
                self.bg_glow_1,
                self.bg_glow_2,
                ft.Container(expand=True, blur=ft.Blur(80, 80)), # Mesh blurs
                
                # 2. Main Content
                ft.Column([
                    ft.Container(
                        padding=ft.padding.symmetric(horizontal=40, vertical=25),
                        content=ft.Row([
                            ft.Icon(ft.Icons.DIAMOND_ROUNDED, size=28, color="#00f3ff"),
                            ft.Text("DJ SUITE PRO", size=22, weight="bold", font_family="SpaceGrotesk", color="white"),
                            ft.Container(
                                padding=ft.padding.symmetric(horizontal=8, vertical=4), 
                                bgcolor=ft.colors.with_opacity(0.2, "#ff0080"), border_radius=6, 
                                border=ft.border.all(1, "#ff0080"),
                                content=ft.Text("V3.2 FX", size=10, weight="bold", color="#ff0080", font_family="SpaceGrotesk")
                            ),
                            ft.Container(expand=True),
                            ft.IconButton(ft.Icons.FULLSCREEN_ROUNDED, icon_color="white", tooltip="Zen Mode", on_click=self.open_fullscreen)
                        ], spacing=15)
                    ),
                    self.tabs
                ], expand=True), 
                
                # 3. Player Bar (Floating)
                self.player_bar,
                
                # 4. Fullscreen Overlay (Top Z-Index)
                self.fs_player
            ], expand=True)
        )

    def animate_btn(self, e, btn):
        btn.scale = 1.05 if e.data=="true" else 1.0
        btn.update()
    
    def toggle_pause(self, e):
        if self.is_playing:
            self.audio_player.pause()
            self.play_pause_btn.icon = ft.Icons.PLAY_CIRCLE_FILLED_ROUNDED
            self.is_playing = False
        else:
            self.audio_player.resume()
            self.play_pause_btn.icon = ft.Icons.PAUSE_CIRCLE_FILLED_ROUNDED
            self.is_playing = True
        self.play_pause_btn.update()


    def on_pos_change(self, e):
        # Update FS Player Progress
        try:
            duration = self.audio_player.get_duration() or 1
            pos = int(e.data)
            # Avoid frequent updates if dragging
            self.fs_player.update_progress(pos, duration)
        except: pass
    
    def seek_track(self, value):
        try:
            self.audio_player.seek(int(value))
        except: pass
    
    def open_fullscreen(self, e):
        self.fs_player.show()

class RecommendationEngine:
    def __init__(self, app):
        self.app = app
        
    def find_similar(self, track_name):
        # Searches YouTube for "Mix" or similar
        try:
            search_query = f"ytsearch5:{track_name} similar music"
            with yt_dlp.YoutubeDL({'quiet':True, 'extract_flat':True}) as ydl:
                info = ydl.extract_info(search_query, download=False)
                return info.get('entries', [])
        except: return []

class WLEDClient:
    def __init__(self):
        self.ip = "192.168.2.128" # Default User IP
        self.port = 21324
        self.sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        self.enabled = False
        
        # Frame Buffer for 60 LEDs (r,g,b)
        self.num_leds = 60
        self.buffer = [(20, 0, 0)] * self.num_leds # Background Dark Red
        self.particles = [] # List of active particles (pos, velocity, color)

    def set_ip(self, ip):
        self.ip = ip

    def update_state(self, key_signature):
        # We ignore key colors now for the "Red/White" Pro look
        pass
        
    def tick(self, bass=0.0, high=0.0):
        """Advances the physics engine one frame, driven by Spectrum Data"""
        if not self.enabled: return
        
        # 1. Background: Reactive Red (Bass controls brightness)
        # Base brightness + Bass Kick
        red_bright = int(5 + (bass * 150)) # 5 to 155 brightness
        red_bright = min(255, red_bright)
        
        self.buffer = [(red_bright, 0, 0) for _ in range(self.num_leds)]
        
        # 2. Reactive Rain (Highs spawn sparkles)
        # If high energy is huge, spawn random white pixels
        if high > 0.6 and random.random() < (high * 0.3): 
             self.particles.append([random.randint(0, 59), 0.0, 0]) # Stationary sparkle, type 0 (white)

        # 3. Update Particles
        alive_particles = []
        for p in self.particles:
            p[0] += p[1] # Move
            
            if p[0] < self.num_leds + 5: 
                alive_particles.append(p)
                
                # Draw with Trails
                center_idx = int(p[0])
                
                # Draw Main Pixel
                if 0 <= center_idx < self.num_leds:
                    if p[2] == 0: 
                        # White Sparkle/Drop
                        # Additive blending with background
                        r, g, b = self.buffer[center_idx]
                        self.buffer[center_idx] = (255, min(255, g+200), min(255, b+200)) # keep it reddish-white
                    elif p[2] == 1: 
                        # Red Drop (ignore, bg covers it)
                        self.buffer[center_idx] = (255, 0, 0)
                
                # Draw Trail (length 3)
                for i in range(1, 4):
                    trail_idx = center_idx - i
                    if 0 <= trail_idx < self.num_leds:
                        dim = 1.0 - (i * 0.25)
                        if p[2] == 0:
                            # Trail logic
                            r,g,b = self.buffer[trail_idx]
                            self.buffer[trail_idx] = (min(255, int(r + 200*dim)), int(200*dim), int(200*dim))

        self.particles = alive_particles
        self.render()

    def beat(self, beat_index, strobe=False, is_drop=False):
        """Injects energy into the system"""
        if not self.enabled: return
        
        if strobe:
            # ON BEAT
            
            # --- DROP LOGIC ---
            if is_drop:
                 # CHAOS RAIN: Maximum Intensity
                 self.particles.append([0.0, 3.0, 0]) # Super Fast White
                 self.particles.append([2.0, 3.5, 0]) 
                 self.particles.append([5.0, 3.0, 0])
                 self.particles.append([10.0, 3.5, 0])
                 
                 # Extra Red accents
                 self.particles.append([15.0, 2.5, 1])
                 self.particles.append([20.0, 2.5, 1])
                 return 
            # ------------------
            
            # Standard Beat (Verse/Intro)
            if beat_index % 4 == 0:
                 # Bar Start: White Pulse
                 self.particles.append([0.0, 1.8, 0]) 
                 self.particles.append([4.0, 2.0, 0]) 
            else:
                 # Quarter Note: Red Drop
                 self.particles.append([0.0, 1.5, 1]) 
                 
        else:
            # Idle spawn
            if random.random() > 0.96:
                 self.particles.append([0.0, 1.0, 1]) 

    def render(self):
        # DRGB Protocol (Type 4) - More robust than WARLS
        # 4 = DRGB, 2 = Timeout Seconds
        data = bytearray([4, 2]) 
        for i in range(min(60, len(self.buffer))): 
             r,g,b = self.buffer[i]
             data.append(r); data.append(g); data.append(b)
        try:
            self.sock.sendto(data, (self.ip, self.port))
        except: pass

    # Old methods removed/replaced
    def send_color(self, r, g, b): pass

class FullscreenPlayer(ft.Container):
    def __init__(self, app):
        super().__init__()
        self.app = app
        self.visible = False
        self.expand = True
        self.bgcolor = "#000000"
        self.padding = 40
        self.animate_opacity = ft.Animation(500, "easeInOut")
        self.opacity = 0
        
        # Zen Visuals
        self.bg_art = ft.Container(expand=True, opacity=0.3, blur=ft.Blur(80, 80))
        self.track_title = ft.Text("Unknown Track", size=48, weight="bold", font_family="SpaceGrotesk", text_align="center")
        self.track_artist = ft.Text("Unknown Artist", size=24, color="grey", font_family="Outfit", text_align="center")
        
        # Controls
        self.progress_slider = ft.Slider(min=0, max=1000, value=0, active_color="#00f3ff", thumb_color="white", on_change_end=lambda e: app.seek_track(e.control.value))
        
        # Recommendations List
        self.reco_list = ft.ListView(height=180, spacing=10)
        
        # LED FX Simulated
        self.wled_ip = ft.TextField(label="WLED IP", value="192.168.2.128", width=120, height=40, text_size=12, border_color="#333333")
        self.led_toggle = ft.Switch(label="LIGHT LINK", value=True, active_color="#00ff80", on_change=self.toggle_wled)
        
        self.content = ft.Stack([
            self.bg_art,
            ft.Column([
                ft.Row([ft.IconButton(ft.Icons.KEYBOARD_ARROW_DOWN_ROUNDED, icon_size=40, on_click=self.hide)], alignment="start"),
                ft.Container(expand=True),
                
                # Big Titles
                ft.Container(
                    content=ft.Column([
                        self.track_title,
                        self.track_artist,
                    ], horizontal_alignment="center"),
                    padding=20
                ),
                
                # Progress
                ft.Container(
                   content=self.progress_slider,
                   padding=ft.padding.symmetric(horizontal=100)
                ),
                
                ft.Container(height=30),
                
                # Big Controls
                ft.Row([
                    ft.Column([
                        ft.Text("PITCH", size=10, color="grey"),
                        ft.Slider(min=0.8, max=1.2, value=1.0, width=120, active_color="#00ff80", on_change=app.set_speed, label="{value}x")
                    ], horizontal_alignment="center"),
                    
                    ft.IconButton(ft.Icons.SKIP_PREVIOUS_ROUNDED, icon_size=40, icon_color="white"),
                    ft.IconButton(ft.Icons.STOP_CIRCLE_OUTLINED, icon_size=30, icon_color="#ff3333", on_click=app.stop_track),
                    ft.IconButton(ft.Icons.PLAY_CIRCLE_FILLED_ROUNDED, icon_size=80, icon_color="#00f3ff", on_click=app.toggle_pause, ref=app.fs_play_btn_ref),
                    ft.IconButton(ft.Icons.SKIP_NEXT_ROUNDED, icon_size=40, icon_color="white"),
                    
                    ft.Column([
                        ft.Text("VOL", size=10, color="grey"),
                        ft.Slider(min=0, max=1, value=1.0, width=120, active_color="#ff0080", on_change=app.set_volume)
                    ], horizontal_alignment="center"),
                    
                ], alignment="center", spacing=20),
                
                ft.Container(height=40),
                
                ft.Text("DIG DEEPER", size=12, weight="bold", color="#00f3ff"),
                ft.Container(
                    content=self.reco_list, 
                    bgcolor=ft.colors.with_opacity(0.1, "white"), border_radius=12, padding=20
                ),
                
                ft.Container(expand=True),
                ft.Row([
                    ft.Icon(ft.Icons.LIGHTBULB_CIRCLE, color="yellow"), 
                    self.wled_ip,
                    self.led_toggle
                ], alignment="center", spacing=10)
            ], alignment="center", horizontal_alignment="center")
        ])
        
    def show(self):
        self.visible = True
        self.opacity = 1
        self.track_title.value = self.app.player_track_name.value
        self.update()
        
        # Trigger Reco
        if self.app.player_track_name.value != "Waiting for track...":
            self.reco_list.controls = [ft.ProgressRing()]
            self.reco_list.update()
            threading.Thread(target=self.load_recos, args=(self.app.player_track_name.value,), daemon=True).start()

    def hide(self, e):
        self.opacity = 0
        self.update()
        time.sleep(0.5)
        self.visible = False
        self.update()
        
    def update_progress(self, pos, dur):
        self.progress_slider.max = dur
        self.progress_slider.value = pos
        self.progress_slider.update()
        
    def toggle_wled(self, e):
        self.app.wled_client.enabled = e.control.value
        self.app.wled_client.set_ip(self.wled_ip.value)

    def load_recos(self, query):
        recos = self.app.reco_engine.find_similar(query)
        self.reco_list.controls.clear()
        for r in recos:
            self.reco_list.controls.append(
                ft.Container(
                    content=ft.Row([
                        ft.Icon(ft.Icons.QUEUE_MUSIC, color="grey"),
                        ft.Text(r.get('title', 'Unknown'), color="white", width=300, overflow="ellipsis"),
                        ft.IconButton(ft.Icons.DOWNLOAD, icon_size=16, icon_color="#00ff80", 
                            on_click=lambda e, url=r.get('url'): self.quick_download(url))
                    ]),
                    padding=10, bgcolor=ft.colors.with_opacity(0.05,"white"), border_radius=8
                )
            )
        self.reco_list.update()
        
    def quick_download(self, url):
        self.app.url_input.value = url
        self.app.start_download_thread(None)
        self.hide(None)

def main(page: ft.Page):
    app = DJSuiteApp(page)

if __name__ == "__main__":
    ft.app(target=main)
