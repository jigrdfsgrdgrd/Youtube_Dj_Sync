# DJ Local Sync

Web-Anwendung zum Herunterladen und Synchronisieren von YouTube- und YouTube-Music-Playlists auf lokale Speichermedien, inklusive integriertem Web-Player, direkter Cookie-Verwaltung für YouTube Premium und automatischer Vorbereitung für Native Instruments Traktor Pro.

---

## 1. Voraussetzungen

Für den Betrieb unter Windows werden folgende Komponenten benötigt:

* Node.js (Version 18 oder neuer)
* yt-dlp
* FFmpeg
* Deno (empfohlener JS-Runtime-Solver für yt-dlp Signatur- & Audio-Entschlüsselung)

Falls diese Programme noch nicht vorhanden sind, können sie über die Windows PowerShell mit dem Windows Package Manager (winget) installiert werden:

```powershell
winget install OpenJS.NodeJS yt-dlp Gyan.FFmpeg DenoLand.Deno
```

Hinweis: Nach der Installation muss das Terminal bzw. die PowerShell einmal geschlossen und neu geöffnet werden, damit die Umgebungsvariablen aktiv sind.

---

## 2. Installation und Start unter Windows

### 2.1 Repository klonen

```powershell
git clone https://github.com/jigrdfsgrdgrd/Youtube_Dj_Sync.git
cd Youtube_Dj_Sync
```

### 2.2 Anwendung starten

Der Start kann über die ausführbare Datei oder das Batch-Skript erfolgen:

* `DJ Sync.exe` (Startet die Anwendung im Hintergrund)
* `start_dj_sync.bat` (Startskript mit Konsolenanzeige)

Ablauf beim ersten Start:
1. Das Skript prüft das Vorhandensein von Node.js.
2. Fehlende Abhängigkeiten werden im Ordner `next-app` via `npm install` nachgeladen.
3. Der Production-Build wird einmalig erstellt (`next build`).
4. Der Server startet lokal auf Port 3000 und öffnet `http://localhost:3000` im Standardbrowser.

Bei weiteren Aufrufen startet der Server direkt, ohne erneutes Bauen.

Optional kann über das Skript `create_shortcut.ps1` eine Verknüpfung auf dem Windows-Desktop erstellt werden:

```powershell
powershell -ExecutionPolicy Bypass -File .\create_shortcut.ps1
```

---

## 3. Audio-Qualität und YouTube Premium Cookies

### 3.1 Technischer Hintergrund zur Bitrate

YouTube stellt Streams standardmäßig in gestaffelten Qualitätsstufen bereit:

* Ohne Login / Free-Account:
  YouTube liefert Audio mit maximal 128 kbps AAC bzw. rund 160 kbps Opus. Frequenzen oberhalb von etwa 15 bis 16 kHz sind baulich bedingt abgeschnitten oder stark komprimiert.

* Mit YouTube Premium:
  Für verifizierte Premium-Abonnenten stellt YouTube Music ungedrosselte Quell-Streams mit 256 kbps AAC (High Quality) und hochbitratigem Opus bereit. Diese Quellspuren decken das gesamte Frequenzspektrum bis über 20 kHz ab.

DJ Local Sync lädt immer die qualitativ beste verfügbare Quellspur (`bestaudio[acodec=opus]/bestaudio/best`) herunter und konvertiert diese in konstante 320 kbps (CBR MP3). Um auf die 256-kbps-Spuren von YouTube zugreifen zu können, benötigt der Downloader eine gültige Session-Authentifizierung über eine `cookies.txt`-Datei.

### 3.2 Cookies exportieren

1. Installiere im Webbrowser (z. B. Google Chrome, Microsoft Edge oder Brave) eine Erweiterung zum Exportieren von Cookies im Netscape-Format, beispielsweise die Open-Source-Erweiterung "Get cookies.txt LOCALLY" aus dem Chrome Web Store (oder "cookies.txt" für Mozilla Firefox).
2. Öffne im Browser `https://music.youtube.com` (oder `https://www.youtube.com`) und vergewissere dich, dass du mit dem Google-Konto eingeloggt bist, das über das aktive YouTube-Premium-Abonnement verfügt.
3. Klicke auf das Symbol der Erweiterung in der Menüleiste deines Browsers.
4. Exportiere die Cookies für `youtube.com` und speichere die Textdatei als `cookies.txt` auf deinem Computer ab.

### 3.3 Cookies im Web-Frontend einbinden und prüfen

Die Einbindung der exportierten `cookies.txt` kann direkt in der Web-Oberfläche vorgenommen werden:

1. Öffne die Web-Oberfläche (`http://localhost:3000`).
2. Klicke oben rechts auf das Einstellungen-Symbol (Zahnrad).
3. Unter dem Punkt "YouTube Cookies (Premium)" auf "Datei auswählen" klicken und die exportierte `cookies.txt` auswählen.
4. Nach der Auswahl wird die Datei sofort validiert und auf den Server übertragen.
5. Das Interface zeigt dir unmittelbar den Status an:
   * Status-Badge: Zeigt ein grünes "Aktiv"-Häkchen.
   * Authentifizierung: Bestätigt, ob YouTube-Anmeldedaten (Session-Tokens wie `SID` oder `SAPISID`) enthalten sind.
   * Details: Zeigt die Anzahl gefundener Cookie-Einträge sowie das Aktualisierungsdatum an.
   * Löschen: Über das Mülleimer-Symbol können hinterlegte Cookies jederzeit mit einem Klick entfernt werden.

Alternativ kann die Datei `cookies.txt` auch manuell in das Hauptverzeichnis `Youtube_Dj_Sync\cookies.txt` oder in `Youtube_Dj_Sync\next-app\cookies.txt` gelegt werden.

Sicherheitshinweis: Die `cookies.txt` enthält Anmeldeinformationen deines Google-Kontos. Sie wird standardmäßig lokal verarbeitet und von Git ignoriert. Teile diese Datei niemals mit Dritten und lade sie nicht in öffentliche Versionsverwaltungen hoch.

---

## 4. Traktor Pro Integration und Hotcues

### 4.1 Automatisches Tagging beim Download

Jeder heruntergeladene Titel durchläuft automatisch das Skript `scripts/traktor-tagger.js`:

* ID3-Tag Traktor4: Setzt automatisch Cue-Punkt 1 als "Auto Load"-Marker (Typ 3, Position 0.0 ms), damit der Track beim Laden in Traktor sofort spielbereit am ersten Beat anliegt.
* Exaktes Download-Datum (`--no-mtime`): Das Erstellungs- und Änderungsdatum der Datei wird auf den exakten Download-Zeitpunkt festgelegt. Dadurch lassen sich neu geladene Titel in Traktor zuverlässig nach Datum sortieren.
* Bereinigung der Metadaten: Entfernt störende Zusätze wie `(Official Video)`, `(Lyrics)` oder `- Topic` aus den Künstler- und Titel-Tags.
* Duplikatschutz: Eine interne `archive.txt` verhindert das erneute Herunterladen bereits synchronisierter Titel.

### 4.2 NML-Patching für bestehende Traktor-Sammlungen

Über den Button "Traktor Hotcues Generieren" in der Web-Oberfläche wird das Skript `scripts/nml-hotcue-patcher.js` ausgeführt:

1. Traktor Pro vor dem Ausführen vollständig beenden.
2. Das Skript liest die Sammlung `collection.nml` (unter `Dokumente\Native Instruments\Traktor 4.x.x\`) ein.
3. Vor jeder Änderung wird eine Sicherung (`collection_backup.nml`) erzeugt.
4. Aus dem in Traktor analysierten Beatgrid und dem BPM-Wert werden vier Taktraster-Cues berechnet und eingetragen:
   * Cue 1: Start / Grid (0 Beats)
   * Cue 2: Intro (16 Takte = 64 Beats)
   * Cue 3: Break / Drop (32 Takte = 128 Beats)
   * Cue 4: Mid (64 Takte = 256 Beats)

---

## 5. Konfiguration

Die Einstellungen werden in `next-app/config.json` verwaltet und können größtenteils direkt über die Web-Oberfläche konfiguriert werden:

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

* `destination_path`: Zielverzeichnis für heruntergeladene Playlists.
* `playlist_ids`: Gespeicherte Playlists, die über "Sync Config" synchronisiert werden.
* `ffmpeg_path`: Pfad zur FFmpeg-Binary (kann leer bleiben, wenn FFmpeg im System-PATH liegt).

---

## 6. Manuelle Befehle für Entwickler

Entwicklungsmodus mit Hot-Reloading starten:

```powershell
cd next-app
npm install
npm run dev
```

Produktions-Build manuell erstellen und starten:

```powershell
cd next-app
npm run build
npm run start
```

---

## 7. Lizenz

Dieses Projekt steht unter der MIT-Lizenz. Details siehe `LICENSE`.
