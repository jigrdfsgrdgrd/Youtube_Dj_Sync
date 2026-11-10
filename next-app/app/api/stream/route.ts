import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

function getConfigPath(): string {
  const external = 'C:\\Users\\juliu\\.gemini\\antigravity\\scratch\\spotify-yt-sync\\config.json';
  if (fs.existsSync(external)) return external;
  return path.join(process.cwd(), 'config.json');
}

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const fileParam = searchParams.get('file');

  if (!fileParam) {
    return NextResponse.json({ error: 'File is required' }, { status: 400 });
  }

  // Basic security check to prevent directory traversal
  if (fileParam.includes('..')) {
    return NextResponse.json({ error: 'Invalid file path' }, { status: 400 });
  }

  const configPath = getConfigPath();
  let basePath = 'C:\\Users\\juliu\\Music\\DJ_Downloads';
  try {
    if (fs.existsSync(configPath)) {
      const file = fs.readFileSync(configPath, 'utf-8');
      const configData = JSON.parse(file);
      if (configData.downloads?.destination_path) {
        basePath = configData.downloads.destination_path;
      }
    }
  } catch (err) {
    // fallback
  }

  const filePath = path.join(basePath, fileParam);

  try {
    const stat = fs.statSync(filePath);
    const total = stat.size;
    const rangeHeader = req.headers.get('range');

    if (rangeHeader) {
      const parts = rangeHeader.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : total - 1;
      const chunksize = (end - start) + 1;
      
      const fileBuffer = Buffer.alloc(chunksize);
      const fd = fs.openSync(filePath, 'r');
      fs.readSync(fd, fileBuffer, 0, chunksize, start);
      fs.closeSync(fd);

      return new NextResponse(fileBuffer, {
        status: 206,
        headers: {
          'Content-Range': `bytes ${start}-${end}/${total}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunksize.toString(),
          'Content-Type': 'audio/mpeg',
        }
      });
    }

    // No range requested
    const fileBuffer = fs.readFileSync(filePath);
    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Length': total.toString(),
        'Content-Type': 'audio/mpeg',
      }
    });

  } catch (error) {
    console.error('Error streaming audio:', error);
    return NextResponse.json({ error: 'Audio file not found' }, { status: 404 });
  }
}
