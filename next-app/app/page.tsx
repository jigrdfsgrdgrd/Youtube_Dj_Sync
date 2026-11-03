"use client"

import React, { useState, useEffect, useRef } from "react"
import {
  Play,
  Pause,
  SkipForward,
  SkipBack,
  Volume2,
  VolumeX,
  Music,
  Download,
  RefreshCw,
  FolderOpen,
  Settings,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Disc3,
  HardDrive,
  Terminal,
  Search,
  ExternalLink,
  ShieldCheck,
  Radio,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"

interface Track {
  id: string
  title: string
  artist: string
  album: string
  duration: number
  size_mb: number
  file_path: string
  filename: string
  relative_path: string
  has_cover: boolean
  modified: number
}

interface SyncStatus {
  status: "idle" | "running" | "cancelling" | "completed" | "error" | "cancelled"
  active_playlist: string
  current_index: number
  total_tracks: number
  percent: number
  current_track: string
  success_count: number
  skipped_count: number
  failed_count: number
  error: string | null
  logs: string[]
}

export default function DJSyncDashboard() {
  // Backend & Connection State
  const [backendOnline, setBackendOnline] = useState<boolean>(false)
  const [resolvedDest, setResolvedDest] = useState<string>("")
  const [showSettings, setShowSettings] = useState<boolean>(false)
  const [customDestInput, setCustomDestInput] = useState<string>("")

  // Sync Form State
  const [playlistInput, setPlaylistInput] = useState<string>("")
  const [quality, setQuality] = useState<string>("320")
  const [isStartingSync, setIsStartingSync] = useState<boolean>(false)
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    status: "idle",
    active_playlist: "",
    current_index: 0,
    total_tracks: 0,
    percent: 0,
    current_track: "",
    success_count: 0,
    skipped_count: 0,
    failed_count: 0,
    error: null,
    logs: [],
  })
  const [showLogs, setShowLogs] = useState<boolean>(true)

  // Track Library State
  const [tracks, setTracks] = useState<Track[]>([])
  const [isLoadingTracks, setIsLoadingTracks] = useState<boolean>(false)
  const [searchFilter, setSearchFilter] = useState<string>("")

  // Audio Player State
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null)
  const [isPlaying, setIsPlaying] = useState<boolean>(false)
  const [currentTime, setCurrentTime] = useState<number>(0)
  const [duration, setDuration] = useState<number>(0)
  const [volume, setVolume] = useState<number>(0.85)
  const [isMuted, setIsMuted] = useState<boolean>(false)

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const logEndRef = useRef<HTMLDivElement | null>(null)

  // 1. Health & Initial Load
  const checkHealth = async () => {
    try {
      const res = await fetch("/api/health")
      if (res.ok) {
        setBackendOnline(true)
        return true
      }
    } catch {
      setBackendOnline(false)
    }
    return false
  }

  const fetchConfig = async () => {
    try {
      const res = await fetch("/api/config")
      if (res.ok) {
        const data = await res.json()
        setResolvedDest(data.resolved_destination || "")
        setCustomDestInput(data.config?.downloads?.destination_path || "")
        if (data.config?.downloads?.audio_quality) {
          setQuality(data.config.downloads.audio_quality)
        }
      }
    } catch (e) {
      console.error("Config fetch error:", e)
    }
  }

  const fetchTracks = async () => {
    setIsLoadingTracks(true)
    try {
      const res = await fetch("/api/tracks")
      if (res.ok) {
        const data = await res.json()
        setTracks(data.tracks || [])
      }
    } catch (e) {
      console.error("Track fetch error:", e)
    } finally {
      setIsLoadingTracks(false)
    }
  }

  useEffect(() => {
    checkHealth()
    fetchConfig()
    fetchTracks()

    const healthInterval = setInterval(checkHealth, 5000)
    return () => clearInterval(healthInterval)
  }, [])

  // 2. Poll Sync Status
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null

    const pollStatus = async () => {
      try {
        const res = await fetch("/api/status")
        if (res.ok) {
          const data: SyncStatus = await res.json()
          setSyncStatus(data)

          // Wenn der Sync abgeschlossen ist, lade Tracks neu
          if (data.status === "completed" && syncStatus.status === "running") {
            fetchTracks()
          }
        }
      } catch (e) {
        console.error("Status polling error:", e)
      }
    }

    if (syncStatus.status === "running" || syncStatus.status === "cancelling") {
      interval = setInterval(pollStatus, 1000)
    } else {
      pollStatus()
    }

    return () => {
      if (interval) clearInterval(interval)
    }
  }, [syncStatus.status])

  // Scroll to bottom of logs
  useEffect(() => {
    if (logEndRef.current && showLogs) {
      logEndRef.current.scrollIntoView({ behavior: "smooth" })
    }
  }, [syncStatus.logs, showLogs])

  // 3. Audio Player Events
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime)
    const handleLoadedMetadata = () => setDuration(audio.duration || 0)
    const handleEnded = () => playNextTrack()
    const handlePlay = () => setIsPlaying(true)
    const handlePause = () => setIsPlaying(false)

    audio.addEventListener("timeupdate", handleTimeUpdate)
    audio.addEventListener("loadedmetadata", handleLoadedMetadata)
    audio.addEventListener("ended", handleEnded)
    audio.addEventListener("play", handlePlay)
    audio.addEventListener("pause", handlePause)

    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate)
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata)
      audio.removeEventListener("ended", handleEnded)
      audio.removeEventListener("play", handlePlay)
      audio.removeEventListener("pause", handlePause)
    }
  }, [currentTrack, tracks])

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume
    }
  }, [volume, isMuted])

  const loadTrack = (track: Track, autoPlay: boolean = true) => {
    setCurrentTrack(track)
    if (audioRef.current) {
      audioRef.current.src = `/api/audio/${track.id}`
      audioRef.current.load()
      if (autoPlay) {
        audioRef.current
          .play()
          .then(() => setIsPlaying(true))
          .catch((err) => console.log("Autoplay blocked/failed:", err))
      }
    }
  }

  const togglePlayPause = () => {
    if (!audioRef.current || !currentTrack) return
    if (isPlaying) {
      audioRef.current.pause()
    } else {
      audioRef.current.play().catch(console.error)
    }
  }

  const playNextTrack = () => {
    if (!currentTrack || tracks.length === 0) return
    const currentIndex = tracks.findIndex((t) => t.id === currentTrack.id)
    const nextIndex = (currentIndex + 1) % tracks.length
    loadTrack(tracks[nextIndex], true)
  }

  const playPrevTrack = () => {
    if (!currentTrack || tracks.length === 0) return
    const currentIndex = tracks.findIndex((t) => t.id === currentTrack.id)
    const prevIndex = (currentIndex - 1 + tracks.length) % tracks.length
    loadTrack(tracks[prevIndex], true)
  }

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value)
    setCurrentTime(time)
    if (audioRef.current) {
      audioRef.current.currentTime = time
    }
  }

  // 4. Start & Cancel Sync
  const handleStartSync = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!playlistInput.trim()) return

    setIsStartingSync(true)
    try {
      const res = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playlist_url_or_id: playlistInput.trim(),
          quality: quality,
          destination_path: customDestInput.trim() || undefined,
        }),
      })

      if (res.ok) {
        setPlaylistInput("")
        // Trigger status poll sofort
        const statusRes = await fetch("/api/status")
        if (statusRes.ok) {
          setSyncStatus(await statusRes.json())
        }
      } else {
        const errorData = await res.json()
        alert(`Fehler beim Starten: ${errorData.detail || "Unbekannter Fehler"}`)
      }
    } catch (e) {
      alert(`Netzwerkfehler: Backend nicht erreichbar.`)
    } finally {
      setIsStartingSync(false)
    }
  }

  const handleCancelSync = async () => {
    try {
      await fetch("/api/cancel", { method: "POST" })
    } catch (e) {
      console.error("Cancel error:", e)
    }
  }

  const handleSaveSettings = async () => {
    try {
      const res = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          destination_path: customDestInput.trim(),
          audio_quality: quality,
        }),
      })
      if (res.ok) {
        setShowSettings(false)
        fetchConfig()
        fetchTracks()
      }
    } catch (e) {
      alert("Fehler beim Speichern der Einstellungen.")
    }
  }

  const formatTime = (secs: number) => {
    if (!secs || isNaN(secs)) return "0:00"
    const m = Math.floor(secs / 60)
    const s = Math.floor(secs % 60)
    return `${m}:${s < 10 ? "0" : ""}${s}`
  }

  // Filtered tracks
  const filteredTracks = tracks.filter((t) => {
    const q = searchFilter.toLowerCase()
    return (
      t.title.toLowerCase().includes(q) ||
      t.artist.toLowerCase().includes(q) ||
      t.album.toLowerCase().includes(q)
    )
  })

  const isSyncActive = syncStatus.status === "running" || syncStatus.status === "cancelling"

  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-slate-100 selection:bg-cyan-500 selection:text-black">
      {/* Hidden Audio Element */}
      <audio ref={audioRef} preload="auto" />

      {/* Top Navigation */}
      <header className="sticky top-0 z-40 border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-cyan-500 via-indigo-500 to-fuchsia-500 shadow-lg shadow-cyan-500/20">
              <Disc3 className="h-6 w-6 animate-[spin_6s_linear_infinite] text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold tracking-tight text-white sm:text-xl">
                  YOUTUBE <span className="text-cyan-400">DJ SYNC</span>
                </h1>
                <span className="rounded-full bg-cyan-950 px-2 py-0.5 text-xs font-semibold text-cyan-300 ring-1 ring-cyan-800">
                  v2.0
                </span>
              </div>
              <p className="text-xs text-slate-400">
                High-Quality Playlist Sync, ID3 Tagging & Built-in Player
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Backend Status Pill */}
            <div
              className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
                backendOnline
                  ? "bg-emerald-950/60 text-emerald-400 ring-1 ring-emerald-700/50"
                  : "bg-rose-950/60 text-rose-400 ring-1 ring-rose-700/50"
              }`}
            >
              <div
                className={`h-2 w-2 rounded-full ${
                  backendOnline ? "animate-pulse bg-emerald-400" : "bg-rose-500"
                }`}
              />
              {backendOnline ? "Backend Online" : "Backend Offline"}
            </div>

            {/* Settings Trigger */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowSettings(!showSettings)}
              className="border-slate-800 bg-slate-900/60 text-slate-300 hover:bg-slate-800 hover:text-white"
            >
              <Settings className="h-4 w-4" />
              <span className="hidden sm:inline">Settings</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 p-4 pb-32 sm:p-6">
        {/* Settings Panel (collapsible) */}
        {showSettings && (
          <Card className="border-cyan-900/40 bg-slate-900/90 p-5 shadow-2xl backdrop-blur-xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <FolderOpen className="h-5 w-5 text-cyan-400" />
                <h3 className="font-semibold text-white">Speicherort & Einstellungen</h3>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowSettings(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </Button>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <label className="text-xs font-medium text-slate-400">
                  Zielverzeichnis für Downloads:
                </label>
                <Input
                  value={customDestInput}
                  onChange={(e) => setCustomDestInput(e.target.value)}
                  placeholder="z.B. ../storage/downloads oder Z:\Musik\DJ_Downloads"
                  className="mt-1.5 border-slate-700 bg-slate-950 text-slate-200"
                />
                <p className="mt-1 text-[11px] text-slate-500">
                  Aktuell aufgelöst: <span className="font-mono text-slate-400">{resolvedDest}</span>
                </p>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-400">
                  Standard Audio-Qualität:
                </label>
                <div className="mt-1.5 flex gap-2">
                  {["320", "256", "192"].map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => setQuality(q)}
                      className={`flex-1 rounded-lg border py-2 text-xs font-medium transition-all ${
                        quality === q
                          ? "border-cyan-500 bg-cyan-950/60 text-cyan-300 ring-1 ring-cyan-500"
                          : "border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700"
                      }`}
                    >
                      {q} kbps MP3
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowSettings(false)}
                className="border-slate-800"
              >
                Abbrechen
              </Button>
              <Button
                size="sm"
                onClick={handleSaveSettings}
                className="bg-cyan-600 text-white hover:bg-cyan-500"
              >
                Einstellungen speichern
              </Button>
            </div>
          </Card>
        )}

        {/* Sync Cockpit Banner */}
        <div className="relative overflow-hidden rounded-2xl border border-slate-800/80 bg-gradient-to-br from-slate-900 via-slate-900/90 to-indigo-950/40 p-6 shadow-xl">
          <div className="absolute right-0 top-0 -mr-16 -mt-16 h-64 w-64 rounded-full bg-cyan-500/10 blur-3xl" />
          <div className="relative z-10 flex flex-col gap-5">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span className="flex h-6 items-center gap-1.5 rounded-full bg-cyan-950/70 px-2.5 text-[11px] font-semibold text-cyan-400 ring-1 ring-cyan-800/60">
                  <ShieldCheck className="h-3.5 w-3.5" /> Hotcue-Schutz Aktiv
                </span>
                <span className="flex h-6 items-center gap-1.5 rounded-full bg-indigo-950/70 px-2.5 text-[11px] font-semibold text-indigo-400 ring-1 ring-indigo-800/60">
                  <HardDrive className="h-3.5 w-3.5" /> ID3 Tag & Cover Auto-Embed
                </span>
              </div>
              <h2 className="text-xl font-bold text-white sm:text-2xl">
                YouTube & YouTube Music Playlist synchronisieren
              </h2>
              <p className="text-sm text-slate-400">
                Füge den Link oder die ID einer YouTube/YouTube Music Playlist ein. Bereits
                vorhandene Songs werden übersprungen und Hotcues geschützt.
              </p>
            </div>

            <form onSubmit={handleStartSync} className="flex flex-col gap-3 sm:flex-row">
              <div className="relative flex-1">
                <Input
                  value={playlistInput}
                  onChange={(e) => setPlaylistInput(e.target.value)}
                  placeholder="https://music.youtube.com/playlist?list=... oder YouTube Playlist URL/ID"
                  disabled={isSyncActive || isStartingSync}
                  className="h-12 border-slate-700/80 bg-slate-950/90 pr-10 text-base text-slate-100 placeholder:text-slate-500 focus-visible:ring-cyan-500"
                />
              </div>

              {/* Quality selector */}
              <div className="flex rounded-xl border border-slate-800 bg-slate-950/80 p-1">
                {["320", "256", "192"].map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => setQuality(q)}
                    disabled={isSyncActive}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                      quality === q
                        ? "bg-cyan-500 text-slate-950 shadow-md"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    {q}k
                  </button>
                ))}
              </div>

              {/* Action Buttons */}
              {isSyncActive ? (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={handleCancelSync}
                  className="h-12 px-6 font-semibold"
                >
                  <AlertCircle className="mr-2 h-4 w-4" />
                  Abbrechen
                </Button>
              ) : (
                <Button
                  type="submit"
                  disabled={!playlistInput.trim() || isStartingSync || !backendOnline}
                  className="h-12 bg-gradient-to-r from-cyan-500 to-indigo-600 px-7 font-semibold text-white shadow-lg shadow-cyan-500/25 transition-all hover:opacity-95 disabled:opacity-50"
                >
                  {isStartingSync ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      Wird vorbereitet...
                    </>
                  ) : (
                    <>
                      <Download className="mr-2 h-5 w-5" />
                      Sync starten
                    </>
                  )}
                </Button>
              )}
            </form>
          </div>
        </div>

        {/* Live Progress & Log Terminal (Visible when syncing or after sync) */}
        {(isSyncActive || syncStatus.logs.length > 0) && (
          <Card className="border-slate-800 bg-slate-900/80 p-5 shadow-xl">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
              <div className="flex items-center gap-2.5">
                {isSyncActive ? (
                  <Loader2 className="h-5 w-5 animate-spin text-cyan-400" />
                ) : syncStatus.status === "completed" ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                ) : (
                  <AlertCircle className="h-5 w-5 text-amber-400" />
                )}
                <div>
                  <h3 className="font-semibold text-white">
                    {syncStatus.active_playlist
                      ? `Playlist: ${syncStatus.active_playlist}`
                      : "Download Status"}
                  </h3>
                  <p className="text-xs text-slate-400">
                    {syncStatus.current_track || "Warten auf nächste Aktion..."}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex items-center gap-3 text-xs font-medium">
                  <span className="text-emerald-400">Neu: {syncStatus.success_count}</span>
                  <span className="text-cyan-400">Übersprungen: {syncStatus.skipped_count}</span>
                  {syncStatus.failed_count > 0 && (
                    <span className="text-rose-400">Fehler: {syncStatus.failed_count}</span>
                  )}
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowLogs(!showLogs)}
                  className="h-8 border border-slate-800 text-xs text-slate-400 hover:text-white"
                >
                  <Terminal className="mr-1.5 h-3.5 w-3.5" />
                  {showLogs ? "Log verbergen" : "Log anzeigen"}
                </Button>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="mt-4">
              <div className="flex justify-between text-xs font-semibold text-slate-300">
                <span>
                  Fortschritt ({syncStatus.current_index} / {syncStatus.total_tracks} Tracks)
                </span>
                <span className="text-cyan-400">{syncStatus.percent}%</span>
              </div>
              <div className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full bg-slate-950 ring-1 ring-slate-800">
                <div
                  className="h-full bg-gradient-to-r from-cyan-500 via-indigo-500 to-fuchsia-500 transition-all duration-300"
                  style={{ width: `${syncStatus.percent}%` }}
                />
              </div>
            </div>

            {/* Console Log Window */}
            {showLogs && (
              <div className="mt-4 max-h-48 overflow-y-auto rounded-xl border border-slate-950 bg-black/60 p-3 font-mono text-[11px] text-slate-300 shadow-inner">
                {syncStatus.logs.map((log, i) => (
                  <div key={i} className="py-0.5 leading-relaxed">
                    <span className="text-slate-500">{log.substring(0, 10)}</span>
                    <span
                      className={
                        log.includes("FEHLER") || log.includes("Fehler")
                          ? "text-rose-400"
                          : log.includes("Hotcue") || log.includes("Überspringe")
                          ? "text-cyan-300"
                          : log.includes("Erfolgreich") || log.includes("Fertig")
                          ? "text-emerald-300"
                          : "text-slate-200"
                      }
                    >
                      {log.substring(10)}
                    </span>
                  </div>
                ))}
                <div ref={logEndRef} />
              </div>
            )}
          </Card>
        )}

        {/* DJ Track Library Section */}
        <div className="flex flex-col gap-4">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-lg font-bold text-white sm:text-xl">
                Lokale DJ-Bibliothek ({tracks.length} Songs)
              </h2>
              <p className="text-xs text-slate-400">
                Alle Titel im Zielordner stehen zum Sofort-Abspielen bereit.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                <Input
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  placeholder="Songs & Artists durchsuchen..."
                  className="h-9 border-slate-800 bg-slate-900/90 pl-9 text-xs text-slate-200 placeholder:text-slate-500"
                />
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={fetchTracks}
                disabled={isLoadingTracks}
                className="h-9 border-slate-800 bg-slate-900/60 text-slate-300 hover:text-white"
              >
                <RefreshCw className={`h-4 w-4 ${isLoadingTracks ? "animate-spin" : ""}`} />
              </Button>
            </div>
          </div>

          {/* Track Table / List */}
          {filteredTracks.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-800 bg-slate-900/40 py-16 text-center">
              <Music className="h-12 w-12 text-slate-600" />
              <h3 className="mt-3 text-sm font-semibold text-slate-300">
                {tracks.length === 0
                  ? "Noch keine Songs heruntergeladen"
                  : "Keine Tracks gefunden"}
              </h3>
              <p className="mt-1 text-xs text-slate-500">
                {tracks.length === 0
                  ? "Füge oben einen YouTube-Playlist-Link ein und klicke auf 'Sync starten'."
                  : "Überprüfe deinen Suchbegriff."}
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/50 shadow-xl">
              <div className="divide-y divide-slate-800/60">
                {filteredTracks.map((track) => {
                  const isCurrent = currentTrack?.id === track.id
                  return (
                    <div
                      key={track.id}
                      onClick={() => loadTrack(track, true)}
                      className={`group flex cursor-pointer items-center justify-between gap-4 px-4 py-3 transition-colors ${
                        isCurrent
                          ? "bg-cyan-950/40 text-cyan-200"
                          : "hover:bg-slate-800/50 text-slate-200"
                      }`}
                    >
                      {/* Left: Thumbnail & Song Info */}
                      <div className="flex min-w-0 items-center gap-3.5">
                        <div className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-800 ring-1 ring-slate-700/60">
                          {track.has_cover ? (
                            <img
                              src={`/api/cover/${track.id}`}
                              alt={track.title}
                              className="h-full w-full object-cover"
                              onError={(e) => {
                                ;(e.target as HTMLElement).style.display = "none"
                              }}
                            />
                          ) : (
                            <Music className="h-5 w-5 text-slate-500" />
                          )}
                          {/* Play overlay icon */}
                          <div
                            className={`absolute inset-0 flex items-center justify-center bg-black/50 transition-opacity ${
                              isCurrent ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                            }`}
                          >
                            {isCurrent && isPlaying ? (
                              <Pause className="h-5 w-5 text-cyan-400" />
                            ) : (
                              <Play className="h-5 w-5 text-white" />
                            )}
                          </div>
                        </div>

                        <div className="min-w-0">
                          <h4
                            className={`truncate text-sm font-semibold ${
                              isCurrent ? "text-cyan-400" : "text-white"
                            }`}
                          >
                            {track.title}
                          </h4>
                          <p className="truncate text-xs text-slate-400">
                            {track.artist} •{" "}
                            <span className="text-slate-500">{track.album}</span>
                          </p>
                        </div>
                      </div>

                      {/* Right: Duration, Size & Badge */}
                      <div className="flex shrink-0 items-center gap-4 text-xs text-slate-400">
                        <span className="hidden font-mono sm:inline">
                          {formatTime(track.duration)}
                        </span>
                        <span className="hidden font-mono sm:inline text-slate-500">
                          {track.size_mb} MB
                        </span>

                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation()
                            if (isCurrent) {
                              togglePlayPause()
                            } else {
                              loadTrack(track, true)
                            }
                          }}
                          className={`h-8 w-8 rounded-full p-0 ${
                            isCurrent
                              ? "bg-cyan-500 text-slate-950 hover:bg-cyan-400"
                              : "text-slate-400 hover:bg-slate-700 hover:text-white"
                          }`}
                        >
                          {isCurrent && isPlaying ? (
                            <Pause className="h-4 w-4" />
                          ) : (
                            <Play className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Sticky Bottom DJ Audio Player */}
      {currentTrack && (
        <footer className="fixed bottom-0 left-0 right-0 z-50 border-t border-slate-800 bg-slate-950/95 p-3 shadow-2xl backdrop-blur-xl sm:p-4">
          <div className="mx-auto flex max-w-7xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            {/* Left: Active Track Details */}
            <div className="flex items-center gap-3 sm:w-1/4">
              <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-slate-800 ring-1 ring-slate-700">
                {currentTrack.has_cover ? (
                  <img
                    src={`/api/cover/${currentTrack.id}`}
                    alt={currentTrack.title}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <Music className="m-3 h-6 w-6 text-slate-500" />
                )}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">
                  {currentTrack.title}
                </p>
                <p className="truncate text-xs text-cyan-400">{currentTrack.artist}</p>
              </div>
            </div>

            {/* Middle: Controls & Scrub Bar */}
            <div className="flex flex-1 flex-col items-center gap-1.5 sm:max-w-xl">
              <div className="flex items-center gap-4">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={playPrevTrack}
                  className="h-8 w-8 rounded-full p-0 text-slate-400 hover:text-white"
                >
                  <SkipBack className="h-4 w-4" />
                </Button>

                <Button
                  onClick={togglePlayPause}
                  className="h-10 w-10 rounded-full bg-cyan-500 p-0 text-slate-950 shadow-lg shadow-cyan-500/30 hover:bg-cyan-400 hover:scale-105 transition-transform"
                >
                  {isPlaying ? (
                    <Pause className="h-5 w-5" />
                  ) : (
                    <Play className="ml-0.5 h-5 w-5" />
                  )}
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={playNextTrack}
                  className="h-8 w-8 rounded-full p-0 text-slate-400 hover:text-white"
                >
                  <SkipForward className="h-4 w-4" />
                </Button>
              </div>

              {/* Progress Slider */}
              <div className="flex w-full items-center gap-3">
                <span className="font-mono text-[11px] text-slate-400">
                  {formatTime(currentTime)}
                </span>
                <input
                  type="range"
                  min={0}
                  max={duration || 100}
                  step={0.1}
                  value={currentTime}
                  onChange={handleSeek}
                  className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-slate-800 accent-cyan-400"
                />
                <span className="font-mono text-[11px] text-slate-400">
                  {formatTime(duration)}
                </span>
              </div>
            </div>

            {/* Right: Volume Slider */}
            <div className="hidden items-center justify-end gap-2.5 sm:flex sm:w-1/4">
              <button
                type="button"
                onClick={() => setIsMuted(!isMuted)}
                className="text-slate-400 hover:text-white"
              >
                {isMuted || volume === 0 ? (
                  <VolumeX className="h-4 w-4 text-rose-400" />
                ) : (
                  <Volume2 className="h-4 w-4" />
                )}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={isMuted ? 0 : volume}
                onChange={(e) => {
                  setVolume(parseFloat(e.target.value))
                  setIsMuted(false)
                }}
                className="h-1.5 w-24 cursor-pointer appearance-none rounded-full bg-slate-800 accent-cyan-400"
              />
            </div>
          </div>
        </footer>
      )}
    </div>
  )
}
