"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import {
  Trash2,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Music,
  Plus,
  Settings,
  ChevronRight,
  Volume2,
  VolumeX,
  RefreshCw,
  Upload,
  AlertCircle,
  X,
} from "lucide-react";

type Track = { name: string; file: string };
type Playlist = { id: string; title: string; tracks: Track[]; status: string };
type DlStatus = {
  status: "idle" | "downloading" | "error";
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
};

type CookieStatus = {
  exists: boolean;
  path?: string;
  sizeBytes?: number;
  updatedAt?: string;
  cookieCount?: number;
  hasYoutube?: boolean;
  hasAuth?: boolean;
};

const IDLE_STATUS: DlStatus = {
  status: "idle",
  percentage: 0,
  eta: "",
  playlistName: "",
  songTitle: "",
};

function isSameDlStatus(a: DlStatus, b: DlStatus): boolean {
  return (
    a.status === b.status &&
    a.percentage === b.percentage &&
    a.eta === b.eta &&
    (a.playlistName ?? "") === (b.playlistName ?? "") &&
    (a.songTitle ?? "") === (b.songTitle ?? "") &&
    a.videoCurrent === b.videoCurrent &&
    a.videoTotal === b.videoTotal &&
    a.playlistCurrent === b.playlistCurrent &&
    a.playlistTotal === b.playlistTotal &&
    a.error === b.error &&
    a.phase === b.phase
  );
}

function arePlaylistsEqual(a: Playlist[], b: Playlist[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const pa = a[i];
    const pb = b[i];
    if (
      pa.id !== pb.id ||
      pa.title !== pb.title ||
      pa.status !== pb.status ||
      pa.tracks.length !== pb.tracks.length
    ) {
      return false;
    }
    for (let j = 0; j < pa.tracks.length; j++) {
      if (
        pa.tracks[j].file !== pb.tracks[j].file ||
        pa.tracks[j].name !== pb.tracks[j].name
      ) {
        return false;
      }
    }
  }
  return true;
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

interface SettingsPanelProps {
  destPath: string;
  onDestPathChange: (value: string) => void;
  onSaveConfig: () => void;
  cookieStatus: CookieStatus | null;
  cookieUploading: boolean;
  cookieMsg: { text: string; ok: boolean } | null;
  cookieFileRef: React.RefObject<HTMLInputElement | null>;
  onCookieSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDeleteCookies: () => void;
}

const SettingsPanel = React.memo(function SettingsPanel({
  destPath,
  onDestPathChange,
  onSaveConfig,
  cookieStatus,
  cookieUploading,
  cookieMsg,
  cookieFileRef,
  onCookieSelect,
  onDeleteCookies,
}: SettingsPanelProps) {
  return (
    <div className="w-full bg-zinc-900/50 border border-zinc-800/80 rounded-xl p-5 animate-in fade-in slide-in-from-top-2 text-left mt-4 space-y-5">
      <div>
        <label className="text-[10px] font-medium text-zinc-500 uppercase tracking-widest ml-1 mb-2 block">
          Lokaler Zielordner (Download-Pfad)
        </label>
        <Input
          placeholder="C:\Users\...\Music\DJ_Downloads"
          value={destPath}
          onChange={(e) => onDestPathChange(e.target.value)}
          onBlur={onSaveConfig}
          className="h-10 bg-zinc-900 border-zinc-800 text-zinc-300 focus-visible:ring-zinc-700 rounded-lg px-4 w-full shadow-sm text-sm font-mono"
        />
      </div>

      <div className="pt-3 border-t border-zinc-800/60">
        <div className="flex items-center justify-between mb-2">
          <label className="text-[10px] font-medium text-zinc-500 uppercase tracking-widest ml-1">
            YouTube Premium Cookies (cookies.txt)
          </label>
          {cookieStatus?.exists ? (
            <span className="text-[11px] font-medium text-emerald-400 bg-emerald-950/60 border border-emerald-800/60 rounded px-2 py-0.5">
              ✓ Aktiv ({cookieStatus.cookieCount || 0} Cookies
              {cookieStatus.hasAuth ? " • Login erkannt" : ""})
            </span>
          ) : (
            <span className="text-[11px] font-medium text-zinc-500 bg-zinc-900 border border-zinc-800 rounded px-2 py-0.5">
              Nicht hinterlegt (Standard-Qualität)
            </span>
          )}
        </div>

        <p className="text-xs text-zinc-400 mb-3 ml-1">
          Ermöglicht ungedrosselte 256k AAC- und Opus-Quellstreams direkt von
          YouTube Music.
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <input
            type="file"
            accept=".txt"
            ref={cookieFileRef}
            onChange={onCookieSelect}
            className="hidden"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => cookieFileRef.current?.click()}
            disabled={cookieUploading}
            className="h-9 px-4 bg-zinc-900 border-zinc-700 text-zinc-200 hover:bg-zinc-800 rounded-lg text-xs"
          >
            <Upload className="w-3.5 h-3.5 mr-2" />
            {cookieUploading
              ? "Wird geprüft..."
              : cookieStatus?.exists
                ? "Neue cookies.txt auswählen"
                : "cookies.txt auswählen"}
          </Button>

          {cookieStatus?.exists && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onDeleteCookies}
              className="h-9 px-3 text-zinc-500 hover:text-red-400 hover:bg-red-950/20 rounded-lg text-xs"
            >
              <Trash2 className="w-3.5 h-3.5 mr-1.5" />
              Entfernen
            </Button>
          )}

          {cookieStatus?.exists && cookieStatus.updatedAt && (
            <span className="text-[11px] text-zinc-500 font-mono">
              Zuletzt aktualisiert: {cookieStatus.updatedAt}
            </span>
          )}
        </div>

        {cookieMsg && (
          <div
            className={`mt-3 text-xs px-3 py-2 rounded-lg border ${
              cookieMsg.ok
                ? "bg-emerald-950/40 border-emerald-800/50 text-emerald-300"
                : "bg-red-950/40 border-red-800/50 text-red-300"
            }`}
          >
            {cookieMsg.text}
          </div>
        )}
      </div>
    </div>
  );
});

