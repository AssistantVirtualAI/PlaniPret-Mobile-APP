import { useState, useCallback } from 'react';
import { Check, Play, Pause, Volume2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useElevenLabsVoices } from '@/hooks/useElevenLabsFullConfig';
import type { ElevenLabsVoice } from '@/types/elevenlabs-full';

interface VoiceSelectorProps {
  selectedVoiceId: string | null;
  onSelect: (voice: ElevenLabsVoice) => void;
  apiKey?: string | null;
  organizationId?: string | null;
}

export function VoiceSelector({ selectedVoiceId, onSelect, apiKey, organizationId }: VoiceSelectorProps) {
  // Use organizationId if provided (for portal), otherwise use apiKey
  const effectiveId = organizationId || apiKey;
  const isOrganizationId = !!organizationId;
  const { data: voices, isLoading } = useElevenLabsVoices(effectiveId, isOrganizationId);
  const [search, setSearch] = useState('');
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [audio, setAudio] = useState<HTMLAudioElement | null>(null);

  const filteredVoices = voices?.filter(voice => 
    voice.name.toLowerCase().includes(search.toLowerCase()) ||
    voice.labels?.accent?.toLowerCase().includes(search.toLowerCase()) ||
    voice.labels?.gender?.toLowerCase().includes(search.toLowerCase())
  ) || [];

  const handlePlayPreview = useCallback((voice: ElevenLabsVoice) => {
    if (playingId === voice.voice_id) {
      audio?.pause();
      setPlayingId(null);
      setAudio(null);
      return;
    }

    if (audio) {
      audio.pause();
    }

    if (voice.preview_url) {
      const newAudio = new Audio(voice.preview_url);
      newAudio.onended = () => {
        setPlayingId(null);
        setAudio(null);
      };
      newAudio.play();
      setAudio(newAudio);
      setPlayingId(voice.voice_id);
    }
  }, [playingId, audio]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Input
        placeholder="Rechercher une voix..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="bg-background/50"
      />
      
      <ScrollArea className="h-[400px] pr-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filteredVoices.map((voice) => (
            <Card
              key={voice.voice_id}
              className={cn(
                "p-4 cursor-pointer transition-all hover:border-primary/50",
                selectedVoiceId === voice.voice_id && "border-primary bg-primary/5"
              )}
              onClick={() => onSelect(voice)}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="font-medium truncate">{voice.name}</h4>
                    {selectedVoiceId === voice.voice_id && (
                      <Check className="h-4 w-4 text-primary shrink-0" />
                    )}
                  </div>
                  
                  <div className="flex flex-wrap gap-1 mt-2">
                    {voice.labels?.accent && (
                      <Badge variant="secondary" className="text-xs">
                        {voice.labels.accent}
                      </Badge>
                    )}
                    {voice.labels?.gender && (
                      <Badge variant="outline" className="text-xs">
                        {voice.labels.gender}
                      </Badge>
                    )}
                    {voice.labels?.age && (
                      <Badge variant="outline" className="text-xs">
                        {voice.labels.age}
                      </Badge>
                    )}
                    {voice.category && (
                      <Badge variant="outline" className="text-xs">
                        {voice.category}
                      </Badge>
                    )}
                  </div>
                  
                  {voice.description && (
                    <p className="text-xs text-muted-foreground mt-2 line-clamp-2">
                      {voice.description}
                    </p>
                  )}
                </div>
                
                {voice.preview_url && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      handlePlayPreview(voice);
                    }}
                  >
                    {playingId === voice.voice_id ? (
                      <Pause className="h-4 w-4" />
                    ) : (
                      <Play className="h-4 w-4" />
                    )}
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
        
        {filteredVoices.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <Volume2 className="h-10 w-10 mb-3 opacity-50" />
            <p>Aucune voix trouvée</p>
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
