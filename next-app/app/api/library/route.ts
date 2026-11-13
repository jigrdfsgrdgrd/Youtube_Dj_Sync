import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { getConfigPath } from '@/lib/yt-dlp-helper';

const DEFAULT_DEST_PATH = 'C:\\Users\\juliu\\Music\\DJ_Downloads';

interface LibraryTrack {
  name: string;
  file: string;
}

interface LibraryPlaylist {
  id: string;
  title: string;
  tracks: LibraryTrack[];
  status: 'synced';
}

interface FolderCacheEntry {
  mtimeMs: number;
  tracks: LibraryTrack[];
}

declare global {
  var __libraryFolderCache: Map<string, FolderCacheEntry> | undefined;
}

function getFolderCache(): Map<string, FolderCacheEntry> {
  if (!globalThis.__libraryFolderCache) {
    globalThis.__libraryFolderCache = new Map();
  }
  return globalThis.__libraryFolderCache;
}

async function resolveBasePath(): Promise<string> {
  const configPath = getConfigPath();
  try {
    const file = await fs.readFile(configPath, 'utf-8');
    const configData = JSON.parse(file) as { downloads?: { destination_path?: string } };
    if (configData.downloads?.destination_path) {
      return configData.downloads.destination_path;
    }
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException)?.code !== 'ENOENT') {
      console.error('Failed to read config in library:', err);
    }
  }
  return DEFAULT_DEST_PATH;
}

export async function GET() {
  const basePath = await resolveBasePath();

  try {
    try {
      const baseStat = await fs.stat(basePath);
      if (!baseStat.isDirectory()) {
        return NextResponse.json({ playlists: [] });
      }
    } catch {
      return NextResponse.json({ playlists: [] });
    }

    const items = await fs.readdir(basePath, { withFileTypes: true });
    const directories = items.filter((item) => item.isDirectory());

    const cache = getFolderCache();
    const activePaths = new Set<string>();

    const playlists: LibraryPlaylist[] = await Promise.all(
      directories.map(async (dir) => {
        const playlistPath = path.join(basePath, dir.name);
        activePaths.add(playlistPath);

        const dirStat = await fs.stat(playlistPath);
        const cached = cache.get(playlistPath);
        let tracks: LibraryTrack[];

        if (cached && cached.mtimeMs === dirStat.mtimeMs) {
          tracks = cached.tracks;
        } else {
          const files = await fs.readdir(playlistPath);
          tracks = files
            .filter((f) => f.toLowerCase().endsWith('.mp3'))
            .map((f) => ({
              name: f.replace(/\.mp3$/i, ''),
              file: path.join(dir.name, f),
            }));
          cache.set(playlistPath, { mtimeMs: dirStat.mtimeMs, tracks });
        }

        return {
          id: Buffer.from(dir.name).toString('base64'),
          title: dir.name,
          tracks,
          status: 'synced' as const,
        };
      })
    );

    for (const cachedPath of cache.keys()) {
      if (!activePaths.has(cachedPath)) {
        cache.delete(cachedPath);
      }
    }

    return NextResponse.json({ playlists });
  } catch (error: unknown) {
    console.error('Error reading library:', error);
    return NextResponse.json({ error: 'Failed to read library' }, { status: 500 });
  }
}
