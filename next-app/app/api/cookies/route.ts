import { NextRequest, NextResponse } from 'next/server';
import fsPromises from 'fs/promises';
import path from 'path';

function getCookiePaths(): { local: string; root: string } {
  return {
    local: path.join(process.cwd(), 'cookies.txt'),
    root: path.join(process.cwd(), '..', 'cookies.txt'),
  };
}

async function findExistingCookiePath(): Promise<string | null> {
  const paths = getCookiePaths();
  for (const candidate of [paths.local, paths.root]) {
    try {
      await fsPromises.access(candidate);
      return candidate;
    } catch {
      // try next
    }
  }
  return null;
}

function analyzeCookieContent(content: string): {
  cookieCount: number;
  hasYoutube: boolean;
  hasAuth: boolean;
} {
  let cookieCount = 0;
  let hasYoutube = false;
  let hasAuth = false;

  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    cookieCount++;

    if (!hasYoutube && line.toLowerCase().includes('youtube.com')) {
      hasYoutube = true;
    }
    if (
      !hasAuth &&
      (line.includes('SAPISID') ||
        line.includes('LOGIN_INFO') ||
        line.includes('__Secure-3PAPISID') ||
        line.includes('SID'))
    ) {
      hasAuth = true;
    }
  }

  return { cookieCount, hasYoutube, hasAuth };
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export async function GET() {
  try {
    const existingPath = await findExistingCookiePath();
    if (!existingPath) {
      return NextResponse.json({ exists: false });
    }

    const [stat, content] = await Promise.all([
      fsPromises.stat(existingPath),
      fsPromises.readFile(existingPath, 'utf-8'),
    ]);
    const { cookieCount, hasYoutube, hasAuth } = analyzeCookieContent(content);

    return NextResponse.json({
      exists: true,
      path: path.basename(existingPath),
      sizeBytes: stat.size,
      updatedAt: stat.mtime.toLocaleString('de-DE'),
      cookieCount,
      hasYoutube,
      hasAuth,
    });
  } catch (error: unknown) {
    console.error('Error reading cookie status:', error);
    return NextResponse.json(
      { exists: false, error: getErrorMessage(error, 'Failed to read cookie status') },
      { status: 500 }
    );
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

    const { cookieCount, hasYoutube, hasAuth } = analyzeCookieContent(content);

    const savePath = path.join(process.cwd(), 'cookies.txt');
    await fsPromises.writeFile(savePath, buffer);
    const stat = await fsPromises.stat(savePath);

    return NextResponse.json({
      success: true,
      exists: true,
      path: 'cookies.txt',
      sizeBytes: stat.size,
      updatedAt: stat.mtime.toLocaleString('de-DE'),
      cookieCount,
      hasYoutube,
      hasAuth,
      message: hasYoutube
        ? 'Cookie-Datei erfolgreich gespeichert und aktiv.'
        : 'Datei gespeichert, enthält jedoch keine youtube.com-Einträge.',
    });
  } catch (error: unknown) {
    console.error('Error uploading cookies:', error);
    return NextResponse.json(
      { error: getErrorMessage(error, 'Fehler beim Hochladen') },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  try {
    const paths = getCookiePaths();
    await Promise.all(
      [paths.local, paths.root].map(async (targetPath) => {
        try {
          await fsPromises.unlink(targetPath);
        } catch (error: unknown) {
          if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') {
            throw error;
          }
        }
      })
    );

    return NextResponse.json({ success: true, message: 'Cookies entfernt.' });
  } catch (error: unknown) {
    console.error('Error deleting cookies:', error);
    return NextResponse.json(
      { error: getErrorMessage(error, 'Fehler beim Entfernen') },
      { status: 500 }
    );
  }
}
