import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import fs from 'fs/promises';
import fsSync from 'fs';
import { getConfigPath, buildYtDlpArgs } from '@/lib/yt-dlp-helper';
import { setActiveProcess, writeStatus, getActiveProcess, cancelDownload } from '@/lib/download-manager';

export async function POST(req: Request) {
  try {
    const { url } = await req.json();
    
    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    // Falls bereits ein Download läuft, diesen vorher beenden
    if (getActiveProcess()) {
      await cancelDownload();
    }

    // Extract clean Playlist ID (strip &si=... share params)
    let playlistId = url.trim();
    try {
      const urlObj = new URL(playlistId);
      const listParam = urlObj.searchParams.get('list');
      if (listParam) playlistId = listParam;
    } catch {
      playlistId = playlistId.split(/[&?#]/)[0].trim();
    }

    // Add to config.json and get basePath + ffmpegPath
    const configPath = getConfigPath();
    let basePath = 'C:\\Users\\juliu\\Music\\DJ_Downloads';
    let ffmpegPath: string | undefined;
    let audioQuality = '320';

    try {
      if (fsSync.existsSync(configPath)) {
        const file = await fs.readFile(configPath, 'utf-8');
        const configData = JSON.parse(file);
        
        if (configData.downloads?.destination_path) {
          basePath = configData.downloads.destination_path;
        }
        if (configData.downloads?.ffmpeg_path) {
          ffmpegPath = configData.downloads.ffmpeg_path;
        }
        if (configData.downloads?.audio_quality) {
          audioQuality = configData.downloads.audio_quality;
        }
        
        if (!configData.youtube_music) configData.youtube_music = { playlist_ids: [] };
        if (!configData.youtube_music.playlist_ids) configData.youtube_music.playlist_ids = [];
        
        // Check if playlistId is already in config (ignoring &si= suffixes)
        const alreadyExists = configData.youtube_music.playlist_ids.some(
          (id: string) => id.split(/[&?#]/)[0] === playlistId
        );
        if (!alreadyExists) {
          configData.youtube_music.playlist_ids.push(playlistId);
          await fs.writeFile(configPath, JSON.stringify(configData, null, 2));
          console.log(`Added ${playlistId} to config.json`);
        }
      }
    } catch (err) {
      console.error('Failed to update config.json:', err);
    }

    console.log(`Starting 320k CBR DJ download for: ${url}`);

    const args = buildYtDlpArgs({
      basePath,
      ffmpegPath,
      audioQuality,
      urls: [url]
    });

    const ytDlpProcess = spawn('yt-dlp', args);
    setActiveProcess(ytDlpProcess);

    await writeStatus({ status: 'downloading', percentage: 0, eta: '...', videoCurrent: 0, videoTotal: 0 });

    let videoCurrent = 0;
    let videoTotal = 0;

    ytDlpProcess.stdout.on('data', async (data) => {
      const text = data.toString();
      console.log(`yt-dlp: ${text.trim()}`);
      
      const videoMatch = text.match(/\[download\] Downloading (?:video|item) (\d+) of (\d+)/i);
      if (videoMatch) {
        videoCurrent = parseInt(videoMatch[1], 10);
        videoTotal = parseInt(videoMatch[2], 10);
      }
      
      const match = text.match(/\[download\]\s+(\d+\.?\d*)%.*?ETA\s+([\d:]+)/);
      if (match) {
        await writeStatus({
          status: 'downloading',
          percentage: parseFloat(match[1]),
          eta: match[2],
          videoCurrent,
          videoTotal
        });
      }
    });

    ytDlpProcess.stderr.on('data', (data) => {
      console.error(`yt-dlp error: ${data.toString().trim()}`);
    });

    ytDlpProcess.on('error', async (err) => {
      console.error('yt-dlp spawn/execution error:', err);
      setActiveProcess(null);
      await writeStatus({ status: 'idle', percentage: 0, eta: '', videoCurrent: 0, videoTotal: 0 });
    });

    ytDlpProcess.on('close', async (code) => {
      console.log(`yt-dlp process exited with code ${code}`);
      setActiveProcess(null);
      await writeStatus({ status: 'idle', percentage: 100, eta: '', videoCurrent: 0, videoTotal: 0 });
    });

    return NextResponse.json({ success: true, message: 'Download started in background' });
  } catch (error) {
    console.error('Error starting download:', error);
    setActiveProcess(null);
    await writeStatus({ status: 'idle', percentage: 0, eta: '', videoCurrent: 0, videoTotal: 0 });
    return NextResponse.json({ error: 'Failed to start download' }, { status: 500 });
  }
}
