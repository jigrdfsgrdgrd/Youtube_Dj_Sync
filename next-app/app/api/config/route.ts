import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';

function getConfigPath(): string {
  const external = 'C:\\Users\\juliu\\.gemini\\antigravity\\scratch\\spotify-yt-sync\\config.json';
  if (fsSync.existsSync(external)) return external;
  const local = path.join(process.cwd(), 'config.json');
  return local;
}

export async function GET() {
  try {
    const configPath = getConfigPath();
    if (!fsSync.existsSync(configPath)) {
      return NextResponse.json({ path: 'C:\\Users\\juliu\\Music\\DJ_Downloads' });
    }
    const file = await fs.readFile(configPath, 'utf-8');
    const data = JSON.parse(file);
    return NextResponse.json({ path: data.downloads?.destination_path || 'C:\\Users\\juliu\\Music\\DJ_Downloads' });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to read config' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { path: newPath } = await req.json();
    if (!newPath) return NextResponse.json({ error: 'Path is required' }, { status: 400 });

    const configPath = getConfigPath();
    let data: any = { downloads: {} };
    if (fsSync.existsSync(configPath)) {
      try {
        const file = await fs.readFile(configPath, 'utf-8');
        data = JSON.parse(file);
      } catch {}
    }

    if (!data.downloads) data.downloads = {};
    data.downloads.destination_path = newPath;

    await fs.writeFile(configPath, JSON.stringify(data, null, 2));

    return NextResponse.json({ success: true, path: newPath });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update config' }, { status: 500 });
  }
}
