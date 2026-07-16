import { useState, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Link, Copy, ExternalLink, QrCode, Check, Download, Globe, Bot } from 'lucide-react';
import { toast } from 'sonner';
import { ClientDetail } from '@/hooks/useClientDetail';
import { QRCodeSVG } from 'qrcode.react';
import { supabase } from '@/integrations/supabase/client';

interface ClientUrlTabProps {
  client: ClientDetail;
}

export const ClientUrlTab = ({ client }: ClientUrlTabProps) => {
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const qrRef = useRef<HTMLDivElement>(null);
  
  const baseUrl = window.location.origin;
  const universalLoginUrl = `${baseUrl}/login`;

  // Fetch assigned agents with their slugs
  const { data: assignedAgents } = useQuery({
    queryKey: ['client-agent-slugs', client.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_agent_assignments')
        .select(`
          id,
          role,
          agent:agents(id, name, slug, avatar_url)
        `)
        .eq('client_id', client.id);

      if (error) throw error;
      return data?.filter(a => a.agent) || [];
    },
  });

  const agentPortalUrls = assignedAgents?.map(a => ({
    name: (a.agent as any)?.name,
    slug: (a.agent as any)?.slug,
    url: (a.agent as any)?.slug ? `${baseUrl}/portal/${(a.agent as any).slug}` : null,
  })).filter(a => a.url) || [];

  // Primary URL for QR code: first agent portal URL or universal login
  const primaryPortalUrl = agentPortalUrls[0]?.url || universalLoginUrl;

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedUrl(text);
    toast.success('Link copied!');
    setTimeout(() => setCopiedUrl(null), 2000);
  };

  const downloadQRCode = () => {
    const svg = qrRef.current?.querySelector('svg');
    if (!svg) return;

    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();

    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx?.drawImage(img, 0, 0);
      const pngUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.href = pngUrl;
      link.download = `qrcode-client-${client.login_id || client.id}.png`;
      link.click();
      toast.success('QR Code downloaded!');
    };

    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
  };

  return (
    <div className="space-y-6">
      {/* Agent Portal Links */}
      {agentPortalUrls.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5" />
              Agent Portal Links
            </CardTitle>
            <CardDescription>
              Direct links for the client to access each assigned agent's portal
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {agentPortalUrls.map((agent) => (
              <div key={agent.slug} className="space-y-2">
                <div className="flex items-center gap-2">
                  <Label>{agent.name}</Label>
                  <Badge variant="secondary" className="text-xs font-mono">
                    /{agent.slug}
                  </Badge>
                </div>
                <div className="flex gap-2">
                  <Input value={agent.url!} readOnly className="font-mono text-sm" />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => copyToClipboard(agent.url!)}
                  >
                    {copiedUrl === agent.url ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => window.open(agent.url!, '_blank')}
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Universal Login */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            Universal Login
          </CardTitle>
          <CardDescription>
            The client can also sign in from the main site using their credentials
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Login URL</Label>
            <div className="flex gap-2">
              <Input value={universalLoginUrl} readOnly className="font-mono text-sm" />
              <Button
                variant="outline"
                size="icon"
                onClick={() => copyToClipboard(universalLoginUrl)}
              >
                {copiedUrl === universalLoginUrl ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => window.open(universalLoginUrl, '_blank')}
              >
                <ExternalLink className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Login ID</Label>
            <div className="flex gap-2">
              <Input value={client.login_id || 'Not set'} readOnly className="font-mono" />
              {client.login_id && (
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => copyToClipboard(client.login_id!)}
                >
                  {copiedUrl === client.login_id ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* QR Code */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <QrCode className="h-5 w-5" />
            QR Code
          </CardTitle>
          <CardDescription>
            Scan this code to access the client portal
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center gap-4">
            <div 
              ref={qrRef}
              className="w-48 h-48 bg-white rounded-lg flex items-center justify-center p-4"
            >
              <QRCodeSVG 
                value={primaryPortalUrl}
                size={160}
                level="H"
                includeMargin={true}
              />
            </div>
            <p className="text-xs text-muted-foreground text-center max-w-xs">
              Points to: {primaryPortalUrl}
            </p>
            <Button variant="outline" onClick={downloadQRCode}>
              <Download className="h-4 w-4 mr-2" />
              Download QR Code
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Connection Instructions */}
      <Card>
        <CardHeader>
          <CardTitle>Connection Instructions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 text-sm">
            <p className="flex items-start gap-2">
              <span className="font-bold text-primary">1.</span>
              Share {agentPortalUrls.length > 0 ? 'the agent portal link' : 'the login link'} above with your client
            </p>
            <p className="flex items-start gap-2">
              <span className="font-bold text-primary">2.</span>
              The client uses their login ID: <code className="bg-muted px-2 py-0.5 rounded">{client.login_id || 'not set'}</code>
            </p>
            <p className="flex items-start gap-2">
              <span className="font-bold text-primary">3.</span>
              The client can also sign in from the main site at <code className="bg-muted px-2 py-0.5 rounded">/login</code>
            </p>
            <p className="flex items-start gap-2">
              <span className="font-bold text-primary">4.</span>
              The client accesses their personalized dashboard
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
