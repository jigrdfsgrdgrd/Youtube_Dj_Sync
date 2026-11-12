import { ChildProcess, exec } from 'child_process';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';

export interface DownloadStatus {
  status: 'idle' | 'downloading' | 'error';
  percentage: number;
  eta: string;
  videoCurrent?: number;
  videoTotal?: number;
  playlistCurrent?: number;
  playlistTotal?: number;
  error?: string;
}

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

declare global {
  var __activeDownloadProcess: ChildProcess | null | undefined;
}

export function getActiveProcess(): ChildProcess | null {
  return global.__activeDownloadProcess ?? null;
}

export function setActiveProcess(proc: ChildProcess | null) {
  global.__activeDownloadProcess = proc;
}

export async function writeStatus(statusObj: DownloadStatus) {
  const primaryPath = getProgressFilePath();
  const serialized = JSON.stringify(statusObj);
  try {
    await fs.writeFile(primaryPath, serialized, 'utf-8');
  } catch (err) {
    console.error('Failed to write progress.json:', err);
  }

  // Also ensure both next-app/progress.json and root progress.json stay in sync if applicable
  try {
    const secondaryPath = path.basename(process.cwd()) === 'next-app' 
      ? path.join(process.cwd(), '..', 'progress.json')
      : path.join(process.cwd(), 'next-app', 'progress.json');
    if (fsSync.existsSync(path.dirname(secondaryPath))) {
      await fs.writeFile(secondaryPath, serialized, 'utf-8');
    }
  } catch {}
}

export async function readStatus(): Promise<DownloadStatus> {
  const targetPath = getProgressFilePath();
  try {
    const file = await fs.readFile(targetPath, 'utf-8');
    const data: DownloadStatus = JSON.parse(file);

    // Self-healing: If status says 'downloading' but no child process is actively tracked,
    // it means the server was closed or restarted while downloading. Auto-reset to idle!
    if (data.status === 'downloading' && !global.__activeDownloadProcess) {
      console.warn('[DownloadManager] Stale downloading state detected without active process. Auto-healing to idle.');
      const idleState: DownloadStatus = { status: 'idle', percentage: 0, eta: '', videoCurrent: 0, videoTotal: 0 };
      await writeStatus(idleState);
      return idleState;
    }

    return data;
  } catch {
    return { status: 'idle', percentage: 0, eta: '' };
  }
}

export async function cancelDownload(): Promise<void> {
  const proc = getActiveProcess();
  if (proc && proc.pid) {
    console.log(`[DownloadManager] Cancelling download process PID ${proc.pid}`);
    try {
      if (process.platform === 'win32') {
        exec(`taskkill /pid ${proc.pid} /T /F`, (err) => {
          if (err) console.warn('taskkill error:', err.message);
        });
      } else {
        proc.kill('SIGTERM');
      }
    } catch (err) {
      console.error('Error killing process:', err);
    }
  }
  setActiveProcess(null);
  await writeStatus({ status: 'idle', percentage: 0, eta: '', videoCurrent: 0, videoTotal: 0 });
}
