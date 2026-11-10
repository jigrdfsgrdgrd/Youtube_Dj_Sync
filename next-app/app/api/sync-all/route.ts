import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import fsSync from 'fs';

function getConfigPath(): string {
  const external = 'C:\\Users\\juliu\\.gemini\\antigravity\\scratch\\spotify-yt-sync\\config.json';
  if (fsSync.existsSync(external)) return external;
  return path.join(process.cwd(), 'config.json');
}

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

    const destPath = configData.downloads?.destination_path || 'C:\\Users\\juliu\\Music\\DJ_Downloads';
    const ffmpegPath = configData.downloads?.ffmpeg_path;
    const audioQuality = configData.downloads?.audio_quality || '320';

    const outputTemplate = path.join(destPath, '%(playlist)s', '%(artist,uploader)s - %(title)s.%(ext)s');
    const archivePath = path.join(destPath, 'archive.txt');

    // Convert IDs to URLs
    const urls = playlistIds.map((id: string) => `https://www.youtube.com/playlist?list=${id}`);

    const args = [
      '--format', 'bestaudio',
      '--extract-audio',
      '--audio-format', 'mp3',
      '--audio-quality', `${audioQuality}K`,
      '--embed-thumbnail',
      '--embed-metadata',
      '--no-overwrites',
      '--remote-components', 'ejs:github',
      '--extractor-args', 'youtube:player_client=web_embedded,web,tv',
      '--download-archive', archivePath,
      '-o', outputTemplate
    ];

    const denoPath = 'C:\\Users\\juliu\\.deno\\bin\\deno.exe';
    if (fsSync.existsSync(denoPath)) {
      args.push('--js-runtimes', `deno:${denoPath}`);
    }

    const taggerScript = path.join(process.cwd(), 'scripts', 'traktor-tagger.js');
    if (fsSync.existsSync(taggerScript)) {
      args.push('--exec', `node "${taggerScript}" {}`);
    }

    if (ffmpegPath && fsSync.existsSync(ffmpegPath)) {
      args.push('--ffmpeg-location', ffmpegPath);
    }

    // Append all URLs at the end
    args.push(...urls);

    console.log(`Starting bulk sync for ${urls.length} playlists...`);

    const ytDlpProcess = spawn('yt-dlp', args);

    const progressPath = path.join(process.cwd(), 'progress.json');
    const setStatus = async (statusObj: any) => {
      try { await fs.writeFile(progressPath, JSON.stringify(statusObj)); } catch {}
    };

    const playlistTotal = urls.length;
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

      const playlistMatch = text.match(/\[download\] Downloading playlist: (.*)/);
      if (playlistMatch) {
        // Just general logging
      }

      const videoMatch = text.match(/\[download\] Downloading video (\d+) of (\d+)/);
      if (videoMatch) {
        videoCurrent = parseInt(videoMatch[1]);
        videoTotal = parseInt(videoMatch[2]);
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
