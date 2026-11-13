import { ChildProcess, exec } from 'child_process';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';

export interface DownloadStatus {
  status: 'idle' | 'downloading' | 'error';
  percentage: number;
  eta: string;
  playlistName?: string;
  songTitle?: string;
  videoCurrent?: number;
  videoTotal?: number;
  playlistCurrent?: number;
  playlistTotal?: number;
  error?: string;
  phase?: string;
}

export const IDLE_STATUS: DownloadStatus = {
  status: 'idle',
  percentage: 0,
  eta: '',
  playlistName: '',
  songTitle: '',
  videoCurrent: 0,
  videoTotal: 0,
};

const WRITE_THROTTLE_MS = 250;

export function getProgressFilePath(): string {
  if (path.basename(process.cwd()) === 'next-app') {
    return path.join(process.cwd(), 'progress.json');
  }
  const nextAppPath = path.join(process.cwd(), 'next-app', 'progress.json');
  if (fsSync.existsSync(nextAppPath)) {
    return nextAppPath;
  }
  return path.join(process.cwd(), 'progress.json');
}

function getSecondaryProgressFilePath(): string {
  return path.basename(process.cwd()) === 'next-app'
    ? path.join(process.cwd(), '..', 'progress.json')
    : path.join(process.cwd(), 'next-app', 'progress.json');
}

declare global {
  var __activeDownloadProcess: ChildProcess | null | undefined;
  var __activeDownloadProcesses: Set<ChildProcess> | undefined;
  var __activeDownloadRun: boolean | undefined;
  var __activeDownloadRunId: number | undefined;
  var __downloadCancelled: boolean | undefined;
  var __liveDownloadStatus: DownloadStatus | undefined;
  var __lastStatusDiskWriteAt: number | undefined;
  var __statusWriteTimer: ReturnType<typeof setTimeout> | null | undefined;
  var __statusWriteChain: Promise<void> | undefined;
}

function getProcessSet(): Set<ChildProcess> {
  if (!global.__activeDownloadProcesses) {
    global.__activeDownloadProcesses = new Set<ChildProcess>();
  }
  return global.__activeDownloadProcesses;
}

export function getActiveProcess(): ChildProcess | null {
  if (global.__activeDownloadProcess) {
    return global.__activeDownloadProcess;
  }
  const first = getProcessSet().values().next();
  return first.done ? null : first.value;
}

export function getActiveProcesses(): ChildProcess[] {
  const procs = new Set<ChildProcess>(getProcessSet());
  if (global.__activeDownloadProcess) {
    procs.add(global.__activeDownloadProcess);
  }
  return Array.from(procs);
}

export function hasActiveDownload(): boolean {
  return Boolean(global.__activeDownloadRun) || getActiveProcesses().length > 0;
}

export function setActiveProcess(proc: ChildProcess | null) {
  const procs = getProcessSet();
  if (proc) {
    procs.add(proc);
    global.__activeDownloadProcess = proc;
  } else {
    procs.clear();
    global.__activeDownloadProcess = null;
  }
}

export function addActiveProcess(proc: ChildProcess) {
  getProcessSet().add(proc);
  if (!global.__activeDownloadProcess) {
    global.__activeDownloadProcess = proc;
  }
}

export function removeActiveProcess(proc: ChildProcess) {
  const procs = getProcessSet();
  procs.delete(proc);
  if (global.__activeDownloadProcess === proc) {
    const next = procs.values().next();
    global.__activeDownloadProcess = next.done ? null : next.value;
  }
}

export function startDownloadRun(): number {
  const nextId = (global.__activeDownloadRunId ?? 0) + 1;
  global.__activeDownloadRunId = nextId;
  global.__activeDownloadRun = true;
  global.__downloadCancelled = false;
  return nextId;
}

export function finishDownloadRun(runId: number): void {
  if (global.__activeDownloadRunId === runId) {
    global.__activeDownloadRun = false;
  }
}

export function isRunActive(runId: number): boolean {
  return !isDownloadCancelled() && global.__activeDownloadRunId === runId;
}

export function setActiveDownloadRun(active: boolean) {
  if (active) {
    startDownloadRun();
  } else {
    global.__activeDownloadRun = false;
  }
}

export function isDownloadCancelled(): boolean {
  return Boolean(global.__downloadCancelled);
}

async function atomicWriteFile(targetPath: string, content: string): Promise<void> {
  const tmpPath = `${targetPath}.${process.pid}.${Date.now()}.tmp`;
  try {
    await fs.writeFile(tmpPath, content, 'utf-8');
    await fs.rename(tmpPath, targetPath);
  } catch {
    try {
      await fs.unlink(tmpPath);
    } catch {
      // ignore temp cleanup failure
    }
    // Fallback if Windows antivirus locks rename target briefly
    await fs.writeFile(targetPath, content, 'utf-8');
  }
}

