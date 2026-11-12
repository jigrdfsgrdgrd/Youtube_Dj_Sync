import fs from 'fs';
import NodeID3 from 'node-id3';
import { serialize } from 'traktor-metadata';

const filePath = process.argv[2];

if (!filePath) {
  console.error("No file path provided to traktor-tagger.js");
  process.exit(1);
}

if (!fs.existsSync(filePath)) {
  console.error("File does not exist:", filePath);
  process.exit(1);
}

try {
  // We add a single Hotcue at the very beginning (0.0 ms).
  // Traktor Hotcues are 1-indexed (1 to 8).
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

  // Read existing tags so we don't overwrite Title/Artist/Cover
  const tags = NodeID3.read(filePath) || {};
  
  // Ensure private array exists
  if (!tags.private) {
    tags.private = [];
  }

  // Remove existing Traktor4 tag if it somehow exists
  tags.private = tags.private.filter(p => p.ownerIdentifier !== 'Traktor4');
  
  // Add our new Traktor4 tag
  tags.private.push({
    ownerIdentifier: 'Traktor4',
    data: Buffer.from(binaryTraktorData)
  });

  // Write tags back to the file
  const success = NodeID3.update(tags, filePath);
  
  if (success) {
    // Stelle sicher, dass das Datei-Datum exakt auf den heutigen Download-Zeitpunkt gesetzt ist
    const now = new Date();
    try {
      fs.utimesSync(filePath, now, now);
    } catch {}
    console.log(`Successfully added Traktor hotcue to ${filePath}`);
  } else {
    console.error(`Failed to update ID3 tags for ${filePath}`);
  }
} catch (error) {
  console.error("Error tagging Traktor metadata:", error);
}
