# DJ Local Sync

Web-Anwendung zum Herunterladen und Synchronisieren von YouTube- und YouTube-Music-Playlists auf lokale Speichermedien, inklusive integriertem Web-Player und automatischer Hotcue-Erstellung fuer Native Instruments Traktor Pro.

---

## 1. Voraussetzungen

Fuer den Betrieb unter Windows werden folgende Programme benoetigt:

* Node.js (Version 18 oder neuer)
* yt-dlp
* FFmpeg

Falls diese Komponenten noch nicht installiert sind, koennen sie ueber die Windows PowerShell mittels des Windows Package Managers (winget) installiert werden:

```powershell
winget install OpenJS.NodeJS yt-dlp Gyan.FFmpeg
```

Hinweis: Nach der Installation muss das Terminal- bzw. PowerShell-Fenster einmal neu geoeffnet werden, damit die Pfade in den Umgebungsvariablen aktiv sind.

---

## 2. Installation und Start auf Windows

### 2.1 Repository klonen

```powershell
git clone https://github.com/jigrdfsgrdgrd/Youtube_Dj_Sync.git
cd Youtube_Dj_Sync
```

### 2.2 Anwendung starten

Der Start kann ueber die ausfuehrbare Datei oder das Batch-Skript erfolgen:

* `DJ Sync.exe` (Startet die Anwendung im Hintergrund)
* `start_dj_sync.bat` (Startskript mit Konsolenausgabe)

Ablauf beim ersten Start:
1. Das Skript prueft die Node.js-Installation.
2. Fehlende npm-Pakete werden automatisch ueber `npm install` im Unterordner `next-app` bezogen.
3. Der Production-Build wird einmalig erstellt (`next build`).
4. Der Server startet lokal auf Port 3000 und oeffnet die Web-Oberflaeche im Standardbrowser unter `http://localhost:3000`.

Bei jedem weiteren Start laeuft der Server direkt ohne erneuten Build-Vorgang an.

Optional kann ueber das PowerShell-Skript `create_shortcut.ps1` eine Desktop-Verknuepfung mit dem Programmsymbol angelegt werden:

```powershell
powershell -ExecutionPolicy Bypass -File .\create_shortcut.ps1
```

---

## 3. Audio-Qualitaet und YouTube Premium Cookies

### 3.1 Technischer Hintergrund zur Bitrate

YouTube stellt Streams in unterschiedlichen Qualitaetsstufen bereit:

* Ohne Login / Free-Account:
  YouTube begrenzt den Audio-Stream in der Regel auf 128 kbps AAC bzw. maximal ca. 160 kbps Opus (WebM). Auch wenn diese Streams anschliessend in MP3 konvertiert werden, bleiben Frequenzanteile oberhalb von ca. 15 bis 16 kHz baulich bedingt abgeschnitten.

* Mit YouTube Premium:
  Fuer authentifizierte Premium-Abonnenten liefert YouTube Music hoeherwertige Quell-Streams mit bis zu 256 kbps AAC (High Quality) bzw. ungedrosseltem Opus. Diese Streams enthalten den vollen Frequenzumfang bis ueber 20 kHz.

Die Download-Engine des Projekts erzwingt standardmaessig die beste verfuegbare Quellspur (`bestaudio[acodec=opus]/bestaudio/best`) und transkodiert das Quellmaterial in eine konstante Bitrate von 320 kbps (CBR MP3). Um tatsaechlich auf die 256-kbps-Premium-Quellen von YouTube zugreifen zu koennen, muss yt-dlp ueber eine Cookie-Datei authentifiziert werden.

### 3.2 Schritt-fuer-Schritt-Anleitung: Cookies exportieren

1. Browser-Erweiterung installieren:
   Fuer Chromium-basierte Browser (Google Chrome, Microsoft Edge, Brave) wird die Open-Source-Erweiterung "Get cookies.txt LOCALLY" empfohlen (erhaeltlich im Chrome Web Store). Fuer Mozilla Firefox existieren vergleichbare Erweiterungen wie "cookies.txt".

2. Bei YouTube anmelden:
   Oeffne im Browser die Seite `https://music.youtube.com` (oder `https://www.youtube.com`) und vergewissere dich, dass du mit dem Google-Konto angemeldet bist, auf dem das YouTube-Premium-Abonnement aktiv ist.

3. Cookies exportieren:
   Klicke auf das Icon der installierten Erweiterung in der Browser-Symbolleiste. Waehle dort den Export fuer `youtube.com` und lade die generierte Textdatei unter dem Namen `cookies.txt` herunter.

