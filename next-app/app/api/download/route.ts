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

export async function POST(req: Request) {
  try {
    const { url } = await req.json();
    
    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    // Extract Playlist ID
    let playlistId = url;
    try {
      const urlObj = new URL(url);
      const listParam = urlObj.searchParams.get('list');
      if (listParam) playlistId = listParam;
    } catch (e) {
      // Not a valid URL, might be just the ID
    }

    // Add to config.json and get basePath
    const configPath = getConfigPath();
    let basePath = 'C:\\Users\\juliu\\Music\\DJ_Downloads';
    try {
      if (fsSync.existsSync(configPath)) {
        const file = await fs.readFile(configPath, 'utf-8');
        const configData = JSON.parse(file);
        
        if (configData.downloads?.destination_path) {
          basePath = configData.downloads.destination_path;
        }
        
        if (!configData.youtube_music) configData.youtube_music = { playlist_ids: [] };
        if (!configData.youtube_music.playlist_ids) configData.youtube_music.playlist_ids = [];
        
        if (!configData.youtube_music.playlist_ids.includes(playlistId)) {
          configData.youtube_music.playlist_ids.push(playlistId);
          await fs.writeFile(configPath, JSON.stringify(configData, null, 2));
          console.log(`Added ${playlistId} to config.json`);
        }
      }
    } catch (err) {
      console.error('Failed to update config.json:', err);
    }
    const outputTemplate = path.join(basePath, '%(playlist)s', '%(artist,uploader)s - %(title)s.%(ext)s');
    const archivePath = path.join(basePath, 'archive.txt');

    console.log(`Starting DJ download for: ${url}`);
    
    // Spawn yt-dlp arguments
    const args = [
      '--format', 'bestaudio',
      '--extract-audio', 
      '--audio-format', 'mp3',
      '--embed-thumbnail',
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

    args.push(url);

    // Spawn yt-dlp
    const ytDlpProcess = spawn('yt-dlp', args);

    const progressPath = path.join(process.cwd(), 'progress.json');
    const setStatus = async (statusObj: any) => {
      try { await fs.writeFile(progressPath, JSON.stringify(statusObj)); } catch {}
    };

    await setStatus({ status: 'downloading', percentage: 0, eta: '...', videoCurrent: 0, videoTotal: 0 });

    let videoCurrent = 0;
    let videoTotal = 0;

    ytDlpProcess.stdout.on('data', async (data) => {
      const text = data.toString();
      console.log(`yt-dlp: ${text.trim()}`);
      
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
          videoTotal
        });
      }
    });

    ytDlpProcess.stderr.on('data', (data) => {
      console.error(`yt-dlp error: ${data.toString().trim()}`);
    });

    ytDlpProcess.on('close', async (code) => {
      console.log(`yt-dlp process exited with code ${code}`);
      await setStatus({ status: 'idle', percentage: 100, eta: '', videoCurrent: 0, videoTotal: 0 });
    });

    return NextResponse.json({ success: true, message: 'Download started in background' });
  } catch (error) {
    console.error('Error starting download:', error);
    return NextResponse.json({ error: 'Failed to start download' }, { status: 500 });
  }
}
