import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';

function getConfigPath(): string {
  const external = 'C:\\Users\\juliu\\.gemini\\antigravity\\scratch\\spotify-yt-sync\\config.json';
  if (fsSync.existsSync(external)) return external;
  return path.join(process.cwd(), 'config.json');
}

export async function GET() {
  const configPath = getConfigPath();
  let basePath = 'C:\\Users\\juliu\\Music\\DJ_Downloads';
  
  try {
    if (fsSync.existsSync(configPath)) {
      const file = await fs.readFile(configPath, 'utf-8');
      const configData = JSON.parse(file);
      if (configData.downloads?.destination_path) {
        basePath = configData.downloads.destination_path;
      }
    }
  } catch (err) {
    console.error('Failed to read config in library:', err);
  }

  const playlists = [];

  try {
    // Check if directory exists
    try {
      await fs.access(basePath);
    } catch {
      return NextResponse.json({ playlists: [] });
    }

    const items = await fs.readdir(basePath, { withFileTypes: true });
    
    for (const item of items) {
      if (item.isDirectory()) {
        const playlistPath = path.join(basePath, item.name);
        const files = await fs.readdir(playlistPath);
        
        const mp3Files = files.filter(f => f.endsWith('.mp3')).map(f => ({
          name: f.replace('.mp3', ''),
          file: path.join(item.name, f) // Relative path
        }));

        playlists.push({
          id: Buffer.from(item.name).toString('base64'), // simple unique ID
          title: item.name,
          tracks: mp3Files,
          status: 'synced'
        });
      }
    }

    return NextResponse.json({ playlists });
  } catch (error) {
    console.error('Error reading library:', error);
    return NextResponse.json({ error: 'Failed to read library' }, { status: 500 });
  }
}
