"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Trash2, Play, Pause, SkipBack, SkipForward, Music, Plus, Settings, ChevronDown, ChevronRight, Volume2, VolumeX, RefreshCw, Upload } from "lucide-react";

type Track = { name: string; file: string };
type Playlist = { id: string; title: string; tracks: Track[]; status: string };
type DlStatus = { status: string; percentage: number; eta: string; videoCurrent?: number; videoTotal?: number; playlistCurrent?: number; playlistTotal?: number };

export default function SyncTool() {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [newUrl, setNewUrl] = useState('');
  
  // Audio state
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const isScrubbingRef = useRef(false);
  const handleSkipRef = useRef<(direction: number) => void>(() => {});
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState([0]); // percentage
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState([80]);
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [currentPlaylistCtx, setCurrentPlaylistCtx] = useState<Playlist | null>(null);
  const [expandedPlaylist, setExpandedPlaylist] = useState<string | null>(null);
  const [dlStatus, setDlStatus] = useState<DlStatus>({ status: 'idle', percentage: 0, eta: '' });
  const [destPath, setDestPath] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [showVolume, setShowVolume] = useState(false);

  // Cookie state
  type CookieStatus = {
    exists: boolean;
    path?: string;
    sizeBytes?: number;
    updatedAt?: string;
    cookieCount?: number;
    hasYoutube?: boolean;
    hasAuth?: boolean;
  };
  const [cookieStatus, setCookieStatus] = useState<CookieStatus | null>(null);
  const [cookieUploading, setCookieUploading] = useState(false);
  const [cookieMsg, setCookieMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const cookieFileRef = useRef<HTMLInputElement | null>(null);

  const loadCookieStatus = async () => {
    try {
      const res = await fetch('/api/cookies');
      const data = await res.json();
      setCookieStatus(data);
    } catch {
      // ignore
    }
  };

  const handleCookieSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setCookieUploading(true);
    setCookieMsg(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/cookies', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setCookieStatus(data);
        setCookieMsg({ text: data.message || 'Cookie-Datei erfolgreich hinterlegt!', ok: true });
      } else {
        setCookieMsg({ text: data.error || 'Fehler beim Hochladen der Cookies.', ok: false });
      }
    } catch {
      setCookieMsg({ text: 'Verbindungsfehler beim Upload.', ok: false });
    } finally {
      setCookieUploading(false);
      if (cookieFileRef.current) cookieFileRef.current.value = '';
    }
  };

  const handleDeleteCookies = async () => {
    try {
      const res = await fetch('/api/cookies', { method: 'DELETE' });
      if (res.ok) {
        setCookieStatus({ exists: false });
        setCookieMsg({ text: 'Cookies wurden entfernt.', ok: true });
      }
    } catch {
      setCookieMsg({ text: 'Fehler beim Entfernen der Cookies.', ok: false });
    }
  };

  // Load configuration
  const loadConfig = async () => {
    try {
      const res = await fetch('/api/config');
      const data = await res.json();
      if (data.path) setDestPath(data.path);
    } catch (error) {
      console.error('Failed to load config:', error);
    }
    loadCookieStatus();
  };

  const saveConfig = async () => {
    try {
      await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: destPath })
      });
    } catch (error) {
      console.error('Failed to save config:', error);
    }
  };

  // Load library
  const loadLibrary = async () => {
    try {
      const res = await fetch('/api/library');
      const data = await res.json();
      if (data.playlists) setPlaylists(data.playlists);
    } catch (error) {
      console.error('Failed to load library:', error);
    }
  };

  const pollStatus = async () => {
    try {
      const res = await fetch('/api/status');
      const data = await res.json();
      setDlStatus(data);
    } catch (error) {
      // ignore
    }
  };

  useEffect(() => {
    loadConfig();
    loadLibrary();
    pollStatus();
    
    // Poll library every 5 seconds
    const libInterval = setInterval(loadLibrary, 5000);
    // Poll status every 1 second
    const statusInterval = setInterval(pollStatus, 1000);
    
    return () => {
      clearInterval(libInterval);
      clearInterval(statusInterval);
    };
  }, []);

  // Audio initialization (only once on mount so scrubbing never recreates/stops the Audio instance!)
  useEffect(() => {
    const audio = new Audio();
    audioRef.current = audio;

    const updateTime = () => {
      if (!isScrubbingRef.current) {
        setCurrentTime(audio.currentTime);
        if (audio.duration) {
          setProgress([(audio.currentTime / audio.duration) * 100]);
        }
      }
    };
    
    const updateDuration = () => setDuration(audio.duration);
    const onEnded = () => handleSkipRef.current(1); // Auto play next track

    audio.addEventListener('timeupdate', updateTime);
    audio.addEventListener('loadedmetadata', updateDuration);
    audio.addEventListener('ended', onEnded);

    return () => {
      audio.removeEventListener('timeupdate', updateTime);
      audio.removeEventListener('loadedmetadata', updateDuration);
      audio.removeEventListener('ended', onEnded);
      audio.pause();
    };
  }, []);

  // Set initial volume
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume[0] / 100;
    }
  }, []);

  // Playback control
  useEffect(() => {
    if (audioRef.current && currentTrack) {
      setProgress([0]);
      setCurrentTime(0);
      audioRef.current.src = `/api/stream?file=${encodeURIComponent(currentTrack.file)}`;
      audioRef.current.play().then(() => setIsPlaying(true)).catch(console.error);
    }
  }, [currentTrack]);

  useEffect(() => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.play().catch(() => setIsPlaying(false));
      } else {
        audioRef.current.pause();
      }
    }
  }, [isPlaying]);

  const handleSliderChange = (val: any) => {
    const numericVal = Array.isArray(val) ? val[0] : val;
    isScrubbingRef.current = true;
    setProgress([numericVal]);
    if (audioRef.current && duration) {
      const newTime = (numericVal / 100) * duration;
      audioRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    }
    // Falls nur geklickt statt gezogen wurde, nach kurzem Timeout Scrubbing-Lock freigeben
    setTimeout(() => {
      isScrubbingRef.current = false;
    }, 150);
  };

  const handleSliderCommit = () => {
    isScrubbingRef.current = false;
  };

  const handleVolumeChange = (val: any) => {
    const numericVal = Array.isArray(val) ? val[0] : val;
    setVolume([numericVal]);
    
    if (audioRef.current) {
      audioRef.current.volume = numericVal / 100;
    }
  };

  const handleSkip = (direction: number) => {
    if (!currentPlaylistCtx || !currentTrack) return;
    const tracks = currentPlaylistCtx.tracks;
    const currentIndex = tracks.findIndex(t => t.file === currentTrack.file);
    if (currentIndex === -1) return;
    
    let nextIndex = currentIndex + direction;
    if (nextIndex >= tracks.length) nextIndex = 0; // Loop to start
    if (nextIndex < 0) nextIndex = tracks.length - 1; // Loop to end
    
    setCurrentTrack(tracks[nextIndex]);
  };
  handleSkipRef.current = handleSkip;

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUrl.trim()) return;
    
    const urlToDownload = newUrl;
    setNewUrl('');
    
    try {
      const res = await fetch('/api/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: urlToDownload })
      });
      if (!res.ok) console.error('Failed to start download');
    } catch (err) {
      console.error('Error:', err);
    }
  };

  const handleSyncAll = async () => {
    try {
      const res = await fetch('/api/sync-all', { method: 'POST' });
      if (!res.ok) console.error('Failed to start bulk sync');
    } catch (err) {
      console.error('Error starting sync:', err);
    }
  };

  const [isPatchingTraktor, setIsPatchingTraktor] = useState(false);
  const [traktorPatchResult, setTraktorPatchResult] = useState<{success?: boolean, message?: string} | null>(null);

  const handleTraktorPatch = async () => {
    setIsPatchingTraktor(true);
    setTraktorPatchResult(null);
    try {
      const res = await fetch('/api/traktor-patch', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setTraktorPatchResult({ success: false, message: data.error || 'Ein Fehler ist aufgetreten.' });
      } else {
        setTraktorPatchResult({ success: true, message: data.message });
      }
    } catch (err: any) {
      setTraktorPatchResult({ success: false, message: 'Verbindungsfehler zur API.' });
    } finally {
      setIsPatchingTraktor(false);
    }
  };

  const formatTime = (seconds: number) => {
    if (isNaN(seconds)) return "0:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const getGradient = (title: string) => {
    // Generate a very subtle monochrome gradient based on title length
    const val1 = 12 + (title.length % 5);
    const val2 = 6 + (title.length % 3);
    return `linear-gradient(135deg, hsl(0, 0%, ${val1}%), hsl(0, 0%, ${val2}%))`;
  };

  return (
    <div className="min-h-screen bg-black text-zinc-100 font-sans selection:bg-zinc-800 pb-40">
      <main className="max-w-5xl mx-auto pt-24 px-6 md:px-8 space-y-16">
        
        {/* Header */}
        <header className="flex flex-col items-center justify-center text-center space-y-3 max-w-2xl mx-auto">
          <div className="flex flex-col items-center gap-2 relative w-full">
            <h1 className="text-3xl font-bold tracking-tight mt-4">DJ Local Sync</h1>
            <p className="text-zinc-500 text-sm max-w-sm mx-auto">
              Sync YouTube Playlists directly to your local drive.
            </p>

            {/* Quick Status Pill for Cookies */}
            <div className="flex items-center justify-center gap-2 pt-1">
              <button 
                type="button"
                onClick={() => setShowSettings(prev => !prev)} 
                className="inline-flex items-center gap-2 text-xs px-3 py-1 rounded-full border transition-all bg-zinc-900/80 hover:bg-zinc-800 border-zinc-800 text-zinc-300 shadow-sm cursor-pointer"
                title="Klicken, um Cookie-Einstellungen zu öffnen"
              >
                {cookieStatus?.exists ? (
                  <>
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                    <span className="text-emerald-400 font-medium">YouTube Premium Cookies aktiv</span>
                    <span className="text-zinc-500 text-[11px]">({cookieStatus.cookieCount} Cookies{cookieStatus.hasAuth ? ' • Login verifiziert' : ''})</span>
                  </>
                ) : (
                  <>
                    <Upload className="w-3 h-3 text-amber-400" />
                    <span className="text-zinc-300 font-medium">YouTube Cookies hinzufügen</span>
                    <span className="text-zinc-500 text-[11px]">(für 256k Premium-Audio)</span>
                  </>
                )}
              </button>
            </div>
            
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setShowSettings(!showSettings)}
              className="absolute right-0 top-0 h-9 px-3 bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:text-zinc-100 rounded-lg text-xs flex items-center gap-2"
              title="Einstellungen öffnen"
            >
              <Settings className="w-4 h-4" />
              <span className="hidden sm:inline">Einstellungen</span>
              {cookieStatus?.exists && (
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
              )}
            </Button>
          </div>
          
          {showSettings && (
            <div className="w-full bg-zinc-900/50 border border-zinc-800/80 rounded-xl p-5 animate-in fade-in slide-in-from-top-2 text-left mt-4 space-y-5">
              <div>
                <label className="text-[10px] font-medium text-zinc-500 uppercase tracking-widest ml-1 mb-2 block">
                  Lokaler Zielordner (Download-Pfad)
                </label>
                <Input 
                  placeholder="C:\Users\...\Music\DJ_Downloads" 
                  value={destPath} 
                  onChange={e => setDestPath(e.target.value)} 
                  onBlur={saveConfig}
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
                      ✓ Aktiv ({cookieStatus.cookieCount || 0} Cookies{cookieStatus.hasAuth ? ' • Login erkannt' : ''})
                    </span>
                  ) : (
                    <span className="text-[11px] font-medium text-zinc-500 bg-zinc-900 border border-zinc-800 rounded px-2 py-0.5">
                      Nicht hinterlegt (Standard-Qualität)
                    </span>
                  )}
                </div>

                <p className="text-xs text-zinc-400 mb-3 ml-1">
                  Ermöglicht ungedrosselte 256k AAC- und Opus-Quellstreams direkt von YouTube Music.
                </p>

                <div className="flex flex-wrap items-center gap-3">
                  <input 
                    type="file" 
                    accept=".txt" 
                    ref={cookieFileRef}
                    onChange={handleCookieSelect}
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
                    {cookieUploading ? 'Wird geprüft...' : cookieStatus?.exists ? 'Neue cookies.txt auswählen' : 'cookies.txt auswählen'}
                  </Button>

                  {cookieStatus?.exists && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleDeleteCookies}
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
                  <div className={`mt-3 text-xs px-3 py-2 rounded-lg border ${
                    cookieMsg.ok 
                      ? 'bg-emerald-950/40 border-emerald-800/50 text-emerald-300' 
                      : 'bg-red-950/40 border-red-800/50 text-red-300'
                  }`}>
                    {cookieMsg.text}
                  </div>
                )}
              </div>
            </div>
          )}
        </header>

        {/* Input Section & Progress */}
        <section className="space-y-4 max-w-2xl mx-auto w-full pt-4">
          <form onSubmit={handleAdd} className="flex flex-col sm:flex-row gap-3">
            <Input 
              placeholder="Paste YouTube Playlist URL..." 
              value={newUrl} 
              onChange={e => setNewUrl(e.target.value)} 
              className="h-12 bg-zinc-900/50 border-zinc-800/80 text-zinc-100 placeholder:text-zinc-600 focus-visible:ring-zinc-700 focus-visible:ring-1 rounded-xl px-4 flex-1 shadow-sm transition-all"
            />
            <Button 
              type="submit" 
              className="h-12 bg-zinc-100 text-zinc-900 hover:bg-zinc-300 font-medium px-8 rounded-xl transition-colors shadow-sm"
              disabled={dlStatus.status === 'downloading'}
            >
              <Plus className="w-4 h-4 mr-2" />
              Download
            </Button>
          </form>
          


          {/* Live Progress Bar */}
          {dlStatus.status === 'downloading' && (
            <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-xl p-4 overflow-hidden animate-in fade-in slide-in-from-top-2">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-medium text-green-400 flex items-center">
                  <RefreshCw className="w-3 h-3 mr-1.5 animate-spin" />
                  Downloading...
                </span>
                <span className="text-xs text-zinc-400 font-mono">
                  {dlStatus.playlistTotal && dlStatus.playlistTotal > 0 ? `Playlist ${dlStatus.playlistCurrent || 1}/${dlStatus.playlistTotal} - ` : ''}
                  {dlStatus.videoTotal && dlStatus.videoTotal > 0 ? `Song ${dlStatus.videoCurrent}/${dlStatus.videoTotal} - ` : ''}
                  {dlStatus.eta ? `ETA: ${dlStatus.eta}` : 'Calculating...'}
                </span>
              </div>
              <div className="w-full bg-zinc-800 rounded-full h-1.5 overflow-hidden">
                <div 
                  className="bg-green-500 h-1.5 rounded-full transition-all duration-300 ease-out"
                  style={{ width: `${Math.max(2, dlStatus.percentage)}%` }}
                />
              </div>
            </div>
          )}
        </section>

        {/* Playlists */}
        <section className="space-y-6">
          <div className="flex items-center justify-between ml-1 max-w-5xl">
            <h2 className="text-xs font-medium text-zinc-500 uppercase tracking-widest">Local Library</h2>
            <div className="flex items-center gap-3">
              {traktorPatchResult && (
                <span className={`text-xs font-medium px-2 py-1 rounded ${traktorPatchResult.success ? 'bg-green-900/40 text-green-400' : 'bg-red-900/40 text-red-400'}`}>
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
                {isPatchingTraktor ? <RefreshCw className="w-3.5 h-3.5 mr-2 animate-spin" /> : <Music className="w-3.5 h-3.5 mr-2" />}
                Traktor Hotcues Generieren
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleSyncAll}
                disabled={dlStatus.status === 'downloading'}
                className="h-9 px-4 bg-zinc-900/50 border-zinc-800 text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800 disabled:opacity-50 rounded-lg transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 mr-2 ${dlStatus.status === 'downloading' ? 'animate-spin' : ''}`} />
                Sync Config
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => {
                  setShowSettings(true);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className={`h-9 px-4 bg-zinc-900/50 border-zinc-800 rounded-lg transition-colors flex items-center gap-2 ${
                  cookieStatus?.exists ? 'text-emerald-400 hover:bg-emerald-950/30' : 'text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800'
                }`}
              >
                <Upload className="w-3.5 h-3.5" />
                {cookieStatus?.exists ? 'Cookies (Aktiv)' : 'Cookies'}
              </Button>
            </div>
          </div>
          
          <div className="flex flex-col md:flex-row gap-5 h-[50vh] min-h-[400px]">
            {/* Left Column: Playlists */}
            <div className="w-full md:w-1/3 flex flex-col gap-3 overflow-y-auto pr-2">
              {playlists.length === 0 && (
                <div className="p-8 border border-dashed border-zinc-800/80 rounded-2xl flex flex-col items-center justify-center text-zinc-500 text-sm h-full">
                  No local playlists.
                </div>
              )}
              
              {playlists.map(p => (
                <div 
                  key={p.id} 
                  className={`flex flex-col rounded-xl overflow-hidden border transition-all duration-200 cursor-pointer flex-shrink-0 ${expandedPlaylist === p.id ? 'border-zinc-500 bg-zinc-800/80' : 'border-zinc-800/50 bg-zinc-900/30 hover:border-zinc-700 hover:bg-zinc-900/60'}`}
                  onClick={() => setExpandedPlaylist(p.id)}
                >
                  <div className="flex items-center justify-between p-4 relative group">
                    <div className="relative z-10 w-full min-w-0 pr-3">
                      <h3 className={`font-medium text-sm line-clamp-1 transition-colors ${expandedPlaylist === p.id ? 'text-white' : 'text-zinc-300 group-hover:text-white'}`}>{p.title}</h3>
                      <p className={`text-[11px] font-medium mt-1 flex items-center gap-1.5 ${expandedPlaylist === p.id ? 'text-zinc-400' : 'text-zinc-500'}`}>
                        <Music className="w-3 h-3" />
                        {p.tracks.length} Tracks
                      </p>
                    </div>
                    <div className={`relative z-10 p-1.5 rounded-full transition-colors flex-shrink-0 ${expandedPlaylist === p.id ? 'bg-zinc-700 text-white' : 'text-zinc-600 bg-black/20 group-hover:bg-black/40 group-hover:text-zinc-400'}`}>
                      <ChevronRight className="w-4 h-4" />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Right Column: Tracklist */}
            <div className="w-full md:w-2/3 bg-zinc-900/30 border border-zinc-800/50 rounded-2xl flex flex-col overflow-hidden">
              {expandedPlaylist ? (
                <>
                  <div className="p-4 border-b border-zinc-800/50 bg-zinc-900/50 flex-shrink-0">
                    <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                      <Music className="w-4 h-4 text-zinc-400" /> 
                      {playlists.find(p => p.id === expandedPlaylist)?.title} 
                      <span className="text-zinc-500 font-normal ml-2">({playlists.find(p => p.id === expandedPlaylist)?.tracks.length} Tracks)</span>
                    </h3>
                  </div>
                  <div className="overflow-y-auto p-2 flex-1">
                    {playlists.find(p => p.id === expandedPlaylist)?.tracks.map((track, idx) => (
                      <div 
                        key={idx}
                        className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer text-sm transition-colors ${currentTrack?.file === track.file ? 'bg-zinc-100 text-zinc-900 font-medium shadow-sm' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60'}`}
                        onClick={() => {
                          const p = playlists.find(p => p.id === expandedPlaylist);
                          if (p) {
                            setCurrentPlaylistCtx(p);
                            setCurrentTrack(track);
                          }
                        }}
                      >
                        {currentTrack?.file === track.file && isPlaying ? (
                          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse ml-1 flex-shrink-0" />
                        ) : (
                          <div className="w-2 h-2 ml-1 flex-shrink-0 opacity-50" />
                        )}
                        <span className="truncate flex-1 leading-relaxed">{track.name}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-zinc-500 text-sm">
                  <Music className="w-8 h-8 mb-3 opacity-20" />
                  Select a playlist to view tracks
                </div>
              )}
            </div>
          </div>
        </section>
      </main>

      {/* Floating Player */}
      <div className="fixed bottom-8 left-1/2 -translate-x-1/2 w-full max-w-[calc(100%-2rem)] md:max-w-3xl z-50">
        <div className="flex flex-col gap-4 p-4 md:p-5 bg-zinc-100 text-zinc-900 border border-zinc-200 rounded-2xl shadow-2xl relative overflow-hidden">
          
          <div className="flex items-center justify-between relative z-10">
            <div className="flex items-center gap-4 flex-1 overflow-hidden">
              <div className="w-12 h-12 rounded-lg bg-zinc-200 flex items-center justify-center border border-zinc-300 flex-shrink-0">
                <Music className="w-5 h-5 text-zinc-500" />
              </div>
              <div className="flex-1 min-w-0 pr-4">
                <p className="font-semibold text-sm truncate">
                  {currentTrack ? currentTrack.name : 'No track selected'}
                </p>
                <p className="text-zinc-500 text-xs truncate mt-0.5 font-medium">
                  {currentPlaylistCtx ? currentPlaylistCtx.title : 'Local DJ Audio'}
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-1 md:gap-3 flex-shrink-0 justify-center">
              <Button variant="ghost" size="icon" onClick={() => handleSkip(-1)} className="text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200 rounded-full h-10 w-10">
                <SkipBack className="w-5 h-5 fill-current" />
              </Button>
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => currentTrack && setIsPlaying(!isPlaying)}
                className="w-14 h-14 bg-zinc-900 text-zinc-100 hover:bg-zinc-800 rounded-full transition-transform active:scale-95 shadow-md"
              >
                {isPlaying ? <Pause className="w-6 h-6 fill-current" /> : <Play className="w-6 h-6 ml-1 fill-current" />}
              </Button>
              <Button variant="ghost" size="icon" onClick={() => handleSkip(1)} className="text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200 rounded-full h-10 w-10">
                <SkipForward className="w-5 h-5 fill-current" />
              </Button>
            </div>
            
            <div className="flex-1 hidden md:flex items-center justify-end gap-3 pl-6 relative">
              {volume[0] === 0 ? <VolumeX className="w-4 h-4 text-zinc-500" /> : <Volume2 className="w-4 h-4 text-zinc-500" />}
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
    </div>
  );
}
