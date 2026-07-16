import { useState, useRef, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Play, Pause, Check, Volume2, Zap, Phone, Bot, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { VoiceSettings } from '@/hooks/useCreatePlatformAgent';

interface Voice {
  voice_id: string;
  name: string;
  labels?: Record<string, string>;
  preview_url?: string;
  description?: string;
  category?: string;
  provider?: string;
  gender?: string;
  language?: string;
  accent?: string;
}

interface PlatformVoiceSelectorProps {
  platform: 'elevenlabs' | 'vapi' | 'retell';
  organizationId: string;
  selectedVoiceSettings: VoiceSettings;
  onSelect: (settings: VoiceSettings) => void;
}

const TTS_MODELS = [
  { id: 'eleven_turbo_v2_5', name: 'Turbo v2.5', description: 'Fastest, low latency' },
  { id: 'eleven_turbo_v2', name: 'Turbo v2', description: 'Fast, good quality' },
  { id: 'eleven_multilingual_v2', name: 'Multilingual v2', description: 'Best quality, multi-language' },
  { id: 'eleven_monolingual_v1', name: 'Monolingual v1', description: 'English only, legacy' },
];

const VOICE_CATEGORIES = [
  { value: 'all', label: 'All Voices' },
  { value: 'premade', label: 'Premade' },
  { value: 'cloned', label: 'Cloned' },
  { value: 'professional', label: 'Professional' },
];

export function PlatformVoiceSelector({
  platform,
  organizationId,
  selectedVoiceSettings,
  onSelect,
}: PlatformVoiceSelectorProps) {
  const [search, setSearch] = useState('');
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [genderFilter, setGenderFilter] = useState<string>('all');
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Fetch voices based on platform
  const { data: voices, isLoading } = useQuery({
    queryKey: ['platform-voices', platform, organizationId],
    queryFn: async () => {
      let functionName: string;
      let actionName: string;

      switch (platform) {
        case 'elevenlabs':
          functionName = 'elevenlabs-convai-agent-config';
          actionName = 'get_voices';
          break;
        case 'vapi':
          // Vapi uses ElevenLabs voices primarily
          functionName = 'elevenlabs-convai-agent-config';
          actionName = 'get_voices';
          break;
        case 'retell':
          functionName = 'retell-proxy';
          actionName = 'listVoices';
          break;
        default:
          throw new Error(`Unknown platform: ${platform}`);
      }

      const { data, error } = await supabase.functions.invoke(functionName, {
        body: { action: actionName, organizationId },
      });

      if (error) throw error;
      
      // Normalize voice data across platforms
      // retell-proxy returns { success: true, data: [...] }
      // elevenlabs returns { voices: [...] }
      let rawVoices: any[] = [];
      if (platform === 'retell') {
        rawVoices = data?.data || data || [];
      } else {
        rawVoices = data?.voices || data || [];
      }
      
      return rawVoices.map((v: any) => ({
        voice_id: v.voice_id || v.id || v.voiceId,
        name: v.name || v.voice_name || 'Unknown Voice',
        labels: v.labels || {},
        // Retell uses preview_audio_url, ElevenLabs uses preview_url
        preview_url: v.preview_url || v.preview_audio_url || v.sample_audio_url,
        description: v.description,
        category: v.category || v.labels?.category,
        gender: v.labels?.gender || v.gender,
        language: v.labels?.language || v.language,
        accent: v.labels?.accent || v.accent,
        provider: v.provider || platform,
      })) as Voice[];
    },
    enabled: !!organizationId,
  });

  // Filter voices
  const filteredVoices = useMemo(() => {
    if (!voices) return [];
    
    return voices.filter((v) => {
      // Search filter
      const matchesSearch = 
        v.name.toLowerCase().includes(search.toLowerCase()) ||
        v.description?.toLowerCase().includes(search.toLowerCase()) ||
        Object.values(v.labels || {}).some((label) =>
          String(label).toLowerCase().includes(search.toLowerCase())
        );
      
      // Category filter
      const matchesCategory = categoryFilter === 'all' || 
        v.category?.toLowerCase() === categoryFilter.toLowerCase();
      
      // Gender filter
      const matchesGender = genderFilter === 'all' || 
        v.gender?.toLowerCase() === genderFilter.toLowerCase();
      
      return matchesSearch && matchesCategory && matchesGender;
    });
  }, [voices, search, categoryFilter, genderFilter]);

  const handlePlayPreview = async (voice: Voice) => {
    if (!voice.preview_url) return;

    if (playingId === voice.voice_id) {
      audioRef.current?.pause();
      setPlayingId(null);
      return;
    }

    if (audioRef.current) {
      audioRef.current.pause();
    }

    setIsLoadingAudio(true);
    try {
      audioRef.current = new Audio(voice.preview_url);
      await audioRef.current.play();
      audioRef.current.onended = () => setPlayingId(null);
      setPlayingId(voice.voice_id);
    } catch (error) {
      console.error('Failed to play audio:', error);
    } finally {
      setIsLoadingAudio(false);
    }
  };

  const handleVoiceSelect = (voice: Voice) => {
    onSelect({
      ...selectedVoiceSettings,
      voice_id: voice.voice_id,
    });
  };

  const handleSettingChange = (key: keyof VoiceSettings, value: number | string) => {
    onSelect({
      ...selectedVoiceSettings,
      [key]: value,
    });
  };

  const getPlatformIcon = () => {
    switch (platform) {
      case 'elevenlabs': return <Zap className="h-4 w-4" />;
      case 'vapi': return <Phone className="h-4 w-4" />;
      case 'retell': return <Bot className="h-4 w-4" />;
    }
  };

  const getPlatformName = () => {
    switch (platform) {
      case 'elevenlabs': return 'ElevenLabs';
      case 'vapi': return 'Vapi';
      case 'retell': return 'Retell AI';
    }
  };

  // Get unique genders from voices
  const availableGenders = useMemo(() => {
    if (!voices) return [];
    const genders = new Set(voices.map(v => v.gender?.toLowerCase()).filter(Boolean));
    return Array.from(genders);
  }, [voices]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Loading voices from {getPlatformName()}...</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Platform indicator */}
      <div className="flex items-center gap-2 text-sm">
        {getPlatformIcon()}
        <span className="text-muted-foreground">
          Voices from <span className="font-medium text-foreground">{getPlatformName()}</span>
        </span>
        <Badge variant="secondary" className="ml-auto">
          {voices?.length || 0} voices
        </Badge>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search voices..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            {VOICE_CATEGORIES.map((cat) => (
              <SelectItem key={cat.value} value={cat.value}>
                {cat.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {availableGenders.length > 0 && (
          <Select value={genderFilter} onValueChange={setGenderFilter}>
            <SelectTrigger className="w-[120px]">
              <SelectValue placeholder="Gender" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {availableGenders.map((gender) => (
                <SelectItem key={gender} value={gender!}>
                  {gender!.charAt(0).toUpperCase() + gender!.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Voices Grid */}
      <ScrollArea className="h-[280px] pr-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filteredVoices?.map((voice) => (
            <Card
              key={voice.voice_id}
              className={cn(
                'cursor-pointer transition-all hover:border-primary/50 hover:shadow-md',
                selectedVoiceSettings.voice_id === voice.voice_id &&
                  'border-primary bg-primary/5 ring-1 ring-primary/20'
              )}
              onClick={() => handleVoiceSelect(voice)}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">{voice.name}</span>
                      {selectedVoiceSettings.voice_id === voice.voice_id && (
                        <Check className="h-4 w-4 text-primary flex-shrink-0" />
                      )}
                    </div>
                    {voice.description && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        {voice.description}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-1 mt-2">
                      {voice.gender && (
                        <Badge variant="outline" className="text-xs">
                          {voice.gender}
                        </Badge>
                      )}
                      {voice.accent && (
                        <Badge variant="outline" className="text-xs">
                          {voice.accent}
                        </Badge>
                      )}
                      {voice.language && (
                        <Badge variant="secondary" className="text-xs">
                          {voice.language}
                        </Badge>
                      )}
                      {Object.entries(voice.labels || {})
                        .filter(([key]) => !['gender', 'accent', 'language'].includes(key))
                        .slice(0, 2)
                        .map(([key, value]) => (
                          <Badge key={key} variant="secondary" className="text-xs">
                            {value}
                          </Badge>
                        ))}
                    </div>
                  </div>
                  {voice.preview_url && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className={cn(
                        "h-10 w-10 flex-shrink-0 rounded-full",
                        playingId === voice.voice_id && "bg-primary text-primary-foreground"
                      )}
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePlayPreview(voice);
                      }}
                      disabled={isLoadingAudio && playingId !== voice.voice_id}
                    >
                      {isLoadingAudio && playingId === null ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : playingId === voice.voice_id ? (
                        <Pause className="h-4 w-4" />
                      ) : (
                        <Play className="h-4 w-4" />
                      )}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        {filteredVoices?.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <Volume2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No voices found matching your criteria</p>
          </div>
        )}
      </ScrollArea>

      {/* Voice Settings - Only show when a voice is selected */}
      {selectedVoiceSettings.voice_id && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Volume2 className="h-4 w-4 text-primary" />
              Voice Configuration
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <Tabs defaultValue="basic" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="basic">Basic Settings</TabsTrigger>
                <TabsTrigger value="advanced">Advanced</TabsTrigger>
              </TabsList>
              
              <TabsContent value="basic" className="space-y-4 pt-4">
                {/* TTS Model */}
                {platform === 'elevenlabs' && (
                  <div className="space-y-2">
                    <Label>TTS Model</Label>
                    <Select
                      value={selectedVoiceSettings.model_id || 'eleven_turbo_v2_5'}
                      onValueChange={(v) => handleSettingChange('model_id', v)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TTS_MODELS.map((model) => (
                          <SelectItem key={model.id} value={model.id}>
                            <div className="flex flex-col">
                              <span>{model.name}</span>
                              <span className="text-xs text-muted-foreground">{model.description}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Stability */}
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <Label className="text-sm">Stability</Label>
                    <span className="text-sm font-mono text-muted-foreground">
                      {Math.round((selectedVoiceSettings.stability ?? 0.5) * 100)}%
                    </span>
                  </div>
                  <Slider
                    value={[(selectedVoiceSettings.stability ?? 0.5) * 100]}
                    onValueChange={([v]) => handleSettingChange('stability', v / 100)}
                    max={100}
                    step={1}
                    className="w-full"
                  />
                  <p className="text-xs text-muted-foreground">
                    Higher = more consistent tone. Lower = more expressive and variable.
                  </p>
                </div>

                {/* Similarity */}
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <Label className="text-sm">Similarity Boost</Label>
                    <span className="text-sm font-mono text-muted-foreground">
                      {Math.round((selectedVoiceSettings.similarity_boost ?? 0.75) * 100)}%
                    </span>
                  </div>
                  <Slider
                    value={[(selectedVoiceSettings.similarity_boost ?? 0.75) * 100]}
                    onValueChange={([v]) => handleSettingChange('similarity_boost', v / 100)}
                    max={100}
                    step={1}
                  />
                  <p className="text-xs text-muted-foreground">
                    How closely to match the original voice characteristics.
                  </p>
                </div>
              </TabsContent>

              <TabsContent value="advanced" className="space-y-4 pt-4">
                {/* Style */}
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <Label className="text-sm">Style Exaggeration</Label>
                    <span className="text-sm font-mono text-muted-foreground">
                      {Math.round((selectedVoiceSettings.style ?? 0) * 100)}%
                    </span>
                  </div>
                  <Slider
                    value={[(selectedVoiceSettings.style ?? 0) * 100]}
                    onValueChange={([v]) => handleSettingChange('style', v / 100)}
                    max={100}
                    step={1}
                  />
                  <p className="text-xs text-muted-foreground">
                    Amount of speaking style to apply. Higher values may reduce stability.
                  </p>
                </div>

                {/* Speed */}
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <Label className="text-sm">Speaking Speed</Label>
                    <span className="text-sm font-mono text-muted-foreground">
                      {(selectedVoiceSettings.speed ?? 1).toFixed(2)}x
                    </span>
                  </div>
                  <Slider
                    value={[(selectedVoiceSettings.speed ?? 1) * 50]}
                    onValueChange={([v]) => handleSettingChange('speed', v / 50)}
                    min={25}
                    max={100}
                    step={2.5}
                  />
                  <p className="text-xs text-muted-foreground">
                    Speed multiplier: 0.5x to 2x. 1x is normal speed.
                  </p>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
