import { useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ExternalLink, QrCode, Copy, Check, Smartphone, Monitor, Download } from 'lucide-react';
import { toast } from 'sonner';
import { AgentSettings } from '@/hooks/useAgentSettings';
import { QRCodeSVG } from 'qrcode.react';

interface AgentPrototypeTabProps {
  agent: AgentSettings;
}

export const AgentPrototypeTab = ({ agent }: AgentPrototypeTabProps) => {
  const [copied, setCopied] = useState(false);
  const qrRef = useRef<HTMLDivElement>(null);
  
  const baseUrl = window.location.origin;
  const prototypeUrl = `${baseUrl}/prototype/${agent.id}`;
  
  // Platform-specific prototype URLs
  const platformUrls: Record<string, string> = {
    elevenlabs: `https://elevenlabs.io/app/conversational-ai/agents/${agent.platform_agent_id}`,
    vapi: `https://dashboard.vapi.ai/assistants/${agent.platform_agent_id}`,
    retell: `https://app.retellai.com/agents/${agent.platform_agent_id}`,
  };
  
  const externalUrl = platformUrls[agent.platform.toLowerCase()] || null;

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success('Lien copié !');
    setTimeout(() => setCopied(false), 2000);
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
      link.download = `qrcode-agent-${agent.id}.png`;
      link.click();
      toast.success('QR Code téléchargé !');
    };

    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Monitor className="h-5 w-5" />
            Lien de test
          </CardTitle>
          <CardDescription>
            Testez votre agent en conditions réelles
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>URL du prototype</Label>
            <div className="flex gap-2">
              <Input value={prototypeUrl} readOnly className="font-mono text-sm" />
              <Button
                variant="outline"
                onClick={() => copyToClipboard(prototypeUrl)}
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          <div className="flex gap-2">
            <Button onClick={() => window.open(prototypeUrl, '_blank')}>
              <ExternalLink className="h-4 w-4 mr-2" />
              Ouvrir le prototype
            </Button>
            {externalUrl && agent.platform_agent_id && (
              <Button variant="outline" onClick={() => window.open(externalUrl, '_blank')}>
                <ExternalLink className="h-4 w-4 mr-2" />
                Voir sur {agent.platform}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Smartphone className="h-5 w-5" />
            Test mobile
          </CardTitle>
          <CardDescription>
            Scannez le QR Code pour tester sur mobile
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center gap-4">
            <div 
              ref={qrRef}
              className="w-48 h-48 bg-white rounded-lg flex items-center justify-center p-4"
            >
              <QRCodeSVG 
                value={prototypeUrl}
                size={160}
                level="H"
                includeMargin={true}
              />
            </div>
            <Button variant="outline" onClick={downloadQRCode}>
              <Download className="h-4 w-4 mr-2" />
              Télécharger le QR Code
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Informations de test</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between py-2 border-b">
              <span className="text-muted-foreground">Plateforme</span>
              <span className="font-medium">{agent.platform}</span>
            </div>
            <div className="flex justify-between py-2 border-b">
              <span className="text-muted-foreground">Agent ID</span>
              <code className="bg-muted px-2 py-0.5 rounded text-xs">
                {agent.platform_agent_id || 'Non configuré'}
              </code>
            </div>
            <div className="flex justify-between py-2 border-b">
              <span className="text-muted-foreground">Layout</span>
              <span className="font-medium">{agent.widget_layout || 'Original'}</span>
            </div>
            <div className="flex justify-between py-2">
              <span className="text-muted-foreground">Status</span>
              <span className={`font-medium ${agent.platform_agent_id ? 'text-green-500' : 'text-yellow-500'}`}>
                {agent.platform_agent_id ? 'Configuré' : 'Non configuré'}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};