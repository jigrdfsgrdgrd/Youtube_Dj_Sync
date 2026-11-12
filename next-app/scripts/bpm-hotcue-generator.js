import fs from 'fs';
import path from 'path';
import NodeID3 from 'node-id3';
import { parseStringPromise } from 'xml2js';
import { serialize } from 'traktor-metadata';

// Standardformel für Hotcues (Extended Mixes / Electronic Music)
// 1 Bar (Takt) = 4 Beats
const FORMULA = [
  { hotcue: 1, name: 'Start/Grid', type: 3, beats: 0 },
  { hotcue: 2, name: 'Intro (16 Bars)', type: 0, beats: 64 },
  { hotcue: 3, name: 'Break/Drop (32 Bars)', type: 0, beats: 128 },
  { hotcue: 4, name: 'Mid (64 Bars)', type: 0, beats: 256 },
];

const nmlPath = 'C:\\Users\\juliu\\OneDrive\\Dokumente\\Native Instruments\\Traktor 4.5.0\\collection.nml';

// Pfad zur config.json für den Download-Ordner
const configPath = path.join(process.cwd(), '..', 'spotify-yt-sync', 'config.json');
let destPath = 'C:\\Users\\juliu\\Music\\DJ_Downloads';

try {
  if (fs.existsSync(configPath)) {
    const configData = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    if (configData.downloads && configData.downloads.destination_path) {
      destPath = path.normalize(configData.downloads.destination_path);
    }
  }
} catch (e) {
  console.log('Konnte config.json nicht lesen, verwende Standardpfad.');
}

async function run() {
  console.log(`Lese Traktor NML aus: ${nmlPath}...`);
  if (!fs.existsSync(nmlPath)) {
    console.error("NML Datei nicht gefunden!");
    return;
  }

  const nmlData = fs.readFileSync(nmlPath, 'utf-8');
  console.log("Parse NML (das kann einen Moment dauern)...");
  
  let result;
  try {
    result = await parseStringPromise(nmlData);
  } catch(e) {
    console.error("Fehler beim Parsen der NML:", e);
    return;
  }

  const collection = result.NML?.COLLECTION?.[0]?.ENTRY || [];
  console.log(`${collection.length} Tracks in der Traktor Collection gefunden.`);

  let successCount = 0;
  let errorCount = 0;
  let skipCount = 0;

  for (const entry of collection) {
    const location = entry.LOCATION?.[0]?.$;
    if (!location) continue;

    // Traktor speichert den Pfad in VOLUME und DIR und FILE
    // z.B. VOLUME="C:", DIR="/Users/juliu/Music/DJ_Downloads/...", FILE="song.mp3"
    let dir = location.DIR.replace(/:/g, ''); // Entfernt die Doppelpunkte die Traktor vor jedem Ordner macht
    dir = dir.replace(/\//g, '\\'); // Slashes zu Backslashes
    const fullPath = path.join(location.VOLUME, dir, location.FILE);

    // Prüfen ob der Track in unserem Download-Ordner liegt
    if (!fullPath.toLowerCase().includes(destPath.toLowerCase())) {
      continue;
    }

    if (!fs.existsSync(fullPath)) {
      continue;
    }

    const tempo = entry.TEMPO?.[0]?.$;
    const bpm = tempo ? parseFloat(tempo.BPM) : null;
    
    if (!bpm) {
      skipCount++;
      continue; // Ohne BPM können wir nichts berechnen
    }

    const cues = entry.CUE_V2 || [];
    let gridStartMs = null;

    // Suche den Grid-Marker (TYPE="4")
    for (const c of cues) {
      if (c.$ && c.$.TYPE === '4') {
        gridStartMs = parseFloat(c.$.START);
        break;
      }
    }

    if (gridStartMs === null) {
      skipCount++;
      continue; // Ohne Grid-Marker kennen wir den ersten Beat nicht
    }

    try {
      // Berechne Millisekunden pro Beat
      const msPerBeat = 60000 / bpm;

      const traktorCues = [];
      
      for (const cueDef of FORMULA) {
        const startMs = gridStartMs + (msPerBeat * cueDef.beats);
        
        traktorCues.push({
          name: cueDef.name,
          index: cueDef.hotcue - 1,
          type: cueDef.type,
          start: startMs,
          length: 0,
          repeats: 0,
          hotcue: cueDef.hotcue
        });
      }

      const traktorData = { cuePoints: traktorCues };
      const binaryTraktorData = serialize(traktorData);

      const tags = NodeID3.read(fullPath) || {};
      if (!tags.private) tags.private = [];

      tags.private = tags.private.filter(p => p.ownerIdentifier !== 'Traktor4');
      
      tags.private.push({
        ownerIdentifier: 'Traktor4',
        data: Buffer.from(binaryTraktorData)
      });

      const origStat = fs.statSync(fullPath);
      const success = NodeID3.update(tags, fullPath);
      try {
        fs.utimesSync(fullPath, origStat.atime, origStat.mtime);
      } catch {}
      
      if (success) {
        successCount++;
        console.log(`[OK] Hotcues gesetzt für: ${location.FILE} (BPM: ${bpm.toFixed(2)})`);
      } else {
        errorCount++;
      }
    } catch (e) {
      errorCount++;
    }
  }

  console.log(`\n--- FERTIG ---`);
  console.log(`Erfolgreich mit BPM-Hotcues getaggt: ${successCount}`);
  console.log(`Übersprungen (keine BPM oder Grid gefunden): ${skipCount}`);
  console.log(`Fehler: ${errorCount}`);
  console.log(`\nWICHTIG: Gehe nun in Traktor, markiere diese Tracks, mach einen Rechtsklick und wähle "Check Consistency" bzw. "Read Tags from Track", damit Traktor die neuen ID3-Hotcues einliest!`);
}

run();