interface DownloadProgressBannerProps {
  dlStatus: DlStatus;
  isStarting: boolean;
  actionError: string | null;
  onDismissError: () => void;
  onCancel: () => void;
}

const DownloadProgressBanner = React.memo(function DownloadProgressBanner({
  dlStatus,
  isStarting,
  actionError,
  onDismissError,
  onCancel,
}: DownloadProgressBannerProps) {
  const isDownloading = isStarting || dlStatus.status === "downloading";
  const displayError =
    actionError || (dlStatus.status === "error" ? dlStatus.error : null);

  const etaLabel =
    dlStatus.eta && dlStatus.eta !== "..." ? `ETA: ${dlStatus.eta}` : "";

  const headerLabel =
    dlStatus.playlistName ||
    dlStatus.phase ||
    (isStarting ? "Starte Download..." : "Download aktiv...");

  const metaParts: string[] = [];
  if (dlStatus.playlistTotal && dlStatus.playlistTotal > 0) {
    metaParts.push(
      `Playlist ${dlStatus.playlistCurrent || 1}/${dlStatus.playlistTotal}`
    );
  }
  if (dlStatus.videoTotal && dlStatus.videoTotal > 0) {
    metaParts.push(`Track ${dlStatus.videoCurrent || 0}/${dlStatus.videoTotal}`);
  }
  if (dlStatus.percentage > 0) {
    metaParts.push(`${Math.round(dlStatus.percentage)}%`);
  }
  if (etaLabel) {
    metaParts.push(etaLabel);
  } else if (!dlStatus.phase && !dlStatus.songTitle) {
    metaParts.push("Calculating...");
  }

  return (
    <>
      {isDownloading && (
        <div className="bg-zinc-900/50 border border-zinc-800/80 rounded-xl p-4 overflow-hidden animate-in fade-in slide-in-from-top-2 space-y-2.5">
          <div className="flex justify-between items-center text-xs gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <RefreshCw className="w-3.5 h-3.5 text-emerald-400 animate-spin shrink-0" />
              <span className="font-semibold text-zinc-200 truncate">
                {headerLabel}
              </span>
            </div>
            <div className="flex items-center gap-3 shrink-0 ml-3">
              <span className="text-[11px] text-zinc-400 font-mono">
                {metaParts.join(" • ")}
              </span>
              <button
                type="button"
                onClick={onCancel}
                className="text-xs text-zinc-500 hover:text-red-400 underline transition-colors cursor-pointer"
                title="Download abbrechen und Status zurücksetzen"
              >
                Abbrechen
              </button>
            </div>
          </div>

          {(dlStatus.songTitle || (dlStatus.playlistName && dlStatus.phase)) && (
            <div className="flex items-center justify-between gap-2 text-xs text-zinc-300 font-medium pl-0.5">
              {dlStatus.songTitle ? (
                <div className="flex items-center gap-1.5 min-w-0 truncate">
                  <Music className="w-3 h-3 text-zinc-500 shrink-0" />
                  <span className="truncate">{dlStatus.songTitle}</span>
                </div>
              ) : (
                <span />
              )}
              {dlStatus.playlistName && dlStatus.phase && (
                <span className="text-[11px] text-emerald-400/90 shrink-0">
                  {dlStatus.phase}
                </span>
              )}
            </div>
          )}

          <div className="w-full bg-zinc-800 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-emerald-500 h-1.5 rounded-full transition-all duration-300 ease-out"
              style={{ width: `${Math.max(2, dlStatus.percentage || 0)}%` }}
            />
          </div>
        </div>
      )}

      {displayError && (
        <div className="bg-red-950/40 border border-red-800/60 text-red-300 rounded-xl px-4 py-3 text-xs flex items-center justify-between gap-3 animate-in fade-in slide-in-from-top-1">
          <div className="flex items-center gap-2 min-w-0">
            <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
            <span className="truncate">{displayError}</span>
          </div>
          <button
            type="button"
            onClick={onDismissError}
            className="text-red-400 hover:text-red-200 p-0.5 rounded transition-colors cursor-pointer flex-shrink-0"
            aria-label="Fehlermeldung schließen"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </>
  );
});

interface PlaylistSidebarProps {
  playlists: Playlist[];
  expandedPlaylist: string | null;
  onSelectPlaylist: (id: string) => void;
}

const PlaylistSidebar = React.memo(function PlaylistSidebar({
  playlists,
  expandedPlaylist,
  onSelectPlaylist,
}: PlaylistSidebarProps) {
  return (
    <div className="w-full md:w-1/3 flex flex-col gap-3 overflow-y-auto pr-2">
      {playlists.length === 0 && (
        <div className="p-8 border border-dashed border-zinc-800/80 rounded-2xl flex flex-col items-center justify-center text-zinc-500 text-sm h-full">
          No local playlists.
        </div>
      )}

      {playlists.map((p) => {
        const isExpanded = expandedPlaylist === p.id;
        return (
          <div
            key={p.id}
            className={`flex flex-col rounded-xl overflow-hidden border transition-all duration-200 cursor-pointer flex-shrink-0 ${
              isExpanded
                ? "border-zinc-500 bg-zinc-800/80"
                : "border-zinc-800/50 bg-zinc-900/30 hover:border-zinc-700 hover:bg-zinc-900/60"
            }`}
            onClick={() => onSelectPlaylist(p.id)}
          >
            <div className="flex items-center justify-between p-4 relative group">
              <div className="relative z-10 w-full min-w-0 pr-3">
                <h3
                  className={`font-medium text-sm line-clamp-1 transition-colors ${
                    isExpanded
                      ? "text-white"
                      : "text-zinc-300 group-hover:text-white"
                  }`}
                >
                  {p.title}
                </h3>
                <p
                  className={`text-[11px] font-medium mt-1 flex items-center gap-1.5 ${
                    isExpanded ? "text-zinc-400" : "text-zinc-500"
                  }`}
                >
                  <Music className="w-3 h-3" />
                  {p.tracks.length} Tracks
                </p>
              </div>
              <div
                className={`relative z-10 p-1.5 rounded-full transition-colors flex-shrink-0 ${
                  isExpanded
                    ? "bg-zinc-700 text-white"
                    : "text-zinc-600 bg-black/20 group-hover:bg-black/40 group-hover:text-zinc-400"
                }`}
              >
                <ChevronRight className="w-4 h-4" />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
});

interface TrackListPanelProps {
  playlist: Playlist | null;
  currentTrackFile: string | null;
  isPlaying: boolean;
  onSelectTrack: (playlist: Playlist, track: Track) => void;
}

const TrackListPanel = React.memo(function TrackListPanel({
  playlist,
  currentTrackFile,
  isPlaying,
  onSelectTrack,
}: TrackListPanelProps) {
  return (
    <div className="w-full md:w-2/3 bg-zinc-900/30 border border-zinc-800/50 rounded-2xl flex flex-col overflow-hidden">
      {playlist ? (
        <>
          <div className="p-4 border-b border-zinc-800/50 bg-zinc-900/50 flex-shrink-0">
            <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              <Music className="w-4 h-4 text-zinc-400" />
              {playlist.title}
              <span className="text-zinc-500 font-normal ml-2">
                ({playlist.tracks.length} Tracks)
              </span>
            </h3>
          </div>
          <div className="overflow-y-auto p-2 flex-1">
            {playlist.tracks.map((track) => {
              const isSelected = currentTrackFile === track.file;
              return (
                <div
                  key={track.file}
                  className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer text-sm transition-colors ${
                    isSelected
                      ? "bg-zinc-100 text-zinc-900 font-medium shadow-sm"
                      : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60"
                  }`}
                  onClick={() => onSelectTrack(playlist, track)}
                >
                  {isSelected && isPlaying ? (
                    <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse ml-1 flex-shrink-0" />
                  ) : (
                    <div className="w-2 h-2 ml-1 flex-shrink-0 opacity-50" />
                  )}
                  <span className="truncate flex-1 leading-relaxed">
                    {track.name}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-zinc-500 text-sm">
          <Music className="w-8 h-8 mb-3 opacity-20" />
          Select a playlist to view tracks
        </div>
      )}
    </div>
  );
});

interface FloatingAudioPlayerProps {
  currentTrack: Track | null;
  currentPlaylist: Playlist | null;
  isPlaying: boolean;
  onPlayingChange: (playing: boolean) => void;
  onSelectTrack: (playlist: Playlist, track: Track) => void;
}

const FloatingAudioPlayer = React.memo(function FloatingAudioPlayer({
  currentTrack,
  currentPlaylist,
  isPlaying,
  onPlayingChange,
  onSelectTrack,
}: FloatingAudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const isScrubbingRef = useRef(false);
  const scrubTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleSkipRef = useRef<(direction: number) => void>(() => {});

  const [progress, setProgress] = useState([0]);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState([80]);

  const handleSkip = useCallback(
    (direction: number) => {
      if (!currentPlaylist || !currentTrack) return;
      const tracks = currentPlaylist.tracks;
      if (tracks.length === 0) return;

      const currentIndex = tracks.findIndex((t) => t.file === currentTrack.file);
      if (currentIndex === -1) return;

      let nextIndex = currentIndex + direction;
      if (nextIndex >= tracks.length) nextIndex = 0;
      if (nextIndex < 0) nextIndex = tracks.length - 1;

      const nextTrack = tracks[nextIndex];
      if (nextTrack.file === currentTrack.file && audioRef.current) {
        audioRef.current.currentTime = 0;
        audioRef.current.play().catch(console.error);
        return;
      }

      onSelectTrack(currentPlaylist, nextTrack);
    },
    [currentPlaylist, currentTrack, onSelectTrack]
  );

  useEffect(() => {
    handleSkipRef.current = handleSkip;
  }, [handleSkip]);

  // Initialize Audio element once on mount
  useEffect(() => {
    const audio = new Audio();
    audio.volume = 0.8;
    audioRef.current = audio;

    const handleLoadStart = () => {
      setProgress([0]);
      setCurrentTime(0);
      setDuration(0);
    };

    const updateTime = () => {
      if (!isScrubbingRef.current) {
        setCurrentTime(audio.currentTime);
        if (audio.duration) {
          setProgress([(audio.currentTime / audio.duration) * 100]);
        }
      }
    };

    const updateDuration = () => {
      if (Number.isFinite(audio.duration)) {
        setDuration(audio.duration);
      }
    };

    const handlePlay = () => onPlayingChange(true);
    const handlePause = () => onPlayingChange(false);
    const handleEnded = () => handleSkipRef.current(1);

    audio.addEventListener("loadstart", handleLoadStart);
    audio.addEventListener("timeupdate", updateTime);
    audio.addEventListener("loadedmetadata", updateDuration);
    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("ended", handleEnded);

    return () => {
      if (scrubTimeoutRef.current) clearTimeout(scrubTimeoutRef.current);
      audio.removeEventListener("loadstart", handleLoadStart);
      audio.removeEventListener("timeupdate", updateTime);
      audio.removeEventListener("loadedmetadata", updateDuration);
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("ended", handleEnded);
      audio.pause();
    };
  }, [onPlayingChange]);

  // Load and play when currentTrack changes (single .play() call)
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) return;

    audio.src = `/api/stream?file=${encodeURIComponent(currentTrack.file)}`;
    audio.play().catch((err) => {
      console.error("Playback failed:", err);
      onPlayingChange(false);
    });
  }, [currentTrack, onPlayingChange]);

  const handleTogglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) return;

    if (audio.paused) {
      audio.play().catch((err) => {
        console.error("Playback failed:", err);
        onPlayingChange(false);
      });
    } else {
      audio.pause();
    }
  }, [currentTrack, onPlayingChange]);

  const handleSliderChange = useCallback(
    (val: number | readonly number[]) => {
      const numericVal = Array.isArray(val) ? val[0] : Number(val);
      if (!Number.isFinite(numericVal)) return;

      isScrubbingRef.current = true;
      setProgress([numericVal]);
      if (audioRef.current && duration) {
        const newTime = (numericVal / 100) * duration;
        audioRef.current.currentTime = newTime;
        setCurrentTime(newTime);
      }
      if (scrubTimeoutRef.current) clearTimeout(scrubTimeoutRef.current);
      scrubTimeoutRef.current = setTimeout(() => {
        isScrubbingRef.current = false;
      }, 150);
    },
    [duration]
  );

  const handleSliderCommit = useCallback(() => {
    if (scrubTimeoutRef.current) clearTimeout(scrubTimeoutRef.current);
    isScrubbingRef.current = false;
  }, []);

  const handleVolumeChange = useCallback((val: number | readonly number[]) => {
    const numericVal = Array.isArray(val) ? val[0] : Number(val);
    if (!Number.isFinite(numericVal)) return;

    setVolume([numericVal]);
    if (audioRef.current) {
      audioRef.current.volume = numericVal / 100;
    }
  }, []);

  return (
    <div className="fixed bottom-8 left-1/2 -translate-x-1/2 w-full max-w-[calc(100%-2rem)] md:max-w-3xl z-50">
      <div className="flex flex-col gap-4 p-4 md:p-5 bg-zinc-100 text-zinc-900 border border-zinc-200 rounded-2xl shadow-2xl relative overflow-hidden">
        <div className="flex items-center justify-between relative z-10">
          <div className="flex items-center gap-4 flex-1 overflow-hidden">
            <div className="w-12 h-12 rounded-lg bg-zinc-200 flex items-center justify-center border border-zinc-300 flex-shrink-0">
              <Music className="w-5 h-5 text-zinc-500" />
            </div>
            <div className="flex-1 min-w-0 pr-4">
              <p className="font-semibold text-sm truncate">
                {currentTrack ? currentTrack.name : "No track selected"}
              </p>
              <p className="text-zinc-500 text-xs truncate mt-0.5 font-medium">
                {currentPlaylist ? currentPlaylist.title : "Local DJ Audio"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 md:gap-3 flex-shrink-0 justify-center">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleSkip(-1)}
              className="text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200 rounded-full h-10 w-10"
            >
              <SkipBack className="w-5 h-5 fill-current" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleTogglePlay}
              className="w-14 h-14 bg-zinc-900 text-zinc-100 hover:bg-zinc-800 rounded-full transition-transform active:scale-95 shadow-md"
            >
              {isPlaying ? (
                <Pause className="w-6 h-6 fill-current" />
              ) : (
                <Play className="w-6 h-6 ml-1 fill-current" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleSkip(1)}
              className="text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200 rounded-full h-10 w-10"
            >
              <SkipForward className="w-5 h-5 fill-current" />
            </Button>
          </div>

          <div className="flex-1 hidden md:flex items-center justify-end gap-3 pl-6 relative">
            {volume[0] === 0 ? (
              <VolumeX className="w-4 h-4 text-zinc-500" />
            ) : (
              <Volume2 className="w-4 h-4 text-zinc-500" />
            )}
            <div className="w-16 [&_.bg-primary]:bg-zinc-900 [&_.bg-secondary]:bg-zinc-300 [&_[role=slider]]:bg-zinc-900 [&_[role=slider]]:border-zinc-900">
              <Slider
                value={volume}
                max={100}
                step={1}
                onValueChange={handleVolumeChange}
                className="cursor-pointer"
              />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4 w-full relative z-10">
          <span className="text-[11px] font-semibold text-zinc-500 w-10 text-right font-mono tracking-tighter">
            {formatTime(currentTime)}
          </span>
          <div className="flex-1 [&_.bg-primary]:bg-zinc-900 [&_.bg-secondary]:bg-zinc-300 [&_[role=slider]]:bg-zinc-900 [&_[role=slider]]:border-zinc-900">
            <Slider
              value={progress}
              max={100}
              step={0.1}
              onValueChange={handleSliderChange}
              onPointerUp={handleSliderCommit}
              className="cursor-pointer"
            />
          </div>
          <span className="text-[11px] font-semibold text-zinc-500 w-10 font-mono tracking-tighter">
            {formatTime(duration)}
          </span>
        </div>
      </div>
    </div>
  );
});

export default function SyncTool() {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [isRefreshingLibrary, setIsRefreshingLibrary] = useState(false);
  const [newUrl, setNewUrl] = useState("");

  // Playback selection state (isolated from 4Hz timeupdate)
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [currentPlaylistCtx, setCurrentPlaylistCtx] = useState<Playlist | null>(
    null
  );
  const [expandedPlaylist, setExpandedPlaylist] = useState<string | null>(null);

  // Download & polling state
  const [dlStatus, setDlStatus] = useState<DlStatus>(IDLE_STATUS);
  const [isStarting, setIsStarting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isVisible, setIsVisible] = useState(true);

  const prevDlStatusRef = useRef<DlStatus["status"]>("idle");
  const statusInFlightRef = useRef(false);
  const statusAbortRef = useRef<AbortController | null>(null);
  const libraryAbortRef = useRef<AbortController | null>(null);

  // Config & cookie state
  const [destPath, setDestPath] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [cookieStatus, setCookieStatus] = useState<CookieStatus | null>(null);
  const [cookieUploading, setCookieUploading] = useState(false);
  const [cookieMsg, setCookieMsg] = useState<{
    text: string;
    ok: boolean;
  } | null>(null);
  const cookieFileRef = useRef<HTMLInputElement | null>(null);

  // Traktor patch state
  const [isPatchingTraktor, setIsPatchingTraktor] = useState(false);
  const [traktorPatchResult, setTraktorPatchResult] = useState<{
    success?: boolean;
    message?: string;
  } | null>(null);

  const loadLibrary = useCallback(async () => {
    if (libraryAbortRef.current) {
      libraryAbortRef.current.abort();
    }
    const controller = new AbortController();
    libraryAbortRef.current = controller;
    setIsRefreshingLibrary(true);

    try {
      const res = await fetch("/api/library", { signal: controller.signal });
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.playlists)) {
        const nextPlaylists: Playlist[] = data.playlists;
        setPlaylists((prev) =>
          arePlaylistsEqual(prev, nextPlaylists) ? prev : nextPlaylists
        );
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      console.error("Failed to load library:", err);
    } finally {
      if (libraryAbortRef.current === controller) {
        libraryAbortRef.current = null;
        setIsRefreshingLibrary(false);
      }
    }
  }, []);

  const pollStatus = useCallback(async () => {
    if (statusInFlightRef.current) return;

    const controller = new AbortController();
    statusAbortRef.current = controller;
    statusInFlightRef.current = true;

    try {
      const res = await fetch("/api/status", { signal: controller.signal });
      if (!res.ok) return;
      const data: DlStatus = await res.json();

      const prevStatus = prevDlStatusRef.current;
      prevDlStatusRef.current = data.status;

      setDlStatus((prev) => (isSameDlStatus(prev, data) ? prev : data));

      if (prevStatus === "downloading" && data.status !== "downloading") {
        void loadLibrary();
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
    } finally {
      if (statusAbortRef.current === controller) {
        statusAbortRef.current = null;
      }
      statusInFlightRef.current = false;
    }
  }, [loadLibrary]);

  // Initial mount load (config, cookies, library, status) with clean cancellation
  useEffect(() => {
    const controller = new AbortController();

    async function loadInitialData() {
      const configPromise = fetch("/api/config", { signal: controller.signal })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data?.path && !controller.signal.aborted) {
            setDestPath(data.path);
          }
        })
        .catch((err) => {
          if (!(err instanceof DOMException && err.name === "AbortError")) {
            console.error("Failed to load config:", err);
          }
        });

      const cookiesPromise = fetch("/api/cookies", {
        signal: controller.signal,
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data && !controller.signal.aborted) {
            setCookieStatus(data);
          }
        })
        .catch(() => {
          // ignore
        });

      await Promise.all([
        configPromise,
        cookiesPromise,
        loadLibrary(),
        pollStatus(),
      ]);
    }

    void loadInitialData();

    return () => {
      controller.abort();
      statusAbortRef.current?.abort();
      libraryAbortRef.current?.abort();
    };
  }, [loadLibrary, pollStatus]);

  // Track tab visibility and window focus to pause polling when hidden
  useEffect(() => {
    const handleVisibilityChange = () => {
      const visible = document.visibilityState !== "hidden";
      setIsVisible(visible);
      if (visible) {
        void pollStatus();
      }
    };

    const handleFocus = () => {
      if (document.visibilityState !== "hidden") {
        void pollStatus();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleFocus);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleFocus);
    };
  }, [pollStatus]);

  // Adaptive status polling: 1s while downloading/starting, 5s when idle & visible, paused when hidden
  const isBusy = isStarting || dlStatus.status === "downloading";
  useEffect(() => {
    if (!isVisible) return;

    let cancelled = false;
    let timerId: ReturnType<typeof setTimeout> | null = null;
    const intervalMs = isBusy ? 1000 : 5000;

    const tick = async () => {
      if (cancelled) return;
      await pollStatus();
      if (!cancelled) {
        timerId = setTimeout(tick, intervalMs);
      }
    };

    timerId = setTimeout(tick, intervalMs);

    return () => {
      cancelled = true;
      if (timerId) clearTimeout(timerId);
    };
  }, [isBusy, isVisible, pollStatus]);

  const handleCookieSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setCookieUploading(true);
      setCookieMsg(null);

      const formData = new FormData();
      formData.append("file", file);

      try {
        const res = await fetch("/api/cookies", {
          method: "POST",
          body: formData,
        });
        const data = await res.json();
        if (res.ok && data.success) {
          setCookieStatus(data);
          setCookieMsg({
            text: data.message || "Cookie-Datei erfolgreich hinterlegt!",
            ok: true,
          });
        } else {
          setCookieMsg({
            text: data.error || "Fehler beim Hochladen der Cookies.",
            ok: false,
          });
        }
      } catch {
        setCookieMsg({ text: "Verbindungsfehler beim Upload.", ok: false });
      } finally {
        setCookieUploading(false);
        if (cookieFileRef.current) cookieFileRef.current.value = "";
      }
    },
    []
  );

  const handleDeleteCookies = useCallback(async () => {
    try {
      const res = await fetch("/api/cookies", { method: "DELETE" });
      if (res.ok) {
        setCookieStatus({ exists: false });
        setCookieMsg({ text: "Cookies wurden entfernt.", ok: true });
      }
    } catch {
      setCookieMsg({
        text: "Fehler beim Entfernen der Cookies.",
        ok: false,
      });
    }
  }, []);

  const saveConfig = useCallback(async () => {
    try {
      await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: destPath }),
      });
    } catch (error) {
      console.error("Failed to save config:", error);
    }
  }, [destPath]);

  const handleAdd = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const urlToDownload = newUrl.trim();
      if (!urlToDownload || isStarting || dlStatus.status === "downloading") {
        return;
      }

      setIsStarting(true);
      setActionError(null);
      prevDlStatusRef.current = "downloading";
      setDlStatus({
        status: "downloading",
        percentage: 0,
        eta: "",
        phase: "Starte Download...",
      });

      try {
        const res = await fetch("/api/download", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: urlToDownload }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          prevDlStatusRef.current = "idle";
          setDlStatus(IDLE_STATUS);
          setActionError(
            data.error || "Download konnte nicht gestartet werden."
          );
          return;
        }
        setNewUrl("");
        await pollStatus();
      } catch {
        prevDlStatusRef.current = "idle";
        setDlStatus(IDLE_STATUS);
        setActionError("Verbindungsfehler beim Starten des Downloads.");
      } finally {
        setIsStarting(false);
      }
    },
    [newUrl, isStarting, dlStatus.status, pollStatus]
  );

  const handleSyncAll = useCallback(async () => {
    if (isStarting || dlStatus.status === "downloading") return;

    setIsStarting(true);
    setActionError(null);
    prevDlStatusRef.current = "downloading";
    setDlStatus({
      status: "downloading",
      percentage: 0,
      eta: "",
      phase: "Prüfe Playlists...",
    });

    try {
      const res = await fetch("/api/sync-all", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        prevDlStatusRef.current = "idle";
        setDlStatus(IDLE_STATUS);
        setActionError(data.error || "Bulk-Sync konnte nicht gestartet werden.");
        return;
      }
      await pollStatus();
    } catch {
      prevDlStatusRef.current = "idle";
      setDlStatus(IDLE_STATUS);
      setActionError("Verbindungsfehler beim Starten des Bulk-Syncs.");
    } finally {
      setIsStarting(false);
    }
  }, [isStarting, dlStatus.status, pollStatus]);

  const handleCancelDownload = useCallback(async () => {
    setIsStarting(false);
    setActionError(null);
    try {
      const res = await fetch("/api/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
      });
      if (!res.ok) {
        setActionError("Download konnte nicht abgebrochen werden.");
      }
      prevDlStatusRef.current = "idle";
      setDlStatus(IDLE_STATUS);
      void loadLibrary();
    } catch {
      setActionError("Verbindungsfehler beim Abbrechen des Downloads.");
    }
  }, [loadLibrary]);

  const handleDismissError = useCallback(() => {
    setActionError(null);
    setDlStatus((prev) =>
      prev.status === "error" ? IDLE_STATUS : prev
    );
  }, []);

  const handleTraktorPatch = useCallback(async () => {
    setIsPatchingTraktor(true);
    setTraktorPatchResult(null);
    try {
      const res = await fetch("/api/traktor-patch", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setTraktorPatchResult({
          success: false,
          message: data.error || "Ein Fehler ist aufgetreten.",
        });
      } else {
        setTraktorPatchResult({ success: true, message: data.message });
      }
    } catch {
      setTraktorPatchResult({
        success: false,
        message: "Verbindungsfehler zur API.",
      });
    } finally {
      setIsPatchingTraktor(false);
    }
  }, []);

  const handleSelectTrack = useCallback((playlist: Playlist, track: Track) => {
    setCurrentPlaylistCtx(playlist);
    setCurrentTrack(track);
  }, []);

  const activeExpandedPlaylist = useMemo(
    () => playlists.find((p) => p.id === expandedPlaylist) ?? null,
    [playlists, expandedPlaylist]
  );

  const activePlayerPlaylist = useMemo(() => {
    if (!currentPlaylistCtx) return null;
    return (
      playlists.find((p) => p.id === currentPlaylistCtx.id) ??
      currentPlaylistCtx
    );
  }, [playlists, currentPlaylistCtx]);

  return (
    <div className="min-h-screen bg-black text-zinc-100 font-sans selection:bg-zinc-800 pb-40">
      <main className="max-w-5xl mx-auto pt-24 px-6 md:px-8 space-y-16">
        {/* Header */}
        <header className="flex flex-col items-center justify-center text-center space-y-3 max-w-2xl mx-auto">
          <div className="flex flex-col items-center gap-2 relative w-full">
            <h1 className="text-3xl font-bold tracking-tight mt-4">
              DJ Local Sync
            </h1>
            <p className="text-zinc-500 text-sm max-w-sm mx-auto">
              Sync YouTube Playlists directly to your local drive.
            </p>

            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowSettings((prev) => !prev)}
              className="absolute right-0 top-0 text-zinc-500 hover:text-zinc-100"
            >
              <Settings className="w-5 h-5" />
            </Button>
          </div>

          {showSettings && (
            <SettingsPanel
              destPath={destPath}
              onDestPathChange={setDestPath}
              onSaveConfig={saveConfig}
              cookieStatus={cookieStatus}
              cookieUploading={cookieUploading}
              cookieMsg={cookieMsg}
              cookieFileRef={cookieFileRef}
              onCookieSelect={handleCookieSelect}
              onDeleteCookies={handleDeleteCookies}
            />
          )}
        </header>

        {/* Input Section & Progress */}
        <section className="space-y-4 max-w-2xl mx-auto w-full pt-4">
          <form onSubmit={handleAdd} className="flex flex-col sm:flex-row gap-3">
            <Input
              placeholder="Paste YouTube Playlist URL..."
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              disabled={isBusy}
              className="h-12 bg-zinc-900/50 border-zinc-800/80 text-zinc-100 placeholder:text-zinc-600 focus-visible:ring-zinc-700 focus-visible:ring-1 rounded-xl px-4 flex-1 shadow-sm transition-all"
            />
            <Button
              type="submit"
              className="h-12 bg-zinc-100 text-zinc-900 hover:bg-zinc-300 font-medium px-8 rounded-xl transition-colors shadow-sm"
              disabled={isBusy || !newUrl.trim()}
            >
              <Plus className="w-4 h-4 mr-2" />
              {isStarting ? "Starting..." : "Download"}
            </Button>
          </form>

          <DownloadProgressBanner
            dlStatus={dlStatus}
            isStarting={isStarting}
            actionError={actionError}
            onDismissError={handleDismissError}
            onCancel={handleCancelDownload}
          />
        </section>

        {/* Playlists */}
        <section className="space-y-6">
          <div className="flex items-center justify-between ml-1 max-w-5xl gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-medium text-zinc-500 uppercase tracking-widest">
                Local Library
              </h2>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => void loadLibrary()}
                disabled={isRefreshingLibrary}
                className="h-7 w-7 text-zinc-500 hover:text-zinc-100"
                title="Bibliothek aktualisieren"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${isRefreshingLibrary ? "animate-spin" : ""}`}
                />
              </Button>
            </div>
            <div className="flex items-center gap-3">
              {traktorPatchResult && (
                <span
                  className={`text-xs font-medium px-2 py-1 rounded ${
                    traktorPatchResult.success
                      ? "bg-green-900/40 text-green-400"
                      : "bg-red-900/40 text-red-400"
                  }`}
                >
                  {traktorPatchResult.message}
                </span>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={handleTraktorPatch}
                disabled={isPatchingTraktor}
                className="h-9 px-4 bg-zinc-900/50 border-zinc-800 text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800 disabled:opacity-50 rounded-lg transition-colors"
              >
                {isPatchingTraktor ? (
                  <RefreshCw className="w-3.5 h-3.5 mr-2 animate-spin" />
                ) : (
                  <Music className="w-3.5 h-3.5 mr-2" />
                )}
                Traktor Hotcues Generieren
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleSyncAll}
                disabled={isBusy}
                className="h-9 px-4 bg-zinc-900/50 border-zinc-800 text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800 disabled:opacity-50 rounded-lg transition-colors"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 mr-2 ${isBusy ? "animate-spin" : ""}`}
                />
                Sync Config
              </Button>
            </div>
          </div>

          <div className="flex flex-col md:flex-row gap-5 h-[50vh] min-h-[400px]">
            <PlaylistSidebar
              playlists={playlists}
              expandedPlaylist={expandedPlaylist}
              onSelectPlaylist={setExpandedPlaylist}
            />
            <TrackListPanel
              playlist={activeExpandedPlaylist}
              currentTrackFile={currentTrack?.file ?? null}
              isPlaying={isPlaying}
              onSelectTrack={handleSelectTrack}
            />
          </div>
        </section>
      </main>

      <FloatingAudioPlayer
        currentTrack={currentTrack}
        currentPlaylist={activePlayerPlaylist}
        isPlaying={isPlaying}
        onPlayingChange={setIsPlaying}
        onSelectTrack={handleSelectTrack}
      />
    </div>
  );
}
