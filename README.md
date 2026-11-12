# 🎧 DJ Local Sync

> Ein modernes Next.js Web-Interface zum Synchronisieren und Herunterladen von YouTube- & YouTube Music-Playlists direkt auf deine lokale Festplatte – inklusive integriertem DJ-Player und automatischer Traktor Hotcue-Generierung.

---

## ✨ Features

- 🔊 **Echte 320 kbps CBR Audio-Qualität:** Zieht automatisch den besten verfügbaren Audio-Stream (`bestaudio[acodec=opus]/bestaudio`) und konvertiert ihn per FFmpeg in echte **320 kbps Constant Bitrate (CBR)** MP3s – für präzise Beatgrids und sauberes Scrubbing in Traktor.
- 📅 **Korrektes Download-Datum für Traktor (`--no-mtime`):** Neu heruntergeladene Tracks erhalten exakt den heutigen Download-Zeitpunkt als Dateidatum (nicht das alte YouTube-Upload-Jahr), sodass neue Downloads beim Sortieren nach Datum immer ganz oben stehen.
- 🧹 **Saubere Dateinamen & Duplikat-Schutz:** Entfernt automatisch Kanal-Zusätze wie `" - Topic"` sowie `(Official Video)`, `(Lyrics)` oder `[HD]` aus den Titeln und schützt bestehende Tracks + Hotcues über `archive.txt` und `--no-overwrites`.
- 🎛️ **Integrierter DJ Audio-Player:** Floating-Player mit unterbrechungsfreiem Vor-/Zurückspulen (HTTP 206 Byte-Range Streaming), Auto-Next und Lautstärkeregler.
- 🏷️ **Traktor Hotcues Generieren:** Automatische Beatgrid-basierte Hotcue-Erstellung (*Auto Load*, *Intro 16 Bars*, *Break/Drop 32 Bars*, *Mid 64 Bars*) direkt in deiner Traktor Collection (`collection.nml`) – ohne das ursprüngliche Download-Datum deiner Dateien zu verändern.
- 🔄 **Sync Config & Parallel-Download:** Synchronisiere alle in der Konfiguration hinterlegten Playlists mit einem Klick (`--concurrent-fragments 4` für maximale Geschwindigkeit).
- ⚡ **Sofort-Start (`start_dj_sync.bat`):** Nutzt den vorkompilierten Production-Server und startet in unter 1 Sekunde.

---

## 💻 Schnellstart auf deinem Laptop (Windows)

### 1. Repository klonen

Öffne PowerShell oder CMD auf deinem Laptop:

```powershell
git clone https://github.com/jigrdfsgrdgrd/Youtube_Dj_Sync.git
cd Youtube_Dj_Sync
```

### 2. Voraussetzungen installieren (Einmalig)

Falls auf dem Laptop noch kein Node.js, `yt-dlp` oder `ffmpeg` installiert ist, installiere alles bequem mit einem einzigen PowerShell-Befehl:

```powershell
winget install OpenJS.NodeJS yt-dlp Gyan.FFmpeg
```

> **Hinweis:** Nach der Erstinstallation das Terminal einmal neu öffnen, damit die Programme im System-`PATH` verfügbar sind.

### 3. App starten

Mache einfach einen **Doppelklick auf:**
🎧 **`DJ Sync.exe`** *(mit eigenem DJ Sync Logo)* oder **`start_dj_sync.bat`**

> **Tipp:** Mit `powershell -ExecutionPolicy Bypass -File .\create_shortcut.ps1` kannst du dir auch auf dem Laptop jederzeit eine Desktop-Verknüpfung mit dem Logo anlegen.

- Beim **allerersten Start** installiert das Skript automatisch alle Pakete (`npm install`) und baut einmalig den schnellen Production-Build (`npm run build`).
- Bei **jedem weiteren Start** ist die App in **unter 1 Sekunde** unter `http://localhost:3000` sofort einsatzbereit!

---

## ⚙️ Einstellungen & Optionale Features

- **Speicherort ändern:** Klicke oben rechts auf das **Zahnrad-Symbol (⚙️)**, um deinen lokalen Zielpfad anzupassen (z. B. `C:\Users\...\Music\DJ_Downloads` oder `Z:\Musik\DJ_Downloads`).
- **Playlists verwalten:** Jede neu heruntergeladene Playlist-URL wird automatisch in `config.json` gespeichert und beim Klick auf **Sync Config** mit aktualisiert.
- **YouTube Premium (Optional):** Das Tool funktioniert standardmäßig komplett ohne Login. Falls du irgendwann YouTube-Premium-Cookies nutzen möchtest, lege einfach eine exportierte `cookies.txt` in den Ordner `next-app/` – sie wird automatisch erkannt (und von Git ignoriert).

---

## 🛠️ Manuelle Befehle (Entwicklung)

```bash
cd next-app
npm install
npm run build   # Production-Build aktualisieren
npm run start   # Schnellen Production-Server starten
```

---

## 📄 Lizenz

MIT License – Siehe [LICENSE](LICENSE)