function enqueueDiskFlush(statusSnapshot: DownloadStatus): Promise<void> {
  const serialized = JSON.stringify(statusSnapshot);
  const primaryPath = getProgressFilePath();
  const secondaryPath = getSecondaryProgressFilePath();

  const run = async () => {
    global.__lastStatusDiskWriteAt = Date.now();
    try {
      await atomicWriteFile(primaryPath, serialized);
    } catch (err) {
      console.error('Failed to write progress.json:', err);
    }

    if (secondaryPath !== primaryPath) {
      try {
        await fs.access(path.dirname(secondaryPath));
        await atomicWriteFile(secondaryPath, serialized);
      } catch {
        // secondary directory not present or inaccessible
      }
    }
  };

  const chain = (global.__statusWriteChain ?? Promise.resolve()).then(run, run);
  global.__statusWriteChain = chain;
  return chain;
}

export async function writeStatus(
  statusObj: DownloadStatus,
  options?: { immediate?: boolean }
): Promise<void> {
  const prevStatus = global.__liveDownloadStatus?.status;
  const nextSnapshot: DownloadStatus = { ...statusObj };
  global.__liveDownloadStatus = nextSnapshot;

  const isStateTransition = prevStatus !== nextSnapshot.status;
  const isTerminal = nextSnapshot.status !== 'downloading';
  const elapsed = Date.now() - (global.__lastStatusDiskWriteAt ?? 0);
  const shouldFlushNow =
    Boolean(options?.immediate) ||
    isStateTransition ||
    isTerminal ||
    elapsed >= WRITE_THROTTLE_MS;

  if (shouldFlushNow) {
    if (global.__statusWriteTimer) {
      clearTimeout(global.__statusWriteTimer);
      global.__statusWriteTimer = null;
    }
    await enqueueDiskFlush(nextSnapshot);
    return;
  }

  if (!global.__statusWriteTimer) {
    const delay = Math.max(25, WRITE_THROTTLE_MS - elapsed);
    global.__statusWriteTimer = setTimeout(() => {
      global.__statusWriteTimer = null;
      const latest = global.__liveDownloadStatus;
      if (latest) {
        void enqueueDiskFlush({ ...latest });
      }
    }, delay);
  }
}

export async function readStatus(): Promise<DownloadStatus> {
  if (global.__liveDownloadStatus) {
    if (global.__liveDownloadStatus.status === 'downloading' && !hasActiveDownload()) {
      console.warn(
        '[DownloadManager] Stale in-memory downloading state without active process. Auto-healing to idle.'
      );
      const healed = { ...IDLE_STATUS };
      await writeStatus(healed, { immediate: true });
      return healed;
    }
    return { ...global.__liveDownloadStatus };
  }

  const targetPath = getProgressFilePath();
  try {
    const file = await fs.readFile(targetPath, 'utf-8');
    const data: DownloadStatus = JSON.parse(file);

    // Self-healing: If status says 'downloading' but no child process/run is actively tracked,
    // it means the server was closed or restarted while downloading. Auto-reset to idle!
    if (data.status === 'downloading' && !hasActiveDownload()) {
      console.warn(
        '[DownloadManager] Stale downloading state detected without active process. Auto-healing to idle.'
      );
      const idleState = { ...IDLE_STATUS };
      await writeStatus(idleState, { immediate: true });
      return idleState;
    }

    global.__liveDownloadStatus = data;
    return { ...data };
  } catch {
    return { ...IDLE_STATUS };
  }
}

function killProcessAndAwaitExit(proc: ChildProcess, timeoutMs = 5000): Promise<void> {
  return new Promise((resolve) => {
    if (proc.exitCode !== null || proc.signalCode !== null) {
      resolve();
      return;
    }

    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve();
    };

    const timer = setTimeout(() => {
      try {
        proc.kill('SIGKILL');
      } catch {
        // ignore
      }
      finish();
    }, timeoutMs);

    proc.once('close', finish);
    proc.once('exit', finish);

    try {
      if (process.platform === 'win32' && proc.pid) {
        exec(`taskkill /pid ${proc.pid} /T /F`, (err) => {
          if (err && proc.exitCode === null) {
            console.warn(`taskkill warning for PID ${proc.pid}:`, err.message);
          }
          setTimeout(finish, 150);
        });
      } else {
        proc.kill('SIGTERM');
      }
    } catch (err) {
      console.error('Error killing process:', err);
      finish();
    }
  });
}

export async function cancelDownload(): Promise<void> {
  global.__downloadCancelled = true;
  global.__activeDownloadRun = false;

  if (global.__statusWriteTimer) {
    clearTimeout(global.__statusWriteTimer);
    global.__statusWriteTimer = null;
  }

  const procs = getActiveProcesses();
  if (procs.length > 0) {
    console.log(
      `[DownloadManager] Cancelling ${procs.length} active download process(es): ${procs
        .map((p) => p.pid)
        .filter(Boolean)
        .join(', ')}`
    );
    await Promise.all(procs.map((proc) => killProcessAndAwaitExit(proc)));
  }

  getProcessSet().clear();
  global.__activeDownloadProcess = null;

  await writeStatus({ ...IDLE_STATUS }, { immediate: true });
}

