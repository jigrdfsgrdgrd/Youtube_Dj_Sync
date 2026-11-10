# 🎧 DJ Local Sync

> Ein modernes Next.js Web-Interface zum Synchronisieren und Herunterladen von YouTube-Playlists direkt auf deine lokale Festplatte – inklusive integriertem DJ-Player und automatischer Traktor Hotcue-Generierung.

---

## ✨ Features

- 🎵 **YouTube & YouTube Music Sync:** Lade Playlists direkt per URL oder Playlist-ID herunter (`yt-dlp` Integration).
- 📁 **Lokale DJ-Bibliothek:** Übersicht all deiner heruntergeladenen Playlists und Tracks mit Sofort-Wiedergabe.
- 🎛️ **Integrierter Audio-Player:** Eleganter Floating-Player mit Play/Pause, Track-Wechsel, Scrubbing (HTTP 206 Streaming) und Lautstärkeregler.
- ⚡ **Live Download-Fortschritt:** Anzeige von Fortschritt in Prozent, Song-Zähler und verbleibender Zeit (ETA).
- 🏷️ **Traktor Hotcues Generieren:** Automatische Hotcue-Erstellung (Auto Load, Intro 16 Bars, Drop 32 Bars, Mid 64 Bars) direkt in deiner Traktor Collection (`collection.nml`).
- 🔄 **Sync Config:** Synchronisiere alle in der Konfiguration hinterlegten Playlists mit einem Klick.
- 🚀 **1-Klick Windows Launcher:** Ein Klick auf `start_dj_sync.bat` startet den Server und öffnet automatisch den Browser.

---

## 💻 Schnellstart auf deinem Laptop (Windows)

### 1. Repository klonen

Öffne ein Terminal (PowerShell oder CMD) auf deinem Laptop:

```bash
git clone https://github.com/jigrdfsgrdgrd/Youtube_Dj_Sync.git
cd Youtube_Dj_Sync
```

---

### 2. Voraussetzungen installieren (Einmalig)

Falls auf dem Laptop noch kein Node.js, `yt-dlp` oder `ffmpeg` installiert ist, kannst du das mit einem einzigen PowerShell-Befehl über `winget` erledigen:

```powershell
winget install OpenJS.NodeJS yt-dlp Gyan.FFmpeg
```

> **Hinweis:** Nach der Installation das Terminal einmal neu starten, damit die Befehle im System-`PATH` erkannt werden.

---

### 3. App starten

Mache einfach einen **Doppelklick auf:**
📁 **`start_dj_sync.bat`**

Das Skript:
1. Prüft automatisch Node.js und `yt-dlp`.
2. Installiert beim ersten Start alle Abhängigkeiten (`npm install`).
3. Startet den lokalen Server und öffnet die Benutzeroberfläche unter `http://localhost:3000`.

---

## ⚙️ Einstellungen & Speicherort

- Klicke oben rechts auf das **Zahnrad-Symbol** (⚙️), um deinen lokalen Zielpfad anzupassen (z. B. `C:\Users\...\Music\DJ_Downloads` oder ein externes Laufwerk wie `Z:\Musik\DJ_Downloads`).
- Deine Playlists für den Bulk-Download kannst du in `next-app/config.json` unter `"playlist_ids"` eintragen.

---

## 🛠️ Manuelle Ausführung

```bash
cd next-app
npm install
npm run dev
```
Anschließend im Browser öffnen: [http://localhost:3000](http://localhost:3000)

---

## 📄 Lizenz

MIT License - Siehe [LICENSE](LICENSE)
