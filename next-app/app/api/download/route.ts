import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import {
  downloadSingleTarget,
  extractCleanPlaylistId,
  getConfigPath,
  readArchivedIds,
  resolveUnarchivedPlaylistTracks,
  runParallelTrackPool,
} from '@/lib/yt-dlp-helper';
import {
  cancelDownload,
  finishDownloadRun,
  hasActiveDownload,
  IDLE_STATUS,
  isRunActive,
  startDownloadRun,
  writeStatus,
} from '@/lib/download-manager';

interface ConfigShape {
  youtube_music?: {
    playlist_ids?: string[];
    [key: string]: unknown;
  };
  downloads?: {
    destination_path?: string;
    ffmpeg_path?: string;
    audio_quality?: string;
    concurrency?: number;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export async function POST(req: Request) {
  let runId: number | undefined;

  try {
    const body = (await req.json().catch(() => ({}))) as { url?: unknown };
    const trimmedUrl = typeof body.url === 'string' ? body.url.trim() : '';

    if (!trimmedUrl) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    if (hasActiveDownload()) {
      await cancelDownload();
    }

    const playlistId = extractCleanPlaylistId(trimmedUrl);

    const configPath = getConfigPath();
    let basePath = 'C:\\Users\\juliu\\Music\\DJ_Downloads';
    let ffmpegPath: string | undefined;
    let audioQuality = '320';
    let concurrency = 3;

    try {
      const file = await fs.readFile(configPath, 'utf-8');
      const configData = JSON.parse(file) as ConfigShape;

      if (configData.downloads?.destination_path) {
        basePath = configData.downloads.destination_path;
      }
      if (configData.downloads?.ffmpeg_path) {
        ffmpegPath = configData.downloads.ffmpeg_path;
      }
      if (configData.downloads?.audio_quality) {
        audioQuality = configData.downloads.audio_quality;
      }
      if (
        typeof configData.downloads?.concurrency === 'number' &&
        configData.downloads.concurrency >= 1 &&
        configData.downloads.concurrency <= 6
      ) {
        concurrency = Math.floor(configData.downloads.concurrency);
      }

      // Only persist valid playlist IDs (never raw single-video watch URLs)
      if (playlistId) {
        if (!configData.youtube_music) configData.youtube_music = { playlist_ids: [] };
        if (!Array.isArray(configData.youtube_music.playlist_ids)) {
          configData.youtube_music.playlist_ids = [];
        }

        const alreadyExists = configData.youtube_music.playlist_ids.some(
          (entry) => extractCleanPlaylistId(entry) === playlistId
        );
        if (!alreadyExists) {
          configData.youtube_music.playlist_ids.push(playlistId);
          await fs.writeFile(configPath, JSON.stringify(configData, null, 2));
          console.log(`Added playlist ${playlistId} to config.json`);
        }
      }
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException)?.code !== 'ENOENT') {
        console.error('Failed to read/update config.json:', err);
      }
    }

    const activeRunId = startDownloadRun();
    runId = activeRunId;

    await writeStatus(
      {
        status: 'downloading',
        percentage: 0,
        eta: '...',
        playlistName: '',
        songTitle: 'Initialisiere...',
        videoCurrent: 0,
        videoTotal: 0,
        phase: playlistId ? 'Checking playlist...' : 'Starting download...',
      },
      { immediate: true }
    );

    console.log(
      `Starting ${audioQuality}k CBR DJ download for: ${trimmedUrl} (playlistId=${playlistId ?? 'none'})`
    );

    void (async () => {
      try {
        if (playlistId) {
          const archivedIds = await readArchivedIds(path.join(basePath, 'archive.txt'));
          const resolved = await resolveUnarchivedPlaylistTracks({
            playlistId,
            basePath,
            archivedIds,
            ffmpegPath,
            runId: activeRunId,
          });

          if (!isRunActive(activeRunId)) return;

          if (!resolved.error) {
            if (resolved.tracks.length === 0) {
              await writeStatus({ ...IDLE_STATUS, percentage: 100 }, { immediate: true });
              return;
            }

            const poolResult = await runParallelTrackPool({
              tracks: resolved.tracks,
              basePath,
              ffmpegPath,
              audioQuality,
              concurrency,
              runId: activeRunId,
            });

            if (poolResult.cancelled || !isRunActive(activeRunId)) return;

            if (poolResult.succeeded === 0 && poolResult.failed > 0) {
              await writeStatus(
                {
                  ...IDLE_STATUS,
                  status: 'error',
                  error: poolResult.errors[0] || 'Download failed',
                },
                { immediate: true }
              );
              return;
            }

            await writeStatus({ ...IDLE_STATUS, percentage: 100 }, { immediate: true });
            return;
          }

          console.warn(
            `Flat playlist resolution failed for ${playlistId} (${resolved.error}); falling back to direct yt-dlp.`
          );
        }

        let playlistName = '';
        let songTitle = '';
        let videoCurrent = 0;
        let videoTotal = 0;
        let latestPercentage = 0;
        let latestEta = '...';

        const singleResult = await downloadSingleTarget({
          url: trimmedUrl,
          basePath,
          ffmpegPath,
          audioQuality,
          noPlaylist: !playlistId,
          runId: activeRunId,
          callbacks: {
            onPlaylist: (title) => {
              playlistName = title;
            },
            onSongTitle: (title) => {
              songTitle = title;
            },
            onItem: (current, total) => {
              videoCurrent = current;
              videoTotal = total;
            },
            onProgress: (percentage, eta) => {
              latestPercentage = percentage;
              latestEta = eta;
              if (!isRunActive(activeRunId)) return;
              void writeStatus({
                status: 'downloading',
                percentage,
                eta,
                playlistName,
                songTitle,
                videoCurrent,
                videoTotal,
                phase: 'Downloading',
              });
            },
            onPhase: (phase) => {
              if (!isRunActive(activeRunId)) return;
              void writeStatus({
                status: 'downloading',
                percentage: latestPercentage,
                eta: latestEta,
                playlistName,
                songTitle,
                videoCurrent,
                videoTotal,
                phase,
              });
            },
          },
        });

        if (singleResult.cancelled || !isRunActive(activeRunId)) return;

        if (!singleResult.ok) {
          await writeStatus(
            {
              ...IDLE_STATUS,
              status: 'error',
              error: singleResult.error || 'Download failed',
            },
            { immediate: true }
          );
          return;
        }

        await writeStatus({ ...IDLE_STATUS, percentage: 100 }, { immediate: true });
      } catch (err) {
        console.error('Background download error:', err);
        if (isRunActive(activeRunId)) {
          await writeStatus(
            {
              ...IDLE_STATUS,
              status: 'error',
              error: err instanceof Error ? err.message : 'Download failed',
            },
            { immediate: true }
          );
        }
      } finally {
        finishDownloadRun(activeRunId);
      }
    })();

    return NextResponse.json({ success: true, message: 'Download started in background' });
  } catch (error) {
    console.error('Error starting download:', error);
    if (runId !== undefined) {
      finishDownloadRun(runId);
    }
    await writeStatus(
      {
        ...IDLE_STATUS,
        status: 'error',
        error: error instanceof Error ? error.message : 'Failed to start download',
      },
      { immediate: true }
    );
    return NextResponse.json({ error: 'Failed to start download' }, { status: 500 });
  }
}
