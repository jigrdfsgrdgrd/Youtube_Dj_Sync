import { spawn } from 'child_process';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import {
  addActiveProcess,
  createLineBuffer,
  isDownloadCancelled,
  isRunActive,
  parseYtDlpLine,
  removeActiveProcess,
  writeStatus,
} from '@/lib/download-manager';
import { tagTraktorAutoLoad } from '@/lib/traktor-auto-load';

export const FILEPATH_PRINT_PREFIX = '__DJ_SYNC_FILEPATH__:';

export function getConfigPath(): string {
  const localPath = path.join(process.cwd(), 'config.json');
  if (fsSync.existsSync(localPath)) return localPath;
  const rootPath = path.join(process.cwd(), '..', 'config.json');
  if (fsSync.existsSync(rootPath)) return rootPath;
  return localPath;
}

export interface YtDlpOptions {
  basePath: string;
  ffmpegPath?: string;
  audioQuality?: string;
  urls: string[];
  /** Override target folder for output files (e.g. pre-resolved sanitized playlist dir). */
  outputDir?: string;
  /** Pass --no-playlist when downloading an already-resolved single video URL. */
  noPlaylist?: boolean;
}

export interface ResolvedTrack {
  id: string;
  title: string;
  url: string;
  playlistTitle: string;
  outputDir: string;
}

export interface ResolvedPlaylist {
  playlistId: string;
  playlistTitle: string;
  totalEntries: number;
  tracks: ResolvedTrack[];
  error?: string;
}

/**
 * Extracts and validates a YouTube playlist ID from either a URL (?list=...)
 * or a raw playlist ID string. Returns null for single-video URLs without list=
 * or malformed values (such as "^Q").
 */
export function extractCleanPlaylistId(rawInput: string): string | null {
  const trimmed = rawInput.trim();
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed);
    const listParam = parsed.searchParams.get('list')?.trim();
    if (listParam && /^[A-Za-z0-9_-]{2,}$/.test(listParam)) {
      return listParam;
    }
    return null;
  } catch {
    const candidate = trimmed.split(/[&?#]/)[0].trim();
    if (/^[A-Za-z0-9_-]{2,}$/.test(candidate)) {
      return candidate;
    }
    return null;
  }
}

export function sanitizeFolderName(name: string, fallback = 'Singles'): string {
  const trimmed = (name || '').trim();
  if (!trimmed || trimmed === 'NA') return fallback;

  const sanitized = trimmed
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/[. ]+$/g, '')
    .trim();

  if (!sanitized) return fallback;
  if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i.test(sanitized)) {
    return `_${sanitized}`;
  }
  return sanitized;
}

function appendSharedRuntimeArgs(args: string[], basePath: string, ffmpegPath?: string): void {
  const localCookies = path.join(process.cwd(), 'cookies.txt');
  const rootCookies = path.join(process.cwd(), '..', 'cookies.txt');
  const destCookies = path.join(basePath, 'cookies.txt');
  if (fsSync.existsSync(localCookies)) {
    args.push('--cookies', localCookies);
  } else if (fsSync.existsSync(rootCookies)) {
    args.push('--cookies', rootCookies);
  } else if (fsSync.existsSync(destCookies)) {
    args.push('--cookies', destCookies);
  }

  const candidateDenoPaths = [
    'C:\\Users\\juliu\\AppData\\Local\\Microsoft\\WinGet\\Links\\deno.exe',
    'C:\\Users\\juliu\\AppData\\Local\\Microsoft\\WinGet\\Packages\\DenoLand.Deno_Microsoft.Winget.Source_8wekyb3d8bbwe\\deno.exe',
    'C:\\Users\\juliu\\.deno\\bin\\deno.exe',
  ];
  const foundDeno = candidateDenoPaths.find((p) => fsSync.existsSync(p));
  if (foundDeno) {
    args.push('--js-runtimes', `deno:${foundDeno}`);
  } else {
    args.push('--js-runtimes', 'deno,node');
  }

  if (ffmpegPath && fsSync.existsSync(ffmpegPath)) {
    args.push('--ffmpeg-location', ffmpegPath);
  }
}

