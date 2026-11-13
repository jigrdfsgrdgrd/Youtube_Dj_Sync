import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import { getConfigPath } from '@/lib/yt-dlp-helper';

const DEFAULT_DEST_PATH = 'C:\\Users\\juliu\\Music\\DJ_Downloads';
const CACHE_CONTROL_HEADER = 'private, max-age=3600, must-revalidate';

async function resolveBasePath(): Promise<string> {
  const configPath = getConfigPath();
  try {
    const file = await fsPromises.readFile(configPath, 'utf-8');
    const configData = JSON.parse(file) as { downloads?: { destination_path?: string } };
    if (configData.downloads?.destination_path) {
      return configData.downloads.destination_path;
    }
  } catch {
    // fallback to default
  }
  return DEFAULT_DEST_PATH;
}

function createFileWebStream(
  filePath: string,
  options?: { start?: number; end?: number }
): ReadableStream<Uint8Array> {
  let nodeStream: fs.ReadStream | null = null;
  let closed = false;

  return new ReadableStream<Uint8Array>({
    start(controller) {
      nodeStream = fs.createReadStream(filePath, options);
      nodeStream.on('data', (chunk: string | Buffer) => {
        if (closed) return;
        const buf = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
        controller.enqueue(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength));
        if (controller.desiredSize !== null && controller.desiredSize <= 0) {
          nodeStream?.pause();
        }
      });
      nodeStream.on('end', () => {
        if (closed) return;
        closed = true;
        controller.close();
      });
      nodeStream.on('error', (err) => {
        if (closed) return;
        closed = true;
        controller.error(err);
      });
    },
    pull() {
      if (!closed) {
        nodeStream?.resume();
      }
    },
    cancel() {
      closed = true;
      if (nodeStream) {
        nodeStream.destroy();
        nodeStream = null;
      }
    },
  });
}

function parseByteRange(
  rangeHeader: string,
  total: number
): { start: number; end: number } | null {
  if (!rangeHeader.startsWith('bytes=')) return null;
  const spec = rangeHeader.slice('bytes='.length).split(',')[0].trim();
  const dashIndex = spec.indexOf('-');
  if (dashIndex === -1) return null;

  const startStr = spec.slice(0, dashIndex).trim();
  const endStr = spec.slice(dashIndex + 1).trim();

  if (startStr === '') {
    const suffixLength = parseInt(endStr, 10);
    if (Number.isNaN(suffixLength) || suffixLength <= 0) return null;
    const start = Math.max(0, total - suffixLength);
    return { start, end: total - 1 };
  }

  const start = parseInt(startStr, 10);
  const end = endStr === '' ? total - 1 : Math.min(parseInt(endStr, 10), total - 1);
  if (Number.isNaN(start) || Number.isNaN(end) || start < 0 || start >= total || end < start) {
    return null;
  }
  return { start, end };
}

export async function GET(req: NextRequest) {
  const fileParam = req.nextUrl.searchParams.get('file');

  if (!fileParam) {
    return NextResponse.json({ error: 'File is required' }, { status: 400 });
  }

  // Basic security check to prevent directory traversal
  if (fileParam.includes('..')) {
    return NextResponse.json({ error: 'Invalid file path' }, { status: 400 });
  }

  const basePath = await resolveBasePath();
  const resolvedBase = path.resolve(basePath);
  const resolvedFile = path.resolve(resolvedBase, fileParam);
  if (resolvedFile !== resolvedBase && !resolvedFile.startsWith(resolvedBase + path.sep)) {
    return NextResponse.json({ error: 'Invalid file path' }, { status: 400 });
  }

  try {
    const stat = await fsPromises.stat(resolvedFile);
    if (!stat.isFile()) {
      return NextResponse.json({ error: 'Audio file not found' }, { status: 404 });
    }

    const total = stat.size;
    const etag = `"${total}-${Math.trunc(stat.mtimeMs)}"`;

    if (req.headers.get('if-none-match') === etag) {
      return new NextResponse(null, {
        status: 304,
        headers: {
          ETag: etag,
          'Cache-Control': CACHE_CONTROL_HEADER,
        },
      });
    }

    const rangeHeader = req.headers.get('range');
    if (rangeHeader) {
      if (total === 0) {
        return new NextResponse(null, {
          status: 416,
          headers: { 'Content-Range': 'bytes */0' },
        });
      }

      const parsedRange = parseByteRange(rangeHeader, total);
      if (!parsedRange) {
        return new NextResponse(null, {
          status: 416,
          headers: { 'Content-Range': `bytes */${total}` },
        });
      }

      const { start, end } = parsedRange;
      const chunksize = end - start + 1;
      const stream = createFileWebStream(resolvedFile, { start, end });

      return new NextResponse(stream, {
        status: 206,
        headers: {
          'Content-Range': `bytes ${start}-${end}/${total}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunksize.toString(),
          'Content-Type': 'audio/mpeg',
          ETag: etag,
          'Cache-Control': CACHE_CONTROL_HEADER,
        },
      });
    }

    const stream = createFileWebStream(resolvedFile);
    return new NextResponse(stream, {
      status: 200,
      headers: {
        'Accept-Ranges': 'bytes',
        'Content-Length': total.toString(),
        'Content-Type': 'audio/mpeg',
        ETag: etag,
        'Cache-Control': CACHE_CONTROL_HEADER,
      },
    });
  } catch (error: unknown) {
    console.error('Error streaming audio:', error);
    return NextResponse.json({ error: 'Audio file not found' }, { status: 404 });
  }
}
