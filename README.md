# 🎧 YouTube DJ Sync (v2.0)

> Ein modernes Fullstack DJ-Tool: **Next.js Web-Interface** (Frontend) + **Python FastAPI** (Backend) zum automatisierten Herunterladen, Synchronisieren und Verwalten von YouTube- & YouTube Music-Playlists mit integriertem Audio-Player.

![License](https://img.shields.io/badge/License-MIT-blue.svg)
![Python](https://img.shields.io/badge/Python-3.10%2B-blue?logo=python)
![Node.js](https://img.shields.io/badge/Node.js-18%2B-green?logo=node.js)
![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)
![FastAPI](https://img.shields.io/badge/FastAPI-0.110%2B-teal?logo=fastapi)

---

## ✨ Features

- 🎵 **High-Quality MP3-Downloads:** Automatischer Download in 320 kbps (oder 256 / 192 kbps).
- 🛡️ **DJ Hotcue-Schutz:** Bereits lokal vorhandene Dateien werden **niemals überschrieben**. In DJ-Software (Traktor, Rekordbox, Serato) gesetzte Hotcues, Beatgrids und Loops bleiben geschützt!
- 🖼️ **ID3-Tagging & Cover-Artwork:** Titel, Künstler, Album und Album-Cover werden direkt in die MP3-Datei eingebettet.
- ⚡ **Live-Fortschritt & Status:** Echtzeit-Fortschrittsanzeige mit Song-Zähler und detaillierter Terminal-Log-Konsole im Web-Browser.
- 🎛️ **Integrierter DJ Audio-Player:** Heruntergeladene Titel direkt im Browser anhören mit flüssigem Vor-/Zurückspulen (HTTP Range Streaming) und Lautstärkeregelung.
- 🚀 **1-Klick Windows Launcher:** Ein Klick auf `start_app.bat` startet Backend und Frontend automatisch und öffnet die App im Browser.

---

## 💻 Schnellstart auf deinem Laptop (Windows)

### 1. Repository klonen

Öffne die PowerShell oder das Terminal auf deinem Laptop und führe aus:

```bash
git clone https://github.com/jigrdfsgrdgrd/Youtube_Dj_Sync.git
cd Youtube_Dj_Sync
```

---

### 2. Voraussetzungen installieren (Einmalig)

Auf einem neuen Windows-Laptop kannst du alle benötigten Tools bequem mit einem einzigen PowerShell-Befehl über `winget` installieren:

```powershell
winget install Python.Python.3.11 OpenJS.NodeJS Gyan.FFmpeg
```

> **Wichtig:** Starte das Terminal oder den Laptop nach der Installation einmal neu, damit die Umgebungsvariablen (`PATH`) aktiv werden.

---

### 3. App starten (1-Klick)

Mache einfach einen **Doppelklick auf:**
📁 **`start_app.bat`**

Das Skript erledigt alles automatisch:
1. Prüft Python, Node.js und FFmpeg.
2. Richtet die virtuelle Python-Umgebung (`.venv`) ein und installiert alle Backend-Pakete.
3. Installiert die Frontend-Abhängigkeiten (`npm install`).
4. Startet Backend (`http://127.0.0.1:8000`) und Frontend (`http://localhost:3000`).
5. Öffnet automatisch deinen Standard-Webbrowser!

Zum Beenden einfach die Konsolenfenster schließen oder **`stop_app.bat`** doppelklicken.

---

## ⚙️ Konfiguration & Speicherort

- **Standard-Speicherort:** Die Songs werden standardmäßig im Ordner `storage/downloads/<Playlist-Name>` gespeichert.
- **Eigener Pfad (z.B. externe Festplatte oder Netzlaufwerk):** 
  Du kannst den Speicherort jederzeit direkt in der Web-Oberfläche unter **Settings** oder in `backend/config.json` unter `"destination_path"` ändern (z. B. `Z:\Musik\DJ_Downloads`).

---

## 🔒 Private Playlists (Optional)

Für öffentliche oder nicht gelistete Playlists ist **keine Anmeldung** erforderlich.

Möchtest du auf deine eigenen privaten YouTube Music-Playlists zugreifen:
1. Erstelle mit `ytmusicapi` eine `headers_auth.json` im Ordner `backend/`.
2. Diese Datei wird von `.gitignore` automatisch ignoriert, damit deine persönlichen Zugangsdaten niemals auf GitHub landen.

---

## 🛠️ Manuelle Entwicklung / Ausführung

Falls du Backend und Frontend separat im Entwicklungsmodus starten möchtest:

### Backend (FastAPI):
```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r backend/requirements.txt
python -m uvicorn backend.server:app --reload --port 8000
```

### Frontend (Next.js):
```bash
cd next-app
npm install
npm run dev
```

---

## 📄 Lizenz

Dieses Projekt steht unter der [MIT License](LICENSE).
Respektiere Urheberrechte und nutze Downloads nur für persönliche DJ-Zwecke.