4. Datei im Projektverzeichnis ablegen:
   Kopiere die heruntergeladene Datei `cookies.txt` in das Verzeichnis der Anwendung:
   
   `Youtube_Dj_Sync\cookies.txt`
   (oder alternativ direkt in `Youtube_Dj_Sync\next-app\cookies.txt`)

5. Automatische Erkennung:
   Beim naechsten Download erkennt die Anwendung die vorhandene `cookies.txt` automatisch und uebergibt das Argument `--cookies` an yt-dlp.

Sicherheitshinweis: Die Datei `cookies.txt` enthaelt Sitzungs-Schluessel deines Google-Kontos. Sie darf unter keinen Umstaenden oeffentlich weitergegeben, geteilt oder in Versionsverwaltungen eingecheckt werden.

---

## 4. Traktor Pro Integration und Hotcues

### 4.1 Automatisches Tagging beim Download

Jeder heruntergeladene Titel durchlaeuft automatisch das Skript `scripts/traktor-tagger.js`. Dieses fuehrt folgende Operationen aus:

* ID3-Tag Traktor4: Setzt automatisch Cue-Punkt 1 als "Auto Load"-Marker (Typ 3, Position 0.0 ms).
* Dateidatum (`--no-mtime`): Setzt das Erstellungs- und Aenderungsdatum der MP3-Datei auf den exakten Download-Zeitpunkt. Dadurch erscheinen neue Titel bei einer Sortierung nach Datum in Traktor verlaesslich ganz oben.
* Metadaten-Bereinigung: Automatische Entfernung von Zusaetzen wie `(Official Video)`, `(Lyrics)` oder `- Topic` aus Kuenstler- und Titel-Tags.
* Duplikatschutz: Verhindert das erneute Herunterladen bereits vorhandener Dateien ueber `archive.txt`.

### 4.2 NML-Patching fuer bestehende Sammlungen

Ueber den Button "Traktor Hotcues Generieren" in der Web-Oberflaeche wird das Skript `scripts/nml-hotcue-patcher.js` aufgerufen:

1. Vor dem Vorgang muss Traktor Pro vollstaendig geschlossen werden.
2. Das Skript liest die Traktor-Sammlung `collection.nml` aus (unter `Dokumente\Native Instruments\Traktor 4.x.x\`).
3. Es wird automatisch eine Sicherungskopie (`collection_backup.nml`) angelegt.
4. Anhand des in Traktor analysierten Beatgrids (Grid-Marker Typ 4) und der BPM-Zahl werden vier praezise Taktraster-Cues berechnet und eingetragen:
   * Cue 1: Start / Grid (0 Beats)
   * Cue 2: Intro (16 Bars = 64 Beats)
   * Cue 3: Break / Drop (32 Bars = 128 Beats)
   * Cue 4: Mid (64 Bars = 256 Beats)

---

## 5. Konfiguration und Verzeichnisse

Die globale Konfiguration befindet sich in `next-app/config.json`:

```json
{
  "youtube_music": {
    "playlist_ids": [
      "PLNGwLo5mTx2F6ReZCU0ED2_yJC8A6ItgJ"
    ],
    "auth_file": "headers_auth.json"
  },
  "downloads": {
    "destination_path": "C:\\Users\\<Benutzername>\\Music\\DJ_Downloads",
    "ffmpeg_path": "",
    "audio_quality": "320"
  }
}
```

* `destination_path`: Zielverzeichnis fuer heruntergeladene Playlists. Kann auch ueber die Einstellungen in der Web-Oberflaeche (Zahnrad-Symbol) angepasst werden.
* `playlist_ids`: Liste der Playlists, die beim Klick auf "Sync Config" synchronisiert werden. Neue Download-Links ueber das Eingabefeld werden hier automatisch ergaenzt.
* `ffmpeg_path`: Kann leer bleiben, sofern FFmpeg ueber den Windows-Systempfad erreichbar ist.

---

## 6. Manuelle Ausfuehrung fuer Entwickler

Falls Anpassungen am Frontend vorgenommen werden sollen:

```powershell
cd next-app
npm install
npm run dev
```

Fuer den regulaeren Produktivbetrieb:

```powershell
cd next-app
npm run build
npm run start
```

---

## 7. Lizenz

Dieses Projekt steht unter der MIT-Lizenz. Einzelheiten sind der Datei `LICENSE` zu entnehmen.
