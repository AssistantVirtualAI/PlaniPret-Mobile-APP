import React, { useState, useRef, useEffect } from 'react';
import WaveSurfer from 'wavesurfer.js';
import { Play, Pause, SkipBack, SkipForward, Download, Volume2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';

interface TranscriptSegment {
  speaker: 'agent' | 'caller';
  text: string;
  timestamp: number;
  confidence?: number;
}

interface AdvancedAudioPlayerProps {
  audioUrl: string;
  conversation: {
    conversation_id: string;
    caller_number?: string;
    duration_seconds?: number;
    satisfaction_score?: number;
  };
  transcript?: TranscriptSegment[];
  onTimestampClick?: (timestamp: number) => void;
}

export function AdvancedAudioPlayer({ 
  audioUrl, 
  conversation, 
  transcript = [], 
  onTimestampClick 
}: AdvancedAudioPlayerProps) {
  const waveformRef = useRef<HTMLDivElement>(null);
  const wavesurfer = useRef<WaveSurfer | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [volume, setVolume] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [audioError, setAudioError] = useState<string | null>(null);

  useEffect(() => {
    if (!waveformRef.current || !audioUrl) return;

    setIsLoading(true);
    setAudioError(null);

    try {
      // Initialize WaveSurfer with cyberpunk style
      wavesurfer.current = WaveSurfer.create({
        container: waveformRef.current,
        waveColor: 'rgba(139, 92, 246, 0.6)',
        progressColor: 'hsl(var(--primary))',
        cursorColor: 'hsl(var(--accent))',
        barWidth: 2,
        barRadius: 1,
        height: 80,
        normalize: true,
      });

      // Load audio
      wavesurfer.current.load(audioUrl);

      // Event listeners
      wavesurfer.current.on('ready', () => {
        setDuration(wavesurfer.current?.getDuration() || 0);
        setIsLoading(false);
        setAudioError(null);
      });

      wavesurfer.current.on('audioprocess', () => {
        setCurrentTime(wavesurfer.current?.getCurrentTime() || 0);
      });

      wavesurfer.current.on('play', () => setIsPlaying(true));
      wavesurfer.current.on('pause', () => setIsPlaying(false));

      // Error handling
      wavesurfer.current.on('error', (err) => {
        console.error('[AdvancedAudioPlayer] WaveSurfer error:', err);
        setAudioError('Impossible de charger l\'audio');
        setIsLoading(false);
      });

    } catch (err) {
      console.error('[AdvancedAudioPlayer] Error initializing WaveSurfer:', err);
      setAudioError('Erreur d\'initialisation du lecteur audio');
      setIsLoading(false);
    }

    return () => {
      try {
        wavesurfer.current?.destroy();
      } catch (e) {
        // Ignore destroy errors
      }
    };
  }, [audioUrl]);

  const togglePlayPause = () => {
    if (!wavesurfer.current || audioError) return;
    wavesurfer.current.playPause();
  };

  const skipBackward = () => {
    if (!wavesurfer.current || duration <= 0) return;
    const newTime = Math.max(0, currentTime - 10);
    wavesurfer.current.seekTo(newTime / duration);
  };

  const skipForward = () => {
    if (!wavesurfer.current || duration <= 0) return;
    const newTime = Math.min(duration, currentTime + 10);
    wavesurfer.current.seekTo(newTime / duration);
  };

  const changePlaybackRate = (rate: number) => {
    setPlaybackRate(rate);
    wavesurfer.current?.setPlaybackRate(rate);
  };

  const changeVolume = (newVolume: number[]) => {
    const vol = newVolume[0];
    setVolume(vol);
    wavesurfer.current?.setVolume(vol);
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const downloadAudio = () => {
    const link = document.createElement('a');
    link.href = audioUrl;
    link.download = `conversation-${conversation.conversation_id}.mp3`;
    link.click();
  };

  const jumpToTimestamp = (timestamp: number) => {
    if (wavesurfer.current && duration > 0) {
      const time = timestamp / 1000;
      wavesurfer.current.seekTo(time / duration);
      onTimestampClick?.(timestamp);
    }
  };

  return (
    <div className="glass-card p-6 space-y-4">
      {/* Metadata */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h3 className="text-lg font-semibold text-foreground">
            Conversation {conversation.conversation_id.substring(0, 8)}
          </h3>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            {conversation.caller_number && (
              <span>📞 {conversation.caller_number}</span>
            )}
            <span>⏱️ {formatTime(conversation.duration_seconds || 0)}</span>
            {conversation.satisfaction_score && (
              <Badge variant="outline">
                ⭐ {(conversation.satisfaction_score * 100).toFixed(1)}%
              </Badge>
            )}
          </div>
        </div>
        
        <Button
          variant="outline"
          size="sm"
          onClick={downloadAudio}
          disabled={!!audioError}
        >
          <Download className="w-4 h-4" />
        </Button>
      </div>

      {/* Audio Error State */}
      {audioError && (
        <div className="flex items-center gap-3 p-4 bg-destructive/10 rounded-lg text-destructive">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <p className="text-sm">{audioError}</p>
        </div>
      )}

      {/* Waveform */}
      {!audioError && (
        <div className="relative">
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/20 rounded">
              <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
            </div>
          )}
          <div ref={waveformRef} className="w-full" />
        </div>
      )}

      {/* Controls */}
      {!audioError && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* Playback controls */}
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={skipBackward}
                disabled={isLoading || duration <= 0}
              >
                <SkipBack className="w-4 h-4" />
              </Button>
              
              <Button
                onClick={togglePlayPause}
                disabled={isLoading}
              >
                {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
              </Button>
              
              <Button
                variant="outline"
                size="sm"
                onClick={skipForward}
                disabled={isLoading || duration <= 0}
              >
                <SkipForward className="w-4 h-4" />
              </Button>
            </div>

            {/* Time */}
            <div className="text-sm text-muted-foreground">
              {formatTime(currentTime)} / {formatTime(duration)}
            </div>
          </div>

          <div className="flex items-center gap-6">
            {/* Speed control */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Speed:</span>
              <div className="flex gap-1">
                {[0.5, 1, 1.5, 2].map(rate => (
                  <Button
                    key={rate}
                    variant={playbackRate === rate ? "default" : "outline"}
                    size="sm"
                    onClick={() => changePlaybackRate(rate)}
                    disabled={isLoading}
                  >
                    {rate}x
                  </Button>
                ))}
              </div>
            </div>

            {/* Volume control */}
            <div className="flex items-center gap-2">
              <Volume2 className="w-4 h-4 text-muted-foreground" />
              <Slider
                value={[volume]}
                onValueChange={changeVolume}
                max={1}
                step={0.1}
                className="w-20"
                disabled={isLoading}
              />
            </div>
          </div>
        </div>
      )}

      {/* Transcript with clickable timestamps */}
      {transcript.length > 0 && (
        <div className="border-t border-border pt-4">
          <h4 className="text-sm font-medium mb-3">Transcription</h4>
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {transcript.map((segment, index) => (
              <div
                key={index}
                className="flex items-start gap-3 p-2 rounded hover:bg-accent/10 cursor-pointer transition-colors"
                onClick={() => jumpToTimestamp(segment.timestamp)}
              >
                <Badge 
                  variant="outline" 
                  className="text-xs"
                >
                  {segment.speaker === 'agent' ? '🤖' : '👤'} {formatTime(segment.timestamp / 1000)}
                </Badge>
                <p className="text-sm text-muted-foreground flex-1">{segment.text}</p>
                {segment.confidence && (
                  <span className="text-xs text-muted-foreground">
                    {(segment.confidence * 100).toFixed(0)}%
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}