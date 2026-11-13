import { NextResponse } from 'next/server';
import { readStatus, cancelDownload } from '@/lib/download-manager';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const status = await readStatus();
    return NextResponse.json(status);
  } catch {
    return NextResponse.json({ status: 'idle', percentage: 0, playlistName: '', songTitle: '' });
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { action?: unknown };
    if (body.action === 'cancel' || body.action === 'reset') {
      await cancelDownload();
      return NextResponse.json({ success: true, message: 'Download abgebrochen / zurückgesetzt.' });
    }
    return NextResponse.json({ error: 'Unbekannte Aktion' }, { status: 400 });
  } catch {
    await cancelDownload();
    return NextResponse.json({ success: true, message: 'Status zurückgesetzt.' });
  }
}