function resolveAudioBitrateFlag(audioQuality?: string): string {
  const cleaned = (audioQuality ?? '320').toString().trim().toLowerCase();
  const digits = cleaned.replace(/k$/i, '');
  if (/^\d+$/.test(digits)) {
    const num = parseInt(digits, 10);
    if (num >= 64 && num <= 320) {
      return `${num}k`;
    }
  }
  return '320k';
}

export function buildYtDlpArgs(opts: YtDlpOptions): string[] {
  const { basePath, ffmpegPath, audioQuality, outputDir, noPlaylist } = opts;

  const outputTemplate = outputDir
    ? path.join(outputDir, '%(artist,uploader)s - %(title)s.%(ext)s')
    : path.join(basePath, '%(playlist|Singles)s', '%(artist,uploader)s - %(title)s.%(ext)s');

  const archivePath = path.join(basePath, 'archive.txt');
  const targetBitrate = resolveAudioBitrateFlag(audioQuality);

  const args: string[] = [
    // Bestes Quell-Audio (bevorzugt Opus 251 / 256k AAC bei Premium)
    '--format',
    'bestaudio[acodec=opus]/bestaudio/best',
    '--extract-audio',
    '--audio-format',
    'mp3',
    '--audio-quality',
    '0',
    // Erzwinge CBR-Bitrate (Standard: 320k) für präzises Beatgrid & Scrubbing in Traktor
    '--postprocessor-args',
    `ExtractAudio:-b:a ${targetBitrate}`,
    // Schnellere Downloads durch parallele Fragmente
    '--concurrent-fragments',
    '4',
    // Cover & ID3-Metadaten einbetten
    '--embed-thumbnail',
    '--embed-metadata',
    // WICHTIG: Dateidatum = heutiges Download-Datum (nicht das alte YouTube-Upload-Datum!)
    '--no-mtime',
    // Einzelne gelöschte oder gesperrte Videos überspringen, damit die restliche Playlist durchläuft
    '--ignore-errors',
    '--no-abort-on-error',
    // Hotcue- & Duplikat-Schutz
    '--no-overwrites',
    '--download-archive',
    archivePath,
    // Lazy playlist pagination + Netzwerk-Timeouts & begrenzte Retries gegen Hänger
    '--lazy-playlist',
    '--socket-timeout',
    '15',
    '--retries',
    '3',
    '--fragment-retries',
    '3',
    '--extractor-retries',
    '3',
    // --print impliziert --quiet; --no-quiet & --newline erhalten Live-Progress & Phasen
    '--no-quiet',
    '--newline',
    // Live-Fortschritt mit Playlist-, Song-Titel, Prozent & ETA für das UI ausgeben
    '--progress-template',
    'download:[dj_progress] %(info.playlist_title,info.playlist|NA)s | %(info.title)s | %(progress._percent_str)s | %(progress._eta_str|...)s',
    '--print',
    `after_move:${FILEPATH_PRINT_PREFIX}%(filepath)s`,
    // Bereinige "- Topic" bei YouTube-Music-Channels & unnötige Video-Zusätze im Titel
    '--replace-in-metadata',
    'artist,uploader',
    ' - Topic$',
    '',
    '--replace-in-metadata',
    'title',
    ' ?[\\(\\[](Official|Offizielles|Music|Audio|Video|Lyrics|Lyric|HD|4K|Visualizer).*?[\\)\\]]',
    '',
    '--remote-components',
    'ejs:github',
    '-o',
    outputTemplate,
  ];

  if (noPlaylist) {
    args.push('--no-playlist');
  }

  appendSharedRuntimeArgs(args, basePath, ffmpegPath);

  args.push(...opts.urls);
  return args;
}

export async function readArchivedIds(archivePath: string): Promise<Set<string>> {
  const archived = new Set<string>();
  try {
    const content = await fs.readFile(archivePath, 'utf-8');
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const parts = line.split(/\s+/);
      const id = parts[parts.length - 1];
      if (id) archived.add(id);
    }
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException)?.code !== 'ENOENT') {
      console.warn('[yt-dlp-helper] Failed to read archive.txt:', err);
    }
  }
  return archived;
}

