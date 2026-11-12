import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import { getConfigPath, buildYtDlpArgs } from '@/lib/yt-dlp-helper';

export async function POST() {
  try {
    const configPath = getConfigPath();
    let configData;
    
    try {
      const file = await fs.readFile(configPath, 'utf-8');
      configData = JSON.parse(file);
    } catch (err) {
      console.error('Failed to read config.json', err);
      return NextResponse.json({ error: 'Config file not found or invalid' }, { status: 500 });
    }

    const playlistIds = configData.youtube_music?.playlist_ids || [];
    if (playlistIds.length === 0) {
      return NextResponse.json({ error: 'No playlists found in config' }, { status: 400 });
    }

    const basePath = configData.downloads?.destination_path || 'C:\\Users\\juliu\\Music\\DJ_Downloads';
    const ffmpegPath = configData.downloads?.ffmpeg_path;
    const audioQuality = configData.downloads?.audio_quality || '320';

    // Convert IDs to clean URLs (strip &si=... parameters)
    const urls = playlistIds.map((rawId: string) => {
      const cleanId = rawId.split(/[&?#]/)[0].trim();
      return `https://www.youtube.com/playlist?list=${cleanId}`;
    });

    const args = buildYtDlpArgs({
      basePath,
      ffmpegPath,
      audioQuality,
      urls
    });

    console.log(`Starting 320k CBR bulk sync for ${urls.length} playlists...`);

    const ytDlpProcess = spawn('yt-dlp', args);

    const progressPath = path.join(process.cwd(), 'progress.json');
    const setStatus = async (statusObj: any) => {
      try { await fs.writeFile(progressPath, JSON.stringify(statusObj)); } catch {}
    };

    const playlistTotal = urls.length;
    let playlistSeenCount = 0;
    let playlistCurrent = 1;
    let videoCurrent = 0;
    let videoTotal = 0;

    await setStatus({ 
      status: 'downloading', 
      percentage: 0, 
      eta: '...', 
      videoCurrent: 0, 
      videoTotal: 0,
      playlistCurrent: 1,
      playlistTotal 
    });

    ytDlpProcess.stdout.on('data', async (data) => {
      const text = data.toString();
      console.log(`yt-dlp: ${text.trim()}`);

      const playlistMatch = text.match(/\[download\] Downloading playlist: (.*)/i);
      if (playlistMatch) {
        playlistSeenCount++;
        playlistCurrent = Math.min(playlistSeenCount, playlistTotal);
      }

      const videoMatch = text.match(/\[download\] Downloading (?:video|item) (\d+) of (\d+)/i);
      if (videoMatch) {
        videoCurrent = parseInt(videoMatch[1], 10);
        videoTotal = parseInt(videoMatch[2], 10);
      }

      const match = text.match(/\[download\]\s+(\d+\.?\d*)%.*?ETA\s+([\d:]+)/);
      if (match) {
        await setStatus({
          status: 'downloading',
          percentage: parseFloat(match[1]),
          eta: match[2],
          videoCurrent,
          videoTotal,
          playlistCurrent,
          playlistTotal
        });
      }
    });

    ytDlpProcess.stderr.on('data', (data) => {
      console.error(`yt-dlp error: ${data.toString().trim()}`);
    });

    ytDlpProcess.on('close', async (code) => {
      console.log(`yt-dlp bulk sync process exited with code ${code}`);
      await setStatus({ 
        status: 'idle', 
        percentage: 100, 
        eta: '', 
        videoCurrent: 0, 
        videoTotal: 0,
        playlistCurrent: 0,
        playlistTotal: 0
      });
    });

    return NextResponse.json({ success: true, message: 'Bulk sync started in background' });
  } catch (error) {
    console.error('Error starting bulk sync:', error);
    return NextResponse.json({ error: 'Failed to start bulk sync' }, { status: 500 });
  }
}
