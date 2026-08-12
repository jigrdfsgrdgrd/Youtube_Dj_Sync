"""
DJ Analytics Suite - v3.0 (Premium Glass UI)
Features: Full-screen responsive layout, Modern Glassmorphism, Premium Typography, Smooth Animations
"""

import flet as ft
import yt_dlp
import os
import threading
import time
import requests
import traceback
import concurrent.futures
from mutagen.easyid3 import EasyID3
from mutagen.id3 import ID3, APIC, TKEY, TBPM, TIT2, TPE1, TALB
import math
from pathlib import Path
import random

# Audio Analysis check
try:
    import librosa
    import numpy as np
    ANALYSIS_AVAILABLE = True
except ImportError:
    ANALYSIS_AVAILABLE = False

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
        self.audio_player = ft.Audio(src="dummy.mp3", autoplay=False, volume=1.0)
        self.page.overlay.append(self.audio_player)
        self.folder_picker = ft.FilePicker(on_result=self.folder_picked)
        self.page.overlay.append(self.folder_picker)
        
        # State
        self.current_library_path = str(Path.home() / "Music" / "DJ-Library")
        self.root_library_path = self.current_library_path
        self.root_library_path = self.current_library_path
        self.pulsing = False
        self.is_playing = False
        
        # DJ State
        self.current_bpm = 0
        self.current_key = None
        self.speed_label_ref = ft.Ref()
        
        self.build_ui()
        self.navigate_to(self.current_library_path)

    def setup_page(self):
        self.page.title = "DJ Suite Pro"
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
            except: 
                self.current_bpm = 0
                self.current_key = None
                
            self.player_bar.offset = ft.transform.Offset(0, 0)
            self.player_bar.opacity = 1
            self.player_bar.update()
            
            self.pulsing = True
            threading.Thread(target=self.pulse_worker, daemon=True).start()
        except: pass

    def pulse_worker(self):
        while self.pulsing:
            try:
                # Random animated visualizer bars
                for bar in self.visualizer_bars:
                    bar.height = random.randint(10, 30)
                self.visualizer_row.update()
                time.sleep(0.08)
                if not self.audio_player.src: break
            except: break

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
                        if res: self.add_log(f"IMPORTED: {res['name']}", "#00ff80")

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
            
            if not os.path.exists(path):
                opts = {'format':'bestaudio/best', 'outtmpl':os.path.join(folder,f'{safe_title}.%(ext)s'), 
                        'postprocessors':[{'key':'FFmpegExtractAudio','preferredcodec':'mp3','preferredquality':quality}], 'quiet':True}
                with yt_dlp.YoutubeDL(opts) as ydl: ydl.extract_info(entry['url'])
            
            bpm, key = 0, "?"
            if self.bpm_switch.value and ANALYSIS_AVAILABLE:
                 try:
                    y, sr = librosa.load(path, offset=10, duration=45)
                    tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
                    bpm = int(round(tempo if np.isscalar(tempo) else tempo[0]))
                    chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
                    key = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'][np.argmax(np.sum(chroma, axis=1))]
                 except: pass
            
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
                                content=ft.Text("V3.0", size=10, weight="bold", color="#ff0080", font_family="SpaceGrotesk")
                            )
                        ], spacing=15)
                    ),
                    self.tabs
                ], expand=True), 
                
                # 3. Player Bar (Floating)
                self.player_bar
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

def main(page: ft.Page):
    app = DJSuiteApp(page)

if __name__ == "__main__":
    ft.app(target=main)