interface FlatPlaylistEntry {
  id?: string;
  title?: string;
  url?: string;
  webpage_url?: string;
  ie_key?: string;
}

interface FlatPlaylistJson {
  id?: string;
  title?: string;
  playlist_title?: string;
  entries?: FlatPlaylistEntry[];
}

/**
 * Resolves a playlist with `--flat-playlist --dump-single-json` and diffs entry IDs
 * against `archive.txt`, returning only unarchived tracks with their target playlist folder.
 */
export function resolveUnarchivedPlaylistTracks(params: {
  playlistId: string;
  basePath: string;
  archivedIds: Set<string>;
  ffmpegPath?: string;
  runId?: number;
}): Promise<ResolvedPlaylist> {
  const { playlistId, basePath, archivedIds, ffmpegPath, runId } = params;
  const playlistUrl = `https://www.youtube.com/playlist?list=${playlistId}`;

  const stillActive = () =>
    runId !== undefined ? isRunActive(runId) : !isDownloadCancelled();

  return new Promise((resolve) => {
    if (!stillActive()) {
      resolve({
        playlistId,
        playlistTitle: playlistId,
        totalEntries: 0,
        tracks: [],
      });
      return;
    }

    const args = [
      '--flat-playlist',
      '--dump-single-json',
      '--ignore-errors',
      '--no-warnings',
      '--socket-timeout',
      '15',
      '--retries',
      '3',
      '--extractor-retries',
      '3',
    ];
    appendSharedRuntimeArgs(args, basePath, ffmpegPath);
    args.push(playlistUrl);

    const proc = spawn('yt-dlp', args, { windowsHide: true });
    addActiveProcess(proc);

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf-8');
    });

    proc.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf-8');
    });

    proc.on('error', (err) => {
      removeActiveProcess(proc);
      resolve({
        playlistId,
        playlistTitle: playlistId,
        totalEntries: 0,
        tracks: [],
        error: err.message,
      });
    });

    proc.on('close', (code) => {
      removeActiveProcess(proc);
      if (!stillActive()) {
        resolve({
          playlistId,
          playlistTitle: playlistId,
          totalEntries: 0,
          tracks: [],
        });
        return;
      }

      if (!stdout.trim()) {
        resolve({
          playlistId,
          playlistTitle: playlistId,
          totalEntries: 0,
          tracks: [],
          error: stderr.trim() || `yt-dlp exited with code ${code ?? 'unknown'}`,
        });
        return;
      }

      try {
        const parsed = JSON.parse(stdout) as FlatPlaylistJson;
        const playlistTitle = sanitizeFolderName(
          parsed.title || parsed.playlist_title || playlistId,
          playlistId
        );
        const outputDir = path.join(basePath, playlistTitle);
        const entries = Array.isArray(parsed.entries) ? parsed.entries : [];

        const tracks: ResolvedTrack[] = [];
        for (const entry of entries) {
          if (!entry || !entry.id) continue;
          if (entry.ie_key === 'YoutubeTab') continue;
          if (entry.title === '[Private video]' || entry.title === '[Deleted video]') {
            continue;
          }
          if (archivedIds.has(entry.id)) continue;

          const trackUrl =
            entry.webpage_url && entry.webpage_url.startsWith('http')
              ? entry.webpage_url
              : entry.url && entry.url.startsWith('http')
                ? entry.url
                : `https://www.youtube.com/watch?v=${entry.id}`;

          tracks.push({
            id: entry.id,
            title: entry.title || entry.id,
            url: trackUrl,
            playlistTitle,
            outputDir,
          });
        }

        resolve({
          playlistId,
          playlistTitle,
          totalEntries: entries.length,
          tracks,
        });
      } catch (err) {
        resolve({
          playlistId,
          playlistTitle: playlistId,
          totalEntries: 0,
          tracks: [],
          error: err instanceof Error ? err.message : 'Failed to parse playlist JSON',
        });
      }
    });
  });
}

export interface SingleTargetResult {
  ok: boolean;
  taggedCount: number;
  cancelled?: boolean;
  error?: string;
}

