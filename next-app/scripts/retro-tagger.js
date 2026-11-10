import fs from 'fs';
import path from 'path';
import NodeID3 from 'node-id3';
import { serialize } from 'traktor-metadata';

// Pfad zur config.json
const configPath = path.join(process.cwd(), '..', 'spotify-yt-sync', 'config.json');
let destPath = 'C:\\Users\\juliu\\Music\\DJ_Downloads';

try {
  if (fs.existsSync(configPath)) {
    const configData = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    if (configData.downloads && configData.downloads.destination_path) {
      destPath = configData.downloads.destination_path;
    }
  }
} catch (e) {
  console.log('Konnte config.json nicht lesen, verwende Standardpfad.');
}

console.log(`Durchsuche ${destPath} nach MP3s...`);

function walkSync(dir, filelist = []) {
  if (!fs.existsSync(dir)) return filelist;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filepath = path.join(dir, file);
    try {
      const stat = fs.statSync(filepath);
      if (stat.isDirectory()) {
        filelist = walkSync(filepath, filelist);
      } else if (file.toLowerCase().endsWith('.mp3')) {
        filelist.push(filepath);
      }
    } catch (e) {
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
    const traktorData = {
      cuePoints: [
        {
          name: 'Auto Load',
          index: 0,
          type: 3, // 3 = Load marker
          start: 0,
          length: 0,
          repeats: 0,
          hotcue: 1
        }
      ]
    };

    const binaryTraktorData = serialize(traktorData);

    const tags = NodeID3.read(filePath) || {};
    
    if (!tags.private) {
      tags.private = [];
    }

    // Prüfen ob schon Traktor tags existieren
    const hasTraktorTag = tags.private.some(p => p.ownerIdentifier === 'Traktor4');
    
    // Wir überschreiben bestehende Traktor tags beim Retro-Tagging NICHT, 
    // falls du schon manuell Cues in Traktor gesetzt und in die Datei geschrieben hast!
    if (hasTraktorTag) {
      // Wenn du das Überschreiben erzwingen willst, kommentiere die nächsten zwei Zeilen aus:
      console.log(`Überspringe (Hat bereits Traktor-Tags): ${path.basename(filePath)}`);
      continue;
      
      // tags.private = tags.private.filter(p => p.ownerIdentifier !== 'Traktor4');
    }
    
    tags.private.push({
      ownerIdentifier: 'Traktor4',
      data: Buffer.from(binaryTraktorData)
    });

    const success = NodeID3.update(tags, filePath);
    
    if (success) {
      successCount++;
    } else {
      errorCount++;
    }
  } catch (error) {
    errorCount++;
  }
}

console.log(`\nFertig!`);
console.log(`Erfolgreich getaggt: ${successCount}`);
console.log(`Fehler: ${errorCount}`);
