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
    let playlistName = '';
    let songTitle = '';
    let videoCurrent = 0;
    let videoTotal = 0;
    let percentage = 0;

    await setStatus({ 
      status: 'downloading', 
      percentage: 0, 
      playlistName: '',
      songTitle: 'Initialisiere...',
      videoCurrent: 0, 
      videoTotal: 0,
      playlistCurrent: 1,
      playlistTotal 
    });

    ytDlpProcess.stdout.on('data', async (data) => {
      const text = data.toString();
      console.log(`yt-dlp: ${text.trim()}`);

      let stateChanged = false;

      // 1. Playlist-Name
      const playlistMatch = text.match(/\[download\] Downloading playlist:\s*(.+)/i);
      if (playlistMatch) {
        playlistName = playlistMatch[1].trim();
        playlistSeenCount++;
        playlistCurrent = Math.min(playlistSeenCount, playlistTotal);
        stateChanged = true;
      }

      // 2. Video-Index in Playlist
      const videoMatch = text.match(/\[download\] Downloading (?:video|item) (\d+) of (\d+)/i);
      if (videoMatch) {
        videoCurrent = parseInt(videoMatch[1], 10);
        videoTotal = parseInt(videoMatch[2], 10);
        stateChanged = true;
      }

      // 3. Eigener dj_progress Tag via --progress-template
      const djProgressMatch = text.match(/\[dj_progress\]\s*([^|\r\n]+?)\s*\|\s*([^|\r\n]+?)\s*\|\s*([\d.]+)%/);
      if (djProgressMatch) {
        const pl = djProgressMatch[1].trim();
        if (pl && pl !== 'NA') playlistName = pl;
        const song = djProgressMatch[2].trim();
        if (song && song !== 'NA') songTitle = song;
        const pct = parseFloat(djProgressMatch[3]);
        if (!isNaN(pct)) percentage = pct;
        stateChanged = true;
      }

      // 4. Fallback Song-Titel aus Ziel- oder Archivzeile
      const archiveMatch = text.match(/\[download\]\s+[a-zA-Z0-9_-]{11}:\s+(.+?)\s+has already been recorded in the archive/i);
      if (archiveMatch) {
        songTitle = archiveMatch[1].trim();
        stateChanged = true;
      }

      const destMatch = text.match(/\[download\] Destination:\s*(?:.*[\\/])?([^\\/]+)\.[a-zA-Z0-9]+$/m);
      if (destMatch) {
        songTitle = destMatch[1].trim();
        stateChanged = true;
      }

      // 5. Standard Download Prozentwert
      const pctMatch = text.match(/\[download\]\s+(\d+\.?\d*)%/);
      if (pctMatch) {
        percentage = parseFloat(pctMatch[1]);
        stateChanged = true;
      }

      if (stateChanged) {
        await setStatus({
          status: 'downloading',
          percentage,
          playlistName,
          songTitle,
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
        playlistName: '',
        songTitle: '',
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
