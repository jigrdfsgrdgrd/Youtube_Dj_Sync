import fs from 'fs';
import path from 'path';
import { parseStringPromise, Builder } from 'xml2js';

const FORMULA = [
  { hotcue: 1, name: 'Auto Load', type: '3', beats: 0 },
  { hotcue: 2, name: 'Intro (16 Bars)', type: '0', beats: 64 },
  { hotcue: 3, name: 'Break/Drop (32 Bars)', type: '0', beats: 128 },
  { hotcue: 4, name: 'Mid (64 Bars)', type: '0', beats: 256 },
];

function findNmlPath() {
  const direct = 'C:\\Users\\juliu\\OneDrive\\Dokumente\\Native Instruments\\Traktor 4.5.0\\collection.nml';
  if (fs.existsSync(direct)) return direct;
  const userProfile = process.env.USERPROFILE || 'C:\\Users\\Default';
  const candidates = [
    path.join(userProfile, 'OneDrive', 'Dokumente', 'Native Instruments', 'Traktor 4.5.0', 'collection.nml'),
    path.join(userProfile, 'OneDrive', 'Documents', 'Native Instruments', 'Traktor 4.5.0', 'collection.nml'),
    path.join(userProfile, 'Dokumente', 'Native Instruments', 'Traktor 4.5.0', 'collection.nml'),
    path.join(userProfile, 'Documents', 'Native Instruments', 'Traktor 4.5.0', 'collection.nml'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return direct;
}

const nmlPath = findNmlPath();
const backupPath = nmlPath.replace(/collection\.nml$/i, 'collection_backup.nml');

async function run() {
  console.log(`Lese Traktor NML aus: ${nmlPath}...`);
  if (!fs.existsSync(nmlPath)) {
    console.error("NML Datei nicht gefunden!");
    return;
  }

  // Backup erstellen
  fs.copyFileSync(nmlPath, backupPath);
  console.log(`Backup erstellt unter: ${backupPath}`);

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
  let skipCount = 0;

  for (const entry of collection) {
    const tempo = entry.TEMPO?.[0]?.$;
    const bpm = tempo ? parseFloat(tempo.BPM) : null;
    
    if (!bpm) {
      skipCount++;
      continue;
    }

    if (!entry.CUE_V2) {
      entry.CUE_V2 = [];
    }

    let gridStartMs = null;
    // Suche den Grid-Marker
    for (const c of entry.CUE_V2) {
      if (c.$ && c.$.TYPE === '4') {
        gridStartMs = parseFloat(c.$.START);
        break;
      }
    }

    if (gridStartMs === null) {
      skipCount++;
      continue;
    }

    // Entferne alte generierte Hotcues 0 bis 3 (entspricht hotcue - 1, behalte Grid-Marker etc.)
    entry.CUE_V2 = entry.CUE_V2.filter((c) => {
      if (!c.$) return true;
      // Wenn es ein Grid-Marker ist (TYPE 4), behalten wir ihn immer
      if (c.$.TYPE === '4') return true;
      const hc = parseInt(c.$.HOTCUE, 10);
      // Entferne Hotcues 0, 1, 2, 3 (entspricht Traktor Hotcue 1-4)
      if (hc >= 0 && hc <= 3) return false;
      return true;
    });

    const msPerBeat = 60000 / bpm;

    // Füge neue Cues hinzu
    for (const cueDef of FORMULA) {
      const startMs = gridStartMs + (msPerBeat * cueDef.beats);
      
      entry.CUE_V2.push({
        $: {
          NAME: cueDef.name,
          DISPL_ORDER: "0",
          TYPE: cueDef.type,
          START: startMs.toFixed(6),
          LEN: "0.000000",
          REPEATS: "-1",
          HOTCUE: (cueDef.hotcue - 1).toString()
        }
      });
    }

    successCount++;
  }

  console.log(`Baue neue NML-Datei zusammen...`);
  const builder = new Builder();
  let xml = builder.buildObject(result);

  // WICHTIG: Traktor kann mit self-closing XML Tags (<CUE_V2 />) oft nichts anfangen und ignoriert sie!
  // Wir ersetzen alle self-closing Tags durch volle Tags (<CUE_V2></CUE_V2>).
  xml = xml.replace(/<([A-Z_0-9]+)([^>]*?)\s*\/>/g, '<$1$2></$1>');

  fs.writeFileSync(nmlPath, xml, 'utf-8');

  console.log(`\n--- FERTIG ---`);
  console.log(`Erfolgreich Cues in NML geschrieben für: ${successCount} Tracks`);
  console.log(`Übersprungen (keine BPM oder Grid gefunden): ${skipCount}`);
  console.log(`\nWICHTIG: Du kannst Traktor jetzt öffnen. Die Cues sind sofort da!`);
}

run();
