import path from 'path';
import fsSync from 'fs';

export function getConfigPath(): string {
  const external = 'C:\\Users\\juliu\\.gemini\\antigravity\\scratch\\spotify-yt-sync\\config.json';
  if (fsSync.existsSync(external)) return external;
  return path.join(process.cwd(), 'config.json');
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

  // Optional: Falls eine cookies.txt (z.B. für YouTube Premium) im App- oder Zielordner liegt
  const localCookies = path.join(process.cwd(), 'cookies.txt');
  const destCookies = path.join(basePath, 'cookies.txt');
  if (fsSync.existsSync(localCookies)) {
    args.push('--cookies', localCookies);
  } else if (fsSync.existsSync(destCookies)) {
    args.push('--cookies', destCookies);
  }

  // Optional: Deno Runtime falls installiert
  const denoPath = 'C:\\Users\\juliu\\.deno\\bin\\deno.exe';
  if (fsSync.existsSync(denoPath)) {
    args.push('--js-runtimes', `deno:${denoPath}`);
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
