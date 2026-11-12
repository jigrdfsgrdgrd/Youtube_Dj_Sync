import path from 'path';
import fsSync from 'fs';

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
}

export function buildYtDlpArgs(opts: YtDlpOptions): string[] {
  const { basePath, ffmpegPath } = opts;

  const outputTemplate = path.join(
    basePath,
    '%(playlist)s',
    '%(artist,uploader)s - %(title)s.%(ext)s'
  );
  const archivePath = path.join(basePath, 'archive.txt');

  const args: string[] = [
    // Bestes Quell-Audio (bevorzugt Opus 251 / 256k AAC bei Premium)
    '--format', 'bestaudio[acodec=opus]/bestaudio/best',
    '--extract-audio',
    '--audio-format', 'mp3',
    '--audio-quality', '0',
    // Erzwinge echte 320 kbps CBR für präzises Beatgrid & Scrubbing in Traktor
    '--postprocessor-args', 'ExtractAudio:-b:a 320k',
    // Schnellere Downloads durch parallele Fragmente
    '--concurrent-fragments', '4',
    // Cover & ID3-Metadaten einbetten
    '--embed-thumbnail',
    '--embed-metadata',
    // WICHTIG: Dateidatum = heutiges Download-Datum (nicht das alte YouTube-Upload-Datum!)
    '--no-mtime',
    // Hotcue- & Duplikat-Schutz
    '--no-overwrites',
    '--download-archive', archivePath,
    // Bereinige "- Topic" bei YouTube-Music-Channels & unnötige Video-Zusätze im Titel
    '--replace-in-metadata', 'artist,uploader', ' - Topic$', '',
    '--replace-in-metadata', 'title', ' ?[\\(\\[](Official|Offizielles|Music|Audio|Video|Lyrics|Lyric|HD|4K|Visualizer).*?[\\)\\]]', '',
    '--remote-components', 'ejs:github',
    '-o', outputTemplate,
  ];

  // Optional: Falls eine cookies.txt (z.B. für YouTube Premium) im App-, Root- oder Zielordner liegt
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

  // JS Runtime für YouTube Signature Solving (EJS Challenge Solver)
  const candidateDenoPaths = [
    'C:\\Users\\juliu\\AppData\\Local\\Microsoft\\WinGet\\Links\\deno.exe',
    'C:\\Users\\juliu\\AppData\\Local\\Microsoft\\WinGet\\Packages\\DenoLand.Deno_Microsoft.Winget.Source_8wekyb3d8bbwe\\deno.exe',
    'C:\\Users\\juliu\\.deno\\bin\\deno.exe'
  ];
  const foundDeno = candidateDenoPaths.find(p => fsSync.existsSync(p));
  if (foundDeno) {
    args.push('--js-runtimes', `deno:${foundDeno}`);
  } else {
    args.push('--js-runtimes', 'deno,node');
  }

  // Optional: Eigener FFmpeg-Pfad aus config.json (falls vorhanden)
  if (ffmpegPath && fsSync.existsSync(ffmpegPath)) {
    args.push('--ffmpeg-location', ffmpegPath);
  }

  // Traktor Auto-Load Hotcue Tagger direkt nach jedem Track ausführen
  const taggerScript = path.join(process.cwd(), 'scripts', 'traktor-tagger.js');
  if (fsSync.existsSync(taggerScript)) {
    args.push('--exec', `node "${taggerScript}" {}`);
  }

  args.push(...opts.urls);
  return args;
}

