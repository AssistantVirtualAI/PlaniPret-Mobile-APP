import { useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Voicemail, Mail, Play, Pause, Upload, Sparkles, RefreshCw,
  Trash2, Settings, Copy, Download, Phone, Archive,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { useVoicemail, type Voicemail as VM } from '@/hooks/useVoicemail';
import { useVoicemailSettings } from '@/hooks/useVoicemailSettings';
import { formatDistanceToNow } from 'date-fns';

const SPEEDS = [1, 1.5, 2] as const;

function fmtDur(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

export default function TelephonyVoicemail() {
  const { items, loading, sync, markRead, remove, getSignedUrl } = useVoicemail();
  const { data: settings, save: saveSettings } = useVoicemailSettings();
  const [sel, setSel] = useState<VM | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState(0);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [syncing, setSyncing] = useState(false);

  // Settings + Greeting dialogs
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [greetingOpen, setGreetingOpen] = useState(false);
  const [greetingText, setGreetingText] = useState('');
  const [voiceId, setVoiceId] = useState('JBFqnCBsd6RMkjVDRZzb');
  const [greetingPreview, setGreetingPreview] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const unread = useMemo(() => items.filter((v) => !v.read_at).length, [items]);

  // Load signed URL when selection changes; mark read
  useEffect(() => {
    setAudioUrl(null); setPos(0); setPlaying(false); setDur(0);
    if (!sel?.audio_storage_path) return;
    getSignedUrl(sel.audio_storage_path).then(setAudioUrl);
    if (!sel.read_at) markRead(sel.id).catch(() => {});
  }, [sel?.id]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = speed;
  }, [speed, audioUrl]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      await sync();
      toast.success('Voicemail synced');
    } catch (e: any) {
      toast.error(e?.message || 'Sync failed');
    } finally { setSyncing(false); }
  };

  const handleDelete = async (id: string) => {
    await remove(id);
    if (sel?.id === id) setSel(null);
    toast.success('Voicemail moved to trash');
  };

  const togglePlay = () => {
    const el = audioRef.current; if (!el) return;
    if (playing) { el.pause(); setPlaying(false); }
    else { el.play(); setPlaying(true); }
  };

  const copyTranscript = () => {
    if (!sel?.transcript) return;
    navigator.clipboard.writeText(sel.transcript);
    toast.success('Transcript copied');
  };

  const generateGreeting = async () => {
    if (!greetingText.trim()) return;
    setGenerating(true); setGreetingPreview(null);
    try {
      const { data, error } = await supabase.functions.invoke('elevenlabs-generate-greeting', {
        body: { script_text: greetingText, voice_id: voiceId, language: 'en' },
      });
      if (error) throw error;
      if (data?.audio_url) setGreetingPreview(data.audio_url);
      else if (data?.audio_base64) setGreetingPreview(`data:audio/mpeg;base64,${data.audio_base64}`);
      toast.success('Greeting generated');
    } catch (e: any) {
      toast.error(e?.message || 'Generation failed');
    } finally { setGenerating(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Voicemail className="w-7 h-7" /> Voicemail
            {unread > 0 && <Badge variant="default" className="ml-2">{unread} new</Badge>}
          </h1>
          <p className="text-muted-foreground text-sm">Visual voicemail with transcription & AI summaries</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing}>
            <RefreshCw className={`w-4 h-4 mr-1.5 ${syncing ? 'animate-spin' : ''}`} /> Sync
          </Button>
          <Button variant="outline" size="sm" onClick={() => setGreetingOpen(true)}>
            <Sparkles className="w-4 h-4 mr-1.5" /> Greeting
          </Button>
          <Button variant="outline" size="sm" onClick={() => setSettingsOpen(true)}>
            <Settings className="w-4 h-4 mr-1.5" /> Settings
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.5fr] gap-4">
        {/* List */}
        <Card className="overflow-hidden">
          <CardContent className="p-0 max-h-[70vh] overflow-y-auto">
            {loading ? (
              <div className="p-6 text-sm text-muted-foreground">Loading…</div>
            ) : items.length === 0 ? (
              <div className="p-10 text-center text-sm text-muted-foreground">
                <Voicemail className="w-10 h-10 mx-auto mb-2 opacity-30" />
                No voicemails yet
              </div>
            ) : (
              <ul className="divide-y">
                {items.map((v) => (
                  <li
                    key={v.id}
                    onClick={() => setSel(v)}
                    className={`p-3 cursor-pointer hover:bg-muted/50 transition ${
                      sel?.id === v.id ? 'bg-muted' : ''
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      {!v.read_at && <div className="w-2 h-2 rounded-full bg-primary mt-2" />}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className={`truncate ${!v.read_at ? 'font-semibold' : ''}`}>
                            {v.caller_name || v.caller_number || 'Unknown'}
                          </span>
                          <span className="text-xs text-muted-foreground whitespace-nowrap">
                            {formatDistanceToNow(new Date(v.received_at), { addSuffix: true })}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                          <Phone className="w-3 h-3" /> Ext {v.extension} · {fmtDur(v.duration_seconds)}
                        </div>
                        {v.ai_summary && (
                          <Badge variant="secondary" className="mt-1 text-[10px] font-normal">
                            ✨ {v.ai_summary.slice(0, 60)}{v.ai_summary.length > 60 ? '…' : ''}
                          </Badge>
                        )}
                        {!v.ai_summary && v.transcript && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{v.transcript}</p>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Player + transcript */}
        <Card>
          <CardContent className="p-4 space-y-4">
            {!sel ? (
              <div className="py-20 text-center text-sm text-muted-foreground">
                Select a voicemail to listen and view transcript
              </div>
            ) : (
              <>
                <div>
                  <div className="text-xl font-semibold">{sel.caller_name || sel.caller_number || 'Unknown'}</div>
                  <div className="text-sm text-muted-foreground">
                    {sel.caller_number || '—'} · Ext {sel.extension} · {new Date(sel.received_at).toLocaleString()}
                  </div>
                </div>

                {audioUrl ? (
                  <div className="space-y-2 bg-muted/40 rounded-lg p-3">
                    <audio
                      ref={audioRef}
                      src={audioUrl}
                      onLoadedMetadata={(e) => setDur(e.currentTarget.duration)}
                      onTimeUpdate={(e) => setPos(e.currentTarget.currentTime)}
                      onEnded={() => setPlaying(false)}
                      className="hidden"
                    />
                    <div className="flex items-center gap-3">
                      <Button size="icon" onClick={togglePlay}>
                        {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                      </Button>
                      <div className="flex-1">
                        <input
                          type="range" min={0} max={dur || 0} value={pos} step={0.1}
                          onChange={(e) => {
                            const v = Number(e.target.value);
                            setPos(v); if (audioRef.current) audioRef.current.currentTime = v;
                          }}
                          className="w-full accent-primary"
                        />
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>{fmtDur(pos)}</span><span>{fmtDur(dur)}</span>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        {SPEEDS.map((s) => (
                          <Button key={s} variant={speed === s ? 'default' : 'outline'} size="sm"
                            className="h-7 px-2 text-xs" onClick={() => setSpeed(s)}>
                            {s}×
                          </Button>
                        ))}
                      </div>
                      <a href={audioUrl} download className="inline-flex">
                        <Button variant="outline" size="icon"><Download className="w-4 h-4" /></Button>
                      </a>
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground italic">Audio not available</div>
                )}

                {sel.ai_summary && (
                  <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
                    <div className="text-xs font-semibold text-primary mb-1 flex items-center gap-1">
                      <Sparkles className="w-3 h-3" /> AI Summary
                    </div>
                    <p className="text-sm">{sel.ai_summary}</p>
                  </div>
                )}

                {sel.transcript ? (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <Label className="text-xs">Transcript</Label>
                      <Button variant="ghost" size="sm" onClick={copyTranscript}>
                        <Copy className="w-3 h-3 mr-1" /> Copy
                      </Button>
                    </div>
                    <div className="text-sm whitespace-pre-wrap bg-muted/30 rounded p-3 max-h-64 overflow-y-auto">
                      {sel.transcript}
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground italic">
                    Transcript pending… (enabled in Settings)
                  </div>
                )}

                <div className="flex gap-2 pt-2 border-t">
                  {sel.caller_number && (
                    <Button variant="outline" size="sm" asChild>
                      <a href={`tel:${sel.caller_number}`}><Phone className="w-3 h-3 mr-1.5" /> Call back</a>
                    </Button>
                  )}
                  <Button variant="outline" size="sm" onClick={() =>
                    supabase.from('pbx_voicemails').update({ folder: 'archived' }).eq('id', sel.id)
                  }>
                    <Archive className="w-3 h-3 mr-1.5" /> Archive
                  </Button>
                  <Button variant="destructive" size="sm" onClick={() => handleDelete(sel.id)}>
                    <Trash2 className="w-3 h-3 mr-1.5" /> Delete
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Settings dialog */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Voicemail Settings</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {[
              { k: 'transcription_enabled', label: 'Auto-transcribe new voicemails' },
              { k: 'notify_email', label: 'Email notifications' },
              { k: 'attach_audio_email', label: 'Attach audio to email' },
              { k: 'notify_sms', label: 'SMS notifications' },
              { k: 'notify_push', label: 'Push notifications' },
            ].map((row) => (
              <div key={row.k} className="flex items-center justify-between">
                <Label htmlFor={row.k} className="text-sm">{row.label}</Label>
                <Switch id={row.k} checked={settings?.[row.k] ?? true}
                  onCheckedChange={(v) => saveSettings({ [row.k]: v })} />
              </div>
            ))}
            <div>
              <Label className="text-xs">Notification email</Label>
              <Input defaultValue={settings?.notify_email_address || ''}
                onBlur={(e) => saveSettings({ notify_email_address: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">Notification SMS number</Label>
              <Input defaultValue={settings?.notify_sms_number || ''}
                onBlur={(e) => saveSettings({ notify_sms_number: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setSettingsOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Greeting dialog */}
      <Dialog open={greetingOpen} onOpenChange={setGreetingOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Voicemail Greeting</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Upload audio (mp3/wav)</Label>
              <Input type="file" accept="audio/*" className="mt-1" />
            </div>
            <div className="border-t pt-3 space-y-2">
              <Label className="text-xs">Or generate with AI (ElevenLabs)</Label>
              <Textarea value={greetingText} onChange={(e) => setGreetingText(e.target.value)}
                placeholder="Hi, you've reached… please leave a message after the tone." rows={4} />
              <Input value={voiceId} onChange={(e) => setVoiceId(e.target.value)} placeholder="ElevenLabs voice ID" />
              <Button onClick={generateGreeting} disabled={generating || !greetingText} size="sm" className="w-full">
                <Sparkles className="w-3 h-3 mr-1.5" /> {generating ? 'Generating…' : 'Generate'}
              </Button>
              {greetingPreview && <audio controls src={greetingPreview} className="w-full mt-2" />}
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setGreetingOpen(false)}>Cancel</Button>
            <Button disabled={!greetingPreview}>
              <Upload className="w-3 h-3 mr-1.5" /> Publish to FusionPBX
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
