import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';

function getCookiePaths(): { local: string; root: string } {
  return {
    local: path.join(process.cwd(), 'cookies.txt'),
    root: path.join(process.cwd(), '..', 'cookies.txt')
  };
}

function findExistingCookiePath(): string | null {
  const paths = getCookiePaths();
  if (fs.existsSync(paths.local)) return paths.local;
  if (fs.existsSync(paths.root)) return paths.root;
  return null;
}

export async function GET() {
  try {
    const existingPath = findExistingCookiePath();
    if (!existingPath) {
      return NextResponse.json({ exists: false });
    }

    const stat = await fsPromises.stat(existingPath);
    const content = await fsPromises.readFile(existingPath, 'utf-8');
    const lines = content.split('\n').filter(l => l.trim() && !l.trim().startsWith('#'));

    const hasYoutube = lines.some(l => l.toLowerCase().includes('youtube.com'));
    const hasAuth = lines.some(l => 
      l.includes('SAPISID') || 
      l.includes('LOGIN_INFO') || 
      l.includes('__Secure-3PAPISID') || 
      l.includes('SID')
    );

    return NextResponse.json({
      exists: true,
      path: path.basename(existingPath),
      sizeBytes: stat.size,
      updatedAt: stat.mtime.toLocaleString('de-DE'),
      cookieCount: lines.length,
      hasYoutube,
      hasAuth
    });
  } catch (error: any) {
    console.error('Error reading cookie status:', error);
    return NextResponse.json({ exists: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'Keine Datei übergeben.' }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const content = buffer.toString('utf-8');

    if (!content.trim()) {
      return NextResponse.json({ error: 'Die Cookie-Datei ist leer.' }, { status: 400 });
    }

    const lines = content.split('\n').filter(l => l.trim() && !l.trim().startsWith('#'));
    const hasYoutube = lines.some(l => l.toLowerCase().includes('youtube.com'));

    const savePath = path.join(process.cwd(), 'cookies.txt');
    await fsPromises.writeFile(savePath, buffer);

    const stat = await fsPromises.stat(savePath);
    const hasAuth = lines.some(l => 
      l.includes('SAPISID') || 
      l.includes('LOGIN_INFO') || 
      l.includes('__Secure-3PAPISID') || 
      l.includes('SID')
    );

    return NextResponse.json({
      success: true,
      exists: true,
      path: 'cookies.txt',
      sizeBytes: stat.size,
      updatedAt: stat.mtime.toLocaleString('de-DE'),
      cookieCount: lines.length,
      hasYoutube,
      hasAuth,
      message: hasYoutube 
        ? 'Cookie-Datei erfolgreich gespeichert und aktiv.' 
        : 'Datei gespeichert, enthält jedoch keine youtube.com-Einträge.'
    });
  } catch (error: any) {
    console.error('Error uploading cookies:', error);
    return NextResponse.json({ error: error.message || 'Fehler beim Hochladen' }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const paths = getCookiePaths();
    if (fs.existsSync(paths.local)) await fsPromises.unlink(paths.local);
    if (fs.existsSync(paths.root)) await fsPromises.unlink(paths.root);

    return NextResponse.json({ success: true, message: 'Cookies entfernt.' });
  } catch (error: any) {
    console.error('Error deleting cookies:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