export type YtDlpParsedEvent =
  | { type: 'playlist'; title: string }
  | { type: 'item'; current: number; total: number }
  | {
      type: 'dj_progress';
      playlistName?: string;
      songTitle?: string;
      percentage?: number;
      eta?: string;
    }
  | { type: 'song_title'; songTitle: string }
  | { type: 'archived' }
  | { type: 'progress'; percentage: number; eta: string }
  | { type: 'phase'; phase: string }
  | { type: 'filepath'; filePath: string }
  | { type: 'error'; message: string };

export function createLineBuffer(onLine: (line: string) => void): {
  push: (chunk: Buffer | string) => void;
  flush: () => void;
} {
  let buffer = '';

  const push = (chunk: Buffer | string) => {
    buffer += typeof chunk === 'string' ? chunk : chunk.toString('utf-8');
    let start = 0;
    for (let i = 0; i < buffer.length; i++) {
      const ch = buffer[i];
      if (ch === '\n' || ch === '\r') {
        const line = buffer.slice(start, i).trim();
        if (line.length > 0) {
          onLine(line);
        }
        if (ch === '\r' && buffer[i + 1] === '\n') {
          i++;
        }
        start = i + 1;
      }
    }
    buffer = buffer.slice(start);
  };

  const flush = () => {
    const remaining = buffer.trim();
    buffer = '';
    if (remaining.length > 0) {
      onLine(remaining);
    }
  };

  return { push, flush };
}

const FILEPATH_PREFIX = '__DJ_SYNC_FILEPATH__:';

export function parseYtDlpLine(line: string): YtDlpParsedEvent | null {
  if (line.startsWith(FILEPATH_PREFIX)) {
    const filePath = line.slice(FILEPATH_PREFIX.length).trim();
    if (filePath) {
      return { type: 'filepath', filePath };
    }
  }

  const djProgressMatch = line.match(
    /\[dj_progress\]\s*([^|\r\n]*?)\s*\|\s*([^|\r\n]*?)\s*\|\s*([^|\r\n]*?)(?:\s*\|\s*([^|\r\n]*))?$/i
  );
  if (djProgressMatch) {
    const rawPlaylist = djProgressMatch[1].trim();
    const rawSong = djProgressMatch[2].trim();
    const rawPct = djProgressMatch[3].trim();
    const rawEta = djProgressMatch[4]?.trim();
    const pctMatch = rawPct.match(/(\d+(?:\.\d+)?)/);
    const parsedPct = pctMatch ? parseFloat(pctMatch[1]) : undefined;

    return {
      type: 'dj_progress',
      playlistName: rawPlaylist && rawPlaylist !== 'NA' ? rawPlaylist : undefined,
      songTitle: rawSong && rawSong !== 'NA' ? rawSong : undefined,
      percentage: parsedPct !== undefined && !Number.isNaN(parsedPct) ? parsedPct : undefined,
      eta: rawEta && rawEta !== 'NA' && rawEta !== 'Unknown' ? rawEta : undefined,
    };
  }

  const playlistMatch = line.match(/\[download\]\s+Downloading playlist:\s*(.+)/i);
  if (playlistMatch) {
    return { type: 'playlist', title: playlistMatch[1].trim() };
  }

  const itemMatch = line.match(/\[download\]\s+Downloading (?:video|item) (\d+) of (\d+)/i);
  if (itemMatch) {
    return {
      type: 'item',
      current: parseInt(itemMatch[1], 10),
      total: parseInt(itemMatch[2], 10),
    };
  }

  const archiveMatch = line.match(
    /\[download\]\s+[a-zA-Z0-9_-]{11}:\s+(.+?)\s+has already been recorded in the archive/i
  );
  if (archiveMatch) {
    return { type: 'archived' };
  }

  const destMatch = line.match(/\[download\]\s+Destination:\s*(?:.*[\\/])?([^\\/]+)\.[a-zA-Z0-9]+$/i);
  if (destMatch) {
    return { type: 'song_title', songTitle: destMatch[1].trim() };
  }

  const progressMatch = line.match(/\[download\]\s+(\d+(?:\.\d+)?)%.*?ETA\s+([^\s]+)/i);
  if (progressMatch) {
    return {
      type: 'progress',
      percentage: parseFloat(progressMatch[1]),
      eta: progressMatch[2],
    };
  }

  if (/\[download\]\s+100(?:\.0+)?%\s+of\s+/i.test(line)) {
    return { type: 'progress', percentage: 100, eta: '00:00' };
  }

  if (line.includes('[ExtractAudio]')) {
    return { type: 'phase', phase: 'Converting to 320k MP3...' };
  }

  if (line.includes('[EmbedThumbnail]') || line.includes('[ThumbnailsConvertor]')) {
    return { type: 'phase', phase: 'Embedding cover art...' };
  }

  if (line.includes('[Metadata]') || line.includes('[ModifyChapters]')) {
    return { type: 'phase', phase: 'Writing ID3 metadata...' };
  }

  const errorMatch = line.match(/^(?:ERROR|yt-dlp:\s*error):\s*(.+)/i);
  if (errorMatch) {
    return { type: 'error', message: errorMatch[1].trim() };
  }

  return null;
}
