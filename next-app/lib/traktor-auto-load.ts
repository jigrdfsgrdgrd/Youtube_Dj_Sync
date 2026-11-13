import fs from 'fs/promises';
import NodeID3 from 'node-id3';
import { serialize } from 'traktor-metadata';

/**
 * Precomputed once per module load instead of serializing on every downloaded track.
 * Hotcue 1, Type 3 = Traktor "Auto Load" cue point at 0.0 ms.
 */
const AUTO_LOAD_DATA = Buffer.from(
  serialize({
    cuePoints: [
      {
        name: 'Auto Load',
        index: 0,
        type: 3,
        start: 0,
        length: 0,
        repeats: 0,
        hotcue: 1,
      },
    ],
  })
);

function hasTraktor4Frame(tags: NodeID3.Tags): boolean {
  if (!Array.isArray(tags.private)) return false;
  return tags.private.some(
    (frame) =>
      frame?.ownerIdentifier?.toUpperCase() === 'TRAKTOR4' &&
      Boolean(frame.data && frame.data.length > 0)
  );
}

/**
 * Tags a downloaded MP3 in-process with the Traktor4 "Auto Load" cue point
 * (if not already present) and updates mtime to now so Traktor sorts new tracks first.
 */
export async function tagTraktorAutoLoad(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
  } catch {
    console.warn(`[TraktorAutoLoad] File not found for tagging: ${filePath}`);
    return false;
  }

  try {
    const fileBuffer = await fs.readFile(filePath);
    const existingTags = NodeID3.read(fileBuffer) || {};
    const now = new Date();

    if (hasTraktor4Frame(existingTags)) {
      await fs.utimes(filePath, now, now).catch(() => undefined);
      return true;
    }

    const existingPrivate = Array.isArray(existingTags.private)
      ? existingTags.private.filter(
          (frame) => frame?.ownerIdentifier?.toUpperCase() !== 'TRAKTOR4'
        )
      : [];

    const nextPrivate = [
      ...existingPrivate,
      {
        ownerIdentifier: 'Traktor4',
        data: AUTO_LOAD_DATA as unknown as string,
      },
    ];

    const updatedBuffer = NodeID3.update(
      { ...existingTags, private: nextPrivate },
      fileBuffer
    );

    if (!Buffer.isBuffer(updatedBuffer)) {
      console.error(`[TraktorAutoLoad] Failed to build updated ID3 buffer for: ${filePath}`);
      return false;
    }

    await fs.writeFile(filePath, updatedBuffer);
    await fs.utimes(filePath, now, now).catch(() => undefined);
    return true;
  } catch (err) {
    console.error(`[TraktorAutoLoad] Error tagging ${filePath}:`, err);
    return false;
  }
}
