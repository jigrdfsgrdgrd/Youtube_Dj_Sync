import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import util from 'util';
import path from 'path';

const execPromise = util.promisify(exec);

declare global {
  var __traktorPatchInProgress: boolean | undefined;
}

export async function POST() {
  if (globalThis.__traktorPatchInProgress) {
    return NextResponse.json(
      { error: 'Ein Traktor-Patch läuft bereits. Bitte kurz warten.' },
      { status: 409 }
    );
  }

  globalThis.__traktorPatchInProgress = true;
  try {
    // 1. Check if Traktor is running
    const { stdout: tasklistOut } = await execPromise('tasklist /FI "IMAGENAME eq Traktor.exe"', {
      windowsHide: true,
    });

    if (tasklistOut.toLowerCase().includes('traktor.exe')) {
      return NextResponse.json(
        {
          error:
            'Traktor ist aktuell geöffnet! Bitte schließe Traktor vollständig, bevor du die Hotcues generierst.',
        },
        { status: 400 }
      );
    }

    // 2. Run the patcher script
    const scriptPath = path.join(process.cwd(), 'scripts', 'nml-hotcue-patcher.js');
    const { stdout: patcherOut, stderr: patcherErr } = await execPromise(`node "${scriptPath}"`, {
      windowsHide: true,
    });

    if (patcherErr && patcherErr.trim() !== '') {
      console.warn('Patcher Stderr:', patcherErr);
      // We don't fail immediately because node sometimes writes to stderr for warnings
    }

    // Parse output for a nicer message if possible
    let successCount = 0;
    const match = patcherOut.match(/Erfolgreich Cues in NML geschrieben f.r: (\d+) Tracks/);
    if (match) {
      successCount = parseInt(match[1], 10);
    }

    return NextResponse.json({
      success: true,
      message: `Erfolgreich ${successCount} Tracks gepatcht!`,
      logs: patcherOut,
    });
  } catch (error: unknown) {
    console.error('Error running traktor patcher:', error);
    const message =
      error instanceof Error ? error.message : 'Ein unbekannter Fehler ist aufgetreten.';
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    globalThis.__traktorPatchInProgress = false;
  }
}
