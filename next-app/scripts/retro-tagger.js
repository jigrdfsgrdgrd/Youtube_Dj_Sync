import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import NodeID3 from 'node-id3';
import { serialize } from 'traktor-metadata';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DEST_PATH = 'C:\\Users\\juliu\\Music\\DJ_Downloads';

function resolveConfigPath() {
  const candidates = [
    path.join(process.cwd(), 'config.json'),
    path.join(process.cwd(), '..', 'config.json'),
    path.resolve(__dirname, '..', 'config.json'),
    path.resolve(__dirname, '..', '..', 'config.json'),
    path.join(process.cwd(), '..', 'spotify-yt-sync', 'config.json'),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

let destPath = DEFAULT_DEST_PATH;
try {
  const configPath = resolveConfigPath();
  if (configPath) {
    const configData = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    if (configData.downloads && configData.downloads.destination_path) {
      destPath = path.normalize(configData.downloads.destination_path);
    }
  }
} catch {
  console.log('Konnte config.json nicht lesen, verwende Standardpfad.');
}

// Statische Traktor-Auto-Load-Daten einmalig vorab serialisieren
const AUTO_LOAD_BUFFER = Buffer.from(
  serialize({
    cuePoints: [
      {
        name: 'Auto Load',
        index: 0,
        type: 3, // 3 = Load marker
        start: 0,
        length: 0,
        repeats: 0,
        hotcue: 1,
      },
    ],
  })
);

console.log(`Durchsuche ${destPath} nach MP3s...`);

function walkSync(dir, filelist = []) {
  if (!fs.existsSync(dir)) return filelist;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const filepath = path.join(dir, entry.name);
    try {
      if (entry.isDirectory()) {
        walkSync(filepath, filelist);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.mp3')) {
        filelist.push(filepath);
      }
    } catch {
      console.error(`Konnte Datei nicht lesen (übersprungen): ${filepath}`);
    }
  }
  return filelist;
}

const mp3Files = walkSync(destPath);
console.log(`${mp3Files.length} MP3-Dateien gefunden. Starte Retro-Tagging...`);

let successCount = 0;
let errorCount = 0;

for (const filePath of mp3Files) {
  try {
    const tags = NodeID3.read(filePath) || {};

    if (!tags.private) {
      tags.private = [];
    }

    // Prüfen ob schon Traktor tags existieren
    const hasTraktorTag = tags.private.some((p) => p.ownerIdentifier === 'Traktor4');

    // Wir überschreiben bestehende Traktor tags beim Retro-Tagging NICHT,
    // falls du schon manuell Cues in Traktor gesetzt und in die Datei geschrieben hast!
    if (hasTraktorTag) {
      console.log(`Überspringe (Hat bereits Traktor-Tags): ${path.basename(filePath)}`);
      continue;
    }

    tags.private.push({
      ownerIdentifier: 'Traktor4',
      data: AUTO_LOAD_BUFFER,
    });

    const origStat = fs.statSync(filePath);
    const success = NodeID3.update(tags, filePath);
    try {
      fs.utimesSync(filePath, origStat.atime, origStat.mtime);
    } catch {
      // ignore mtime restore failure
    }

    if (success) {
      successCount++;
    } else {
      errorCount++;
    }
  } catch {
    errorCount++;
  }
}

console.log(`\nFertig!`);
console.log(`Erfolgreich getaggt: ${successCount}`);
console.log(`Fehler: ${errorCount}`);
