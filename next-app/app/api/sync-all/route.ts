import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import {
  extractCleanPlaylistId,
  getConfigPath,
  QueuedTrack,
  readArchivedIds,
  resolveUnarchivedPlaylistTracks,
  runParallelTrackPool,
  runWithConcurrency,
} from '@/lib/yt-dlp-helper';
import {
  cancelDownload,
  hasActiveDownload,
  isDownloadCancelled,
  setActiveDownloadRun,
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

export async function POST() {
  try {
    const configPath = getConfigPath();
    let configData: ConfigShape;

    try {
      const file = await fs.readFile(configPath, 'utf-8');
      configData = JSON.parse(file) as ConfigShape;
    } catch (err) {
      console.error('Failed to read config.json', err);
      return NextResponse.json({ error: 'Config file not found or invalid' }, { status: 500 });
    }

    const rawPlaylistIds = Array.isArray(configData.youtube_music?.playlist_ids)
      ? configData.youtube_music.playlist_ids
      : [];

    const validIds: string[] = [];
    const seenIds = new Set<string>();
    const invalidEntries: string[] = [];

    for (const rawId of rawPlaylistIds) {
      const cleanId = typeof rawId === 'string' ? extractCleanPlaylistId(rawId) : null;
      if (!cleanId) {
        invalidEntries.push(String(rawId));
        continue;
      }
      if (!seenIds.has(cleanId)) {
        seenIds.add(cleanId);
        validIds.push(cleanId);
      }
    }

    if (invalidEntries.length > 0 || validIds.length !== rawPlaylistIds.length) {
      console.warn(
        `[sync-all] Cleaned ${rawPlaylistIds.length - validIds.length} invalid/duplicate playlist_ids entry(s):`,
        invalidEntries
      );
      if (configData.youtube_music) {
        configData.youtube_music.playlist_ids = validIds;
        await fs.writeFile(configPath, JSON.stringify(configData, null, 2)).catch((err) => {
          console.warn('[sync-all] Failed to persist cleaned playlist_ids:', err);
        });
      }
    }

    if (validIds.length === 0) {
      return NextResponse.json({ error: 'No valid playlists found in config' }, { status: 400 });
    }

    if (hasActiveDownload()) {
      await cancelDownload();
    }

    const basePath = configData.downloads?.destination_path || 'C:\\Users\\juliu\\Music\\DJ_Downloads';
    const ffmpegPath = configData.downloads?.ffmpeg_path;
    const audioQuality = configData.downloads?.audio_quality || '320';
    const concurrency =
      typeof configData.downloads?.concurrency === 'number' &&
      configData.downloads.concurrency >= 1 &&
      configData.downloads.concurrency <= 6
        ? Math.floor(configData.downloads.concurrency)
        : 3;

    setActiveDownloadRun(true);
    const playlistTotal = validIds.length;

    await writeStatus(
      {
        status: 'downloading',
        percentage: 0,
        eta: '...',
        videoCurrent: 0,
        videoTotal: 0,
        playlistCurrent: 1,
        playlistTotal,
        phase: `Checking ${playlistTotal} playlist(s)...`,
      },
      { immediate: true }
    );

    console.log(
      `Starting ${audioQuality}k CBR parallel bulk sync (${concurrency} workers) for ${playlistTotal} playlist(s)...`
    );

    void (async () => {
      try {
        const archivedIds = await readArchivedIds(path.join(basePath, 'archive.txt'));
        let resolvedCount = 0;

        const resolvedPlaylists = await runWithConcurrency(
          validIds,
          concurrency,
          async (playlistId) => {
            const res = await resolveUnarchivedPlaylistTracks({
              playlistId,
              basePath,
              archivedIds,
              ffmpegPath,
            });
            resolvedCount++;
            if (!isDownloadCancelled()) {
              void writeStatus({
                status: 'downloading',
                percentage: 0,
                eta: '...',
                videoCurrent: 0,
                videoTotal: 0,
                playlistCurrent: Math.min(resolvedCount, playlistTotal),
                playlistTotal,
                phase: `Checking playlists (${resolvedCount}/${playlistTotal})...`,
              });
            }
            return res;
          }
        );

        if (isDownloadCancelled()) return;

        const queuedTracks: QueuedTrack[] = [];
        const queuedVideoIds = new Set<string>();
        const resolveErrors: string[] = [];

        resolvedPlaylists.forEach((playlist, index) => {
          if (!playlist) return;
          if (playlist.error) {
            console.warn(
              `[sync-all] Playlist ${playlist.playlistId} resolution error: ${playlist.error}`
            );
            resolveErrors.push(`${playlist.playlistId}: ${playlist.error}`);
          }
          for (const track of playlist.tracks) {
            if (queuedVideoIds.has(track.id)) continue;
            queuedVideoIds.add(track.id);
            queuedTracks.push({
              ...track,
              playlistIndex: index + 1,
            });
          }
        });

        if (queuedTracks.length === 0) {
          if (resolveErrors.length === validIds.length && resolveErrors.length > 0) {
            await writeStatus(
              {
                status: 'error',
                percentage: 0,
                eta: '',
                videoCurrent: 0,
                videoTotal: 0,
                playlistCurrent: 0,
                playlistTotal: 0,
                error: resolveErrors[0],
              },
              { immediate: true }
            );
            return;
          }

          console.log('[sync-all] All playlists already up to date (0 unarchived tracks).');
          await writeStatus(
            {
              status: 'idle',
              percentage: 100,
              eta: '',
              videoCurrent: 0,
              videoTotal: 0,
              playlistCurrent: 0,
              playlistTotal: 0,
            },
            { immediate: true }
          );
          return;
        }

        console.log(
          `[sync-all] Found ${queuedTracks.length} unarchived track(s) across ${playlistTotal} playlist(s).`
        );

        const poolResult = await runParallelTrackPool({
          tracks: queuedTracks,
          basePath,
          ffmpegPath,
          audioQuality,
          playlistTotal,
          concurrency,
        });

        if (poolResult.cancelled || isDownloadCancelled()) return;

        if (poolResult.succeeded === 0 && poolResult.failed > 0) {
          await writeStatus(
            {
              status: 'error',
              percentage: 0,
              eta: '',
              videoCurrent: 0,
              videoTotal: 0,
              playlistCurrent: 0,
              playlistTotal: 0,
              error: poolResult.errors[0] || 'Bulk sync failed',
            },
            { immediate: true }
          );
          return;
        }

        await writeStatus(
          {
            status: 'idle',
            percentage: 100,
            eta: '',
            videoCurrent: 0,
            videoTotal: 0,
            playlistCurrent: 0,
            playlistTotal: 0,
          },
          { immediate: true }
        );
      } catch (err) {
        console.error('Background bulk sync error:', err);
        if (!isDownloadCancelled()) {
          await writeStatus(
            {
              status: 'error',
              percentage: 0,
              eta: '',
              videoCurrent: 0,
              videoTotal: 0,
              playlistCurrent: 0,
              playlistTotal: 0,
              error: err instanceof Error ? err.message : 'Bulk sync failed',
            },
            { immediate: true }
          );
        }
      } finally {
        setActiveDownloadRun(false);
      }
    })();

    return NextResponse.json({ success: true, message: 'Bulk sync started in background' });
  } catch (error) {
    console.error('Error starting bulk sync:', error);
    setActiveDownloadRun(false);
    await writeStatus(
      {
        status: 'error',
        percentage: 0,
        eta: '',
        videoCurrent: 0,
        videoTotal: 0,
        playlistCurrent: 0,
        playlistTotal: 0,
        error: error instanceof Error ? error.message : 'Failed to start bulk sync',
      },
      { immediate: true }
    );
    return NextResponse.json({ error: 'Failed to start bulk sync' }, { status: 500 });
  }
}
