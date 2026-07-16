import { useTranslation } from '@/hooks/useTranslation';
import { useState } from 'react';
import {
  User, BarChart3, BookOpen, History, Volume2, Music, Mic,
  Globe, Webhook, Save, Loader2, Trash2, Plus, Play, RefreshCw,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useElevenLabsUserInfo,
  useElevenLabsUsageStats,
  useElevenLabsPronunciationDicts,
  useDeletePronunciationDict,
  useElevenLabsHistory,
  useDeleteHistoryItem,
  useGenerateTTS,
  useGenerateSoundEffect,
  useGenerateMusic,
  useElevenLabsAllModels,
} from '@/hooks/useElevenLabsAPI';
import { OUTPUT_FORMATS, TTS_MODELS } from '@/types/elevenlabs-full';
import { toast } from 'sonner';

interface ElevenLabsAPISectionsProps {
  apiKey?: string | null;
  organizationId?: string | null;
  canEdit?: boolean;
  voiceId?: string;
}

export function ElevenLabsAPISections({ apiKey, organizationId, canEdit = true, voiceId }: ElevenLabsAPISectionsProps) {
  const { t } = useTranslation();
  const proxyParams = { apiKey, organizationId };
  const isEnabled = !!(apiKey || organizationId);

  // ─── Fetch data ───
  const { data: userInfo, isLoading: userLoading } = useElevenLabsUserInfo({ ...proxyParams, enabled: isEnabled });
  const { data: usageStats } = useElevenLabsUsageStats({ ...proxyParams, enabled: isEnabled });
  const { data: pronunciationDicts, refetch: refetchDicts } = useElevenLabsPronunciationDicts({ ...proxyParams, enabled: isEnabled });
  const { data: historyItems, refetch: refetchHistory } = useElevenLabsHistory({ ...proxyParams, enabled: isEnabled });
  const { data: allModels } = useElevenLabsAllModels({ ...proxyParams, enabled: isEnabled });

  // ─── Mutations ───
  const deletePronunciation = useDeletePronunciationDict();
  const deleteHistory = useDeleteHistoryItem();
  const generateTTS = useGenerateTTS();
  const generateSFX = useGenerateSoundEffect();
  const generateMusic = useGenerateMusic();

  // ─── Local state ───
  const [ttsText, setTtsText] = useState('');
  const [ttsModel, setTtsModel] = useState('eleven_multilingual_v2');
  const [ttsFormat, setTtsFormat] = useState('mp3_44100_128');
  const [sfxText, setSfxText] = useState('');
  const [sfxDuration, setSfxDuration] = useState(5);
  const [musicPrompt, setMusicPrompt] = useState('');
  const [musicDuration, setMusicDuration] = useState(30);

  const playBase64Audio = (base64: string) => {
    const audioUrl = `data:audio/mpeg;base64,${base64}`;
    const audio = new Audio(audioUrl);
    audio.play().catch(() => toast.error(t('componentUi.elevenLabsApi.audioError')));
  };

  const sub = userInfo?.subscription;
  const charUsed = sub?.character_count || 0;
  const charLimit = sub?.character_limit || 1;
  const charPercent = Math.min((charUsed / charLimit) * 100, 100);

  return (
    <Accordion type="multiple" className="space-y-4">
      {/* ═══ ACCOUNT & USAGE ═══ */}
      <AccordionItem value="account" className="border rounded-lg bg-card">
        <AccordionTrigger className="px-6 hover:no-underline">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-500/10">
              <User className="h-5 w-5 text-emerald-500" />
            </div>
            <div className="text-left">
              <h3 className="font-semibold">{t('componentUi.elevenLabsApi.accountUsage')}</h3>
              <p className="text-sm text-muted-foreground">{t('componentUi.elevenLabsApi.accountUsageDesc')}</p>
            </div>
          </div>
        </AccordionTrigger>
        <AccordionContent className="px-6 pb-6">
          {userLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-full" />
            </div>
          ) : sub ? (
            <div className="space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-4 rounded-lg bg-muted/50">
                  <p className="text-xs text-muted-foreground">{t('componentUi.elevenLabsApi.plan')}</p>
                  <p className="font-semibold capitalize">{sub.tier || 'Free'}</p>
                </div>
                <div className="p-4 rounded-lg bg-muted/50">
                  <p className="text-xs text-muted-foreground">{t('componentUi.elevenLabsApi.status')}</p>
                  <Badge variant={sub.status === 'active' ? 'default' : 'secondary'}>{sub.status || 'N/A'}</Badge>
                </div>
                <div className="p-4 rounded-lg bg-muted/50">
                  <p className="text-xs text-muted-foreground">{t('componentUi.elevenLabsApi.voices')}</p>
                  <p className="font-semibold">{sub.voice_add_edit_counter || 0}/{sub.voice_limit || 0}</p>
                </div>
                <div className="p-4 rounded-lg bg-muted/50">
                  <p className="text-xs text-muted-foreground">{t('componentUi.elevenLabsApi.cloning')}</p>
                  <Badge variant={sub.can_use_instant_voice_cloning ? 'default' : 'secondary'}>
                    {sub.can_use_instant_voice_cloning ? t('componentUi.elevenLabsApi.enabled') : t('componentUi.elevenLabsApi.no')}
                  </Badge>
                </div>
              </div>
              <div>
                <div className="flex justify-between mb-2">
                  <Label>{t('componentUi.elevenLabsApi.charsUsed')}</Label>
                  <span className="text-sm text-muted-foreground">
                    {charUsed.toLocaleString()} / {charLimit.toLocaleString()}
                  </span>
                </div>
                <Progress value={charPercent} className="h-3" />
                <p className="text-xs text-muted-foreground mt-2">
                  {sub.next_character_count_reset_unix
                    ? `${t('componentUi.elevenLabsApi.resetDate')} ${new Date(sub.next_character_count_reset_unix * 1000).toLocaleDateString()}`
                    : ''}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">{t('componentUi.elevenLabsApi.cannotLoadAccount')}</p>
          )}
        </AccordionContent>
      </AccordionItem>

      {/* ═══ TTS TEST ═══ */}
      <AccordionItem value="tts-test" className="border rounded-lg bg-card">
        <AccordionTrigger className="px-6 hover:no-underline">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/10">
              <Volume2 className="h-5 w-5 text-blue-500" />
            </div>
            <div className="text-left">
              <h3 className="font-semibold">{t('componentUi.elevenLabsApi.tts')}</h3>
              <p className="text-sm text-muted-foreground">{t('componentUi.elevenLabsApi.ttsDesc')}</p>
            </div>
          </div>
        </AccordionTrigger>
        <AccordionContent className="px-6 pb-6">
          <div className="space-y-4">
            <div>
              <Label>{t('componentUi.elevenLabsApi.textToConvert')}</Label>
              <Textarea
                value={ttsText}
                onChange={(e) => setTtsText(e.target.value)}
                {...{placeholder: t('componentUi.elevenLabsApi.textPlaceholder')}}
                rows={3}
                className="mt-2"
                disabled={!canEdit}
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>{t('componentUi.elevenLabsApi.model')}</Label>
                <Select value={ttsModel} onValueChange={setTtsModel} disabled={!canEdit}>
                  <SelectTrigger className="mt-2"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TTS_MODELS.map(m => (
                      <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t('componentUi.elevenLabsApi.outputFormat')}</Label>
                <Select value={ttsFormat} onValueChange={setTtsFormat} disabled={!canEdit}>
                  <SelectTrigger className="mt-2"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {OUTPUT_FORMATS.map(f => (
                      <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {canEdit && (
              <Button
                onClick={async () => {
                  if (!ttsText.trim()) { toast.error(t('componentUi.elevenLabsApi.enterText')); return; }
                  if (!voiceId) { toast.error(t('componentUi.elevenLabsApi.selectVoiceInTts')); return; }
                  const result = await generateTTS.mutateAsync({
                    ...proxyParams,
                    voiceId,
                    text: ttsText,
                    model_id: ttsModel,
                    output_format: ttsFormat,
                  });
                  if (result?.audio) playBase64Audio(result.audio);
                }}
                disabled={generateTTS.isPending}
              >
                {generateTTS.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
                {t('componentUi.elevenLabsApi.generateListen')}
              </Button>
            )}
          </div>
        </AccordionContent>
      </AccordionItem>

      {/* ═══ SOUND EFFECTS ═══ */}
      <AccordionItem value="sfx" className="border rounded-lg bg-card">
        <AccordionTrigger className="px-6 hover:no-underline">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-yellow-500/10">
              <Mic className="h-5 w-5 text-yellow-500" />
            </div>
            <div className="text-left">
              <h3 className="font-semibold">{t('componentUi.elevenLabsApi.sfx')}</h3>
              <p className="text-sm text-muted-foreground">{t('componentUi.elevenLabsApi.sfxDesc')}</p>
            </div>
          </div>
        </AccordionTrigger>
        <AccordionContent className="px-6 pb-6">
          <div className="space-y-4">
            <div>
              <Label>{t('componentUi.elevenLabsApi.effectDesc')}</Label>
              <Input
                value={sfxText}
                onChange={(e) => setSfxText(e.target.value)}
                {...{placeholder: t('componentUi.elevenLabsApi.sfxPlaceholder')}}
                className="mt-2"
                disabled={!canEdit}
              />
            </div>
            <div>
              <Label>{t('componentUi.elevenLabsApi.duration')} ({sfxDuration}s)</Label>
              <Slider
                value={[sfxDuration]}
                onValueChange={([v]) => setSfxDuration(v)}
                min={1}
                max={22}
                step={1}
                className="mt-3"
                disabled={!canEdit}
              />
            </div>
            {canEdit && (
              <Button
                onClick={async () => {
                  if (!sfxText.trim()) { toast.error(t('componentUi.elevenLabsApi.describeSfx')); return; }
                  const result = await generateSFX.mutateAsync({
                    ...proxyParams,
                    text: sfxText,
                    duration_seconds: sfxDuration,
                  });
                  if (result?.audio) playBase64Audio(result.audio);
                }}
                disabled={generateSFX.isPending}
              >
                {generateSFX.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
                {t('componentUi.elevenLabsApi.generateEffect')}
              </Button>
            )}
          </div>
        </AccordionContent>
      </AccordionItem>

      {/* ═══ MUSIC ═══ */}
      <AccordionItem value="music" className="border rounded-lg bg-card">
        <AccordionTrigger className="px-6 hover:no-underline">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-pink-500/10">
              <Music className="h-5 w-5 text-pink-500" />
            </div>
            <div className="text-left">
              <h3 className="font-semibold">{t('componentUi.elevenLabsApi.music')}</h3>
              <p className="text-sm text-muted-foreground">{t('componentUi.elevenLabsApi.musicDesc')}</p>
            </div>
          </div>
        </AccordionTrigger>
        <AccordionContent className="px-6 pb-6">
          <div className="space-y-4">
            <div>
              <Label>{t('componentUi.elevenLabsApi.musicDescLabel')}</Label>
              <Textarea
                value={musicPrompt}
                onChange={(e) => setMusicPrompt(e.target.value)}
                {...{placeholder: t('componentUi.elevenLabsApi.musicPlaceholder')}}
                rows={2}
                className="mt-2"
                disabled={!canEdit}
              />
            </div>
            <div>
              <Label>{t('componentUi.elevenLabsApi.duration')} ({musicDuration}s)</Label>
              <Slider
                value={[musicDuration]}
                onValueChange={([v]) => setMusicDuration(v)}
                min={5}
                max={120}
                step={5}
                className="mt-3"
                disabled={!canEdit}
              />
            </div>
            {canEdit && (
              <Button
                onClick={async () => {
                  if (!musicPrompt.trim()) { toast.error(t('componentUi.elevenLabsApi.describeMusic')); return; }
                  const result = await generateMusic.mutateAsync({
                    ...proxyParams,
                    prompt: musicPrompt,
                    duration_seconds: musicDuration,
                  });
                  if (result?.audio) playBase64Audio(result.audio);
                }}
                disabled={generateMusic.isPending}
              >
                {generateMusic.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
                {t('componentUi.elevenLabsApi.generateMusic')}
              </Button>
            )}
          </div>
        </AccordionContent>
      </AccordionItem>

      {/* ═══ PRONUNCIATION DICTIONARIES ═══ */}
      <AccordionItem value="pronunciation" className="border rounded-lg bg-card">
        <AccordionTrigger className="px-6 hover:no-underline">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-indigo-500/10">
              <BookOpen className="h-5 w-5 text-indigo-500" />
            </div>
            <div className="text-left">
              <h3 className="font-semibold">{t('componentUi.elevenLabsApi.pronunciation')}</h3>
              <p className="text-sm text-muted-foreground">{t('componentUi.elevenLabsApi.pronunciationDesc')}</p>
            </div>
          </div>
        </AccordionTrigger>
        <AccordionContent className="px-6 pb-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {Array.isArray(pronunciationDicts) ? pronunciationDicts.length : 0} {t('componentUi.elevenLabsApi.dictCount')}
              </p>
              <Button variant="outline" size="sm" onClick={() => refetchDicts()}>
                <RefreshCw className="h-3 w-3 mr-1" /> {t('componentUi.elevenLabsApi.refresh')}
              </Button>
            </div>
            {Array.isArray(pronunciationDicts) && pronunciationDicts.length > 0 ? (
              <div className="space-y-2">
                {pronunciationDicts.map((dict: any) => (
                  <div key={dict.id || dict.pronunciation_dictionary_id} className="flex items-center justify-between p-3 rounded-lg border">
                    <div>
                      <p className="font-medium text-sm">{dict.name}</p>
                      {dict.description && <p className="text-xs text-muted-foreground">{dict.description}</p>}
                    </div>
                    {canEdit && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deletePronunciation.mutate({
                          ...proxyParams,
                          dictionaryId: dict.id || dict.pronunciation_dictionary_id,
                        })}
                        disabled={deletePronunciation.isPending}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">{t('componentUi.elevenLabsApi.noDictionaries')}</p>
            )}
          </div>
        </AccordionContent>
      </AccordionItem>

      {/* ═══ HISTORY ═══ */}
      <AccordionItem value="history" className="border rounded-lg bg-card">
        <AccordionTrigger className="px-6 hover:no-underline">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-slate-500/10">
              <History className="h-5 w-5 text-slate-500" />
            </div>
            <div className="text-left">
              <h3 className="font-semibold">{t('componentUi.elevenLabsApi.history')}</h3>
              <p className="text-sm text-muted-foreground">{t('componentUi.elevenLabsApi.historyDesc')}</p>
            </div>
          </div>
        </AccordionTrigger>
        <AccordionContent className="px-6 pb-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {Array.isArray(historyItems) ? historyItems.length : 0} {t('componentUi.elevenLabsApi.itemCount')}
              </p>
              <Button variant="outline" size="sm" onClick={() => refetchHistory()}>
                <RefreshCw className="h-3 w-3 mr-1" /> {t('componentUi.elevenLabsApi.refresh')}
              </Button>
            </div>
            {Array.isArray(historyItems) && historyItems.length > 0 ? (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {historyItems.map((item: any) => (
                  <div key={item.history_item_id} className="flex items-center justify-between p-3 rounded-lg border">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.text?.substring(0, 80) || 'Audio'}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="outline" className="text-xs">{item.voice_name || 'N/A'}</Badge>
                        {item.date_unix && (
                          <span className="text-xs text-muted-foreground">
                            {new Date(item.date_unix * 1000).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                    {canEdit && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteHistory.mutate({
                          ...proxyParams,
                          historyItemId: item.history_item_id,
                        })}
                        disabled={deleteHistory.isPending}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">{t('componentUi.elevenLabsApi.noHistory')}</p>
            )}
          </div>
        </AccordionContent>
      </AccordionItem>

      {/* ═══ MODELS ═══ */}
      <AccordionItem value="models" className="border rounded-lg bg-card">
        <AccordionTrigger className="px-6 hover:no-underline">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-teal-500/10">
              <BarChart3 className="h-5 w-5 text-teal-500" />
            </div>
            <div className="text-left">
              <h3 className="font-semibold">{t('componentUi.elevenLabsApi.models')}</h3>
              <p className="text-sm text-muted-foreground">{t('componentUi.elevenLabsApi.modelsDesc')}</p>
            </div>
          </div>
        </AccordionTrigger>
        <AccordionContent className="px-6 pb-6">
          {Array.isArray(allModels) && allModels.length > 0 ? (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {allModels.map((model: any) => (
                <div key={model.model_id} className="p-3 rounded-lg border">
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-sm">{model.name}</p>
                    <div className="flex gap-1">
                      {model.can_do_text_to_speech && <Badge variant="outline" className="text-xs">TTS</Badge>}
                      {model.can_do_voice_conversion && <Badge variant="outline" className="text-xs">VC</Badge>}
                      {model.can_be_finetuned && <Badge variant="outline" className="text-xs">Finetune</Badge>}
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{model.description}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-xs text-muted-foreground">
                      {t('componentUi.elevenLabsApi.languages')}: {model.languages?.length || 0}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {t('componentUi.elevenLabsApi.cost')}: {model.token_cost_factor}x
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">{t('componentUi.elevenLabsApi.loadingModels')}</p>
          )}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
