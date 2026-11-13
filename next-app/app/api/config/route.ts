import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { getConfigPath } from '@/lib/yt-dlp-helper';

const DEFAULT_DEST_PATH = 'C:\\Users\\juliu\\Music\\DJ_Downloads';

interface ConfigData {
  downloads?: {
    destination_path?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export async function GET() {
  try {
    const configPath = getConfigPath();
    let destPath = DEFAULT_DEST_PATH;
    try {
      const file = await fs.readFile(configPath, 'utf-8');
      const data = JSON.parse(file) as ConfigData;
      if (data.downloads?.destination_path) {
        destPath = data.downloads.destination_path;
      }
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') {
        throw error;
      }
    }
    return NextResponse.json({ path: destPath });
  } catch {
    return NextResponse.json({ error: 'Failed to read config' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { path?: unknown };
    const newPath = typeof body.path === 'string' ? body.path : '';
    if (!newPath) {
      return NextResponse.json({ error: 'Path is required' }, { status: 400 });
    }

    const configPath = getConfigPath();
    let data: ConfigData = { downloads: {} };
    try {
      const file = await fs.readFile(configPath, 'utf-8');
      data = JSON.parse(file) as ConfigData;
    } catch {
      // Missing or invalid config starts fresh
    }

    if (!data.downloads || typeof data.downloads !== 'object') {
      data.downloads = {};
    }
    data.downloads.destination_path = newPath;

    await fs.mkdir(path.dirname(configPath), { recursive: true });
    const tmpPath = `${configPath}.${process.pid}.${Date.now()}.tmp`;
    try {
      await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
      await fs.rename(tmpPath, configPath);
    } catch (writeErr) {
      await fs.unlink(tmpPath).catch(() => {});
      throw writeErr;
    }

    return NextResponse.json({ success: true, path: newPath });
  } catch {
    return NextResponse.json({ error: 'Failed to update config' }, { status: 500 });
  }
}
