import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Upload, Mic } from 'lucide-react';

export default function MyGreetings() {
  const [loading, setLoading] = useState(true);
  const [ext, setExt] = useState<string | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [files, setFiles] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const refresh = async (org: string, extension: string) => {
    const path = `${org}/${extension}`;
    const { data } = await supabase.storage.from('voicemail-greetings').list(path, { limit: 50, sortBy: { column: 'created_at', order: 'desc' } });
    setFiles(data ?? []);
  };

  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) { setLoading(false); return; }
      const { data: spu } = await (supabase as any)
        .from('pbx_softphone_users')
        .select('extension, organization_id')
        .eq('portal_user_id', auth.user.id)
        .maybeSingle();
      if (!spu) { setLoading(false); return; }
      setExt(spu.extension);
      setOrgId(spu.organization_id);
      await refresh(spu.organization_id, spu.extension);
      setLoading(false);
    })();
  }, []);

  const handleUpload = async (file: File) => {
    if (!ext || !orgId) return;
    setUploading(true);
    const path = `${orgId}/${ext}/${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from('voicemail-greetings').upload(path, file, { upsert: false, contentType: file.type });
    setUploading(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Greeting uploaded');
    await refresh(orgId, ext);
  };

  const playUrl = async (name: string) => {
    if (!orgId || !ext) return null;
    const { data } = await supabase.storage.from('voicemail-greetings').createSignedUrl(`${orgId}/${ext}/${name}`, 3600);
    return data?.signedUrl ?? null;
  };

  if (loading) return <div className="p-6 text-muted-foreground">Loading…</div>;
  if (!ext) return <div className="p-6 text-muted-foreground">No extension assigned.</div>;

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <Mic className="h-6 w-6 text-cockpit-cyan" />
        <h1 className="page-title text-2xl font-semibold">Voicemail Greetings · Ext {ext}</h1>
      </div>

      <Card>
        <CardHeader><CardTitle>Upload a new greeting</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <input
            ref={inputRef}
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); }}
          />
          <Button onClick={() => inputRef.current?.click()} disabled={uploading}>
            <Upload className="h-4 w-4 mr-2" />
            {uploading ? 'Uploading…' : 'Choose audio file'}
          </Button>
          <p className="text-xs text-muted-foreground">MP3 or WAV. The most recent file becomes your active greeting.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Your greetings ({files.length})</CardTitle></CardHeader>
        <CardContent>
          {files.length === 0 ? (
            <div className="text-muted-foreground text-sm">No greetings yet.</div>
          ) : (
            <div className="space-y-2">
              {files.map((f) => (
                <GreetingRow key={f.name} name={f.name} createdAt={f.created_at} playUrl={playUrl} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function GreetingRow({ name, createdAt, playUrl }: { name: string; createdAt?: string; playUrl: (n: string) => Promise<string | null> }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => { playUrl(name).then(setUrl); }, [name, playUrl]);
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-cockpit-border/40 p-3">
      <div className="min-w-0">
        <div className="font-medium truncate">{name}</div>
        {createdAt && <div className="text-xs text-muted-foreground">{new Date(createdAt).toLocaleString()}</div>}
      </div>
      {url ? <audio controls src={url} className="h-8" /> : <span className="text-xs text-muted-foreground">loading…</span>}
    </div>
  );
}