export interface DownloadTargetCallbacks {
  onProgress?: (percentage: number, eta: string) => void;
  onPhase?: (phase: string) => void;
  onItem?: (current: number, total: number) => void;
  onPlaylist?: (title: string) => void;
  onSongTitle?: (title: string) => void;
}

export async function downloadSingleTarget(params: {
  url: string;
  basePath: string;
  ffmpegPath?: string;
  audioQuality?: string;
  outputDir?: string;
  noPlaylist?: boolean;
  runId?: number;
  callbacks?: DownloadTargetCallbacks;
}): Promise<SingleTargetResult> {
  const { url, basePath, ffmpegPath, audioQuality, outputDir, noPlaylist, runId, callbacks } =
    params;

  const stillActive = () =>
    runId !== undefined ? isRunActive(runId) : !isDownloadCancelled();

  if (!stillActive()) {
    return { ok: false, taggedCount: 0, cancelled: true };
  }

  if (outputDir) {
    await fs.mkdir(outputDir, { recursive: true }).catch(() => undefined);
  }

  const args = buildYtDlpArgs({
    basePath,
    ffmpegPath,
    audioQuality,
    urls: [url],
    outputDir,
    noPlaylist,
  });

  return new Promise((resolve) => {
    const proc = spawn('yt-dlp', args, { windowsHide: true });
    addActiveProcess(proc);

    const taggingPromises: Promise<boolean>[] = [];
    let lastError = '';
    let sawArchived = false;

    const stdoutBuf = createLineBuffer((line) => {
      const ev = parseYtDlpLine(line);
      if (!ev) return;

      switch (ev.type) {
        case 'playlist':
          callbacks?.onPlaylist?.(ev.title);
          break;
        case 'item':
          callbacks?.onItem?.(ev.current, ev.total);
          break;
        case 'dj_progress':
          if (ev.playlistName) callbacks?.onPlaylist?.(ev.playlistName);
          if (ev.songTitle) callbacks?.onSongTitle?.(ev.songTitle);
          if (ev.percentage !== undefined) {
            callbacks?.onProgress?.(ev.percentage, ev.eta ?? '...');
          }
          break;
        case 'song_title':
          callbacks?.onSongTitle?.(ev.songTitle);
          break;
        case 'archived':
          sawArchived = true;
          break;
        case 'progress':
          callbacks?.onProgress?.(ev.percentage, ev.eta);
          break;
        case 'phase':
          callbacks?.onPhase?.(ev.phase);
          break;
        case 'filepath':
          callbacks?.onPhase?.('Tagging Traktor Auto Load...');
          taggingPromises.push(tagTraktorAutoLoad(ev.filePath));
          break;
        case 'error':
          lastError = ev.message;
          break;
      }
    });

    const stderrBuf = createLineBuffer((line) => {
      const ev = parseYtDlpLine(line);
      if (ev?.type === 'error') {
        lastError = ev.message;
      } else if (line) {
        lastError = line;
      }
    });

    proc.stdout.on('data', (chunk: Buffer) => {
      stdoutBuf.push(chunk);
    });

    proc.stderr.on('data', (chunk: Buffer) => {
      stderrBuf.push(chunk);
    });

    proc.on('error', (err) => {
      removeActiveProcess(proc);
      resolve({ ok: false, taggedCount: 0, error: err.message });
    });

    proc.on('close', async (code) => {
      stdoutBuf.flush();
      stderrBuf.flush();
      removeActiveProcess(proc);

      await Promise.all(taggingPromises);

      if (!stillActive()) {
        resolve({ ok: false, taggedCount: taggingPromises.length, cancelled: true });
        return;
      }

      // With --ignore-errors, yt-dlp can exit 0 even if a single video failed
      if (code === 0 && lastError && taggingPromises.length === 0 && !sawArchived) {
        resolve({
          ok: false,
          taggedCount: 0,
          error: lastError,
        });
        return;
      }

      if (code === 0) {
        resolve({ ok: true, taggedCount: taggingPromises.length });
      } else {
        resolve({
          ok: false,
          taggedCount: taggingPromises.length,
          error: lastError || `yt-dlp exited with code ${code ?? 'unknown'}`,
        });
      }
    });
  });
}

