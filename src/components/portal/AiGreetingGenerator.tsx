import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { Sparkles, Play } from 'lucide-react';
import { toast } from 'sonner';

const VOICES = [
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah' },
  { id: 'JBFqnCBsd6RMkjVDRZzb', name: 'George' },
  { id: 'cgSgspJ2msm6clMCkdW9', name: 'Jessica' },
  { id: 'TX3LPaxmHKxFdv7VOQHJ', name: 'Liam' },
  { id: 'pFZP5JQG7iQjIQuC4Bku', name: 'Lily' },
];

export function AiGreetingGenerator({ defaultText = '', onSave }: {
  defaultText?: string; onSave?: (audioBase64: string) => void;
}) {
  const [text, setText] = useState(defaultText);
  const [voice, setVoice] = useState(VOICES[0].id);
  const [lang, setLang] = useState<'en' | 'fr'>('en');
  const [busy, setBusy] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioB64, setAudioB64] = useState<string | null>(null);

  const generate = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('voicemail-greeting-tts', {
        body: { text, voiceId: voice, language: lang },
      });
      if (error) throw error;
      setAudioB64(data.audioContent);
      setAudioUrl(`data:audio/mpeg;base64,${data.audioContent}`);
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to generate greeting');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><Sparkles className="h-4 w-4" /> AI Greeting Generator</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <Textarea rows={4} value={text} onChange={e => setText(e.target.value)}
          placeholder="Thank you for calling Lemtel. We're unavailable — please leave a message." />
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Voice</Label>
            <Select value={voice} onValueChange={setVoice}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{VOICES.map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Language</Label>
            <Select value={lang} onValueChange={(v: 'en' | 'fr') => setLang(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="en">English</SelectItem><SelectItem value="fr">Français</SelectItem></SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button onClick={generate} disabled={busy}><Sparkles className="h-4 w-4 mr-1" />{busy ? 'Generating…' : 'Generate'}</Button>
          {audioUrl && <audio controls src={audioUrl} className="h-10" />}
          {audioUrl && onSave && audioB64 && (
            <Button variant="outline" onClick={() => onSave(audioB64)}><Play className="h-4 w-4 mr-1" />Save as greeting</Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
