import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

export const dynamic = 'force-dynamic';

export async function GET() {
  const progressPath = path.join(process.cwd(), 'progress.json');
  try {
    const file = await fs.readFile(progressPath, 'utf-8');
    const data = JSON.parse(file);
    return NextResponse.json(data);
  } catch (error) {
    // If file doesn't exist, return idle state
    return NextResponse.json({ status: 'idle', percentage: 0, playlistName: '', songTitle: '' });
  }
}
