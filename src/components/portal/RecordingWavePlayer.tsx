import { useEffect, useRef, useState } from 'react';
import WaveSurfer from 'wavesurfer.js';
import { Button } from '@/components/ui/button';
import { Play, Pause, Download } from 'lucide-react';
import { toast } from 'sonner';

export function RecordingWavePlayer({ url, autoPlay = true }: { url: string; autoPlay?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const wsRef = useRef<WaveSurfer | null>(null);
  const [playing, setPlaying] = useState(false);
  const [fallback, setFallback] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!ref.current || !url) return;
    setReady(false);
    setFallback(false);
    let cancelled = false;
    const audio = new Audio();
    audio.src = url;
    audio.preload = 'auto';
    audioRef.current = audio;

    const ws = WaveSurfer.create({
      container: ref.current,
      waveColor: 'hsl(var(--muted-foreground))',
      progressColor: 'hsl(var(--primary))',
      height: 48,
      barWidth: 2,
      media: audio,
    });
    wsRef.current = ws;
    ws.on('play', () => setPlaying(true));
    ws.on('pause', () => setPlaying(false));
    ws.on('finish', () => setPlaying(false));
    ws.on('ready', () => {
      if (cancelled) return;
      setReady(true);
      if (autoPlay) ws.play().catch(() => { /* autoplay policy */ });
    });
    ws.on('error', (err) => {
      console.warn('[wavesurfer] decode error, using <audio> fallback', err);
      setFallback(true);
      if (autoPlay) audio.play().catch(() => toast.error('Click play to start (browser autoplay blocked)'));
    });

    return () => {
      cancelled = true;
      try { ws.destroy(); } catch {}
      try { audio.pause(); } catch {}
    };
  }, [url, autoPlay]);

  const toggle = () => {
    if (fallback) {
      const a = audioRef.current; if (!a) return;
      if (a.paused) { a.play(); setPlaying(true); } else { a.pause(); setPlaying(false); }
    } else {
      wsRef.current?.playPause();
    }
  };

  return (
    <div className="flex items-center gap-2 w-full">
      <Button size="icon" variant="outline" onClick={toggle} disabled={!ready && !fallback}>
        {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
      </Button>
      <div ref={ref} className="flex-1 min-w-0" hidden={fallback} />
      {fallback && (
        <audio ref={(el) => { if (el) audioRef.current = el; }} src={url} controls className="flex-1 min-w-0 h-9" />
      )}
      <a href={url} download className="inline-flex">
        <Button size="icon" variant="ghost" title="Download"><Download className="h-4 w-4" /></Button>
      </a>
    </div>
  );
}