export async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
  runId?: number
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workerCount = Math.max(1, Math.min(concurrency, items.length));

  const stillActive = () =>
    runId !== undefined ? isRunActive(runId) : !isDownloadCancelled();

  const runners = Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      if (!stillActive()) break;
      const currentIndex = nextIndex++;
      results[currentIndex] = await worker(items[currentIndex], currentIndex);
    }
  });

  await Promise.all(runners);
  return results;
}

export interface QueuedTrack extends ResolvedTrack {
  playlistIndex?: number;
}

export interface PoolRunResult {
  succeeded: number;
  failed: number;
  errors: string[];
  cancelled: boolean;
}

export async function runParallelTrackPool(params: {
  tracks: QueuedTrack[];
  basePath: string;
  ffmpegPath?: string;
  audioQuality?: string;
  playlistTotal?: number;
  concurrency?: number;
  runId?: number;
}): Promise<PoolRunResult> {
  const {
    tracks,
    basePath,
    ffmpegPath,
    audioQuality,
    playlistTotal,
    concurrency = 3,
    runId,
  } = params;

  const stillActive = () =>
    runId !== undefined ? isRunActive(runId) : !isDownloadCancelled();

  const total = tracks.length;
  if (total === 0) {
    return { succeeded: 0, failed: 0, errors: [], cancelled: false };
  }

  const activeProgress = new Map<number, number>();
  let completedCount = 0;
  let succeeded = 0;
  let failed = 0;
  const errors: string[] = [];
  let latestEta = '...';
  let latestPhase = 'Downloading...';
  let latestPlaylistName = tracks[0]?.playlistTitle ?? '';
  let latestSongTitle = tracks[0]?.title ?? '';
  let highestPlaylistIndex = playlistTotal ? 1 : undefined;

  const pushAggregateStatus = () => {
    if (!stillActive()) return;

    let progressSum = completedCount * 100;
    for (const pct of activeProgress.values()) {
      progressSum += Math.max(0, Math.min(100, pct));
    }
    const percentage = Math.min(100, Math.round((progressSum / total) * 10) / 10);

    void writeStatus({
      status: 'downloading',
      percentage,
      eta: latestEta,
      playlistName: latestPlaylistName,
      songTitle: latestSongTitle,
      videoCurrent: Math.min(completedCount + 1, total),
      videoTotal: total,
      ...(playlistTotal !== undefined
        ? { playlistCurrent: highestPlaylistIndex, playlistTotal }
        : {}),
      phase: `${latestPhase} (${completedCount}/${total})`,
    });
  };

  await runWithConcurrency(
    tracks,
    concurrency,
    async (track, idx) => {
      if (!stillActive()) return;

      activeProgress.set(idx, 0);
      latestPlaylistName = track.playlistTitle;
      latestSongTitle = track.title;
      if (track.playlistIndex && highestPlaylistIndex !== undefined) {
        highestPlaylistIndex = Math.max(highestPlaylistIndex, track.playlistIndex);
      }
      pushAggregateStatus();

      const result = await downloadSingleTarget({
        url: track.url,
        basePath,
        ffmpegPath,
        audioQuality,
        outputDir: track.outputDir,
        noPlaylist: true,
        runId,
        callbacks: {
          onPlaylist: (title) => {
            if (title) latestPlaylistName = title;
          },
          onSongTitle: (title) => {
            if (title) latestSongTitle = title;
          },
          onProgress: (pct, eta) => {
            activeProgress.set(idx, pct);
            if (eta && eta !== 'Unknown') {
              latestEta = eta;
            }
            latestPhase = 'Downloading';
            pushAggregateStatus();
          },
          onPhase: (phase) => {
            latestPhase = phase;
            pushAggregateStatus();
          },
        },
      });

      activeProgress.delete(idx);
      completedCount++;

      if (result.cancelled || !stillActive()) return;

      if (result.ok) {
        succeeded++;
      } else {
        failed++;
        if (result.error) {
          errors.push(`${track.title}: ${result.error}`);
        }
      }
      pushAggregateStatus();
    },
    runId
  );

  return {
    succeeded,
    failed,
    errors,
    cancelled: !stillActive(),
  };
}
