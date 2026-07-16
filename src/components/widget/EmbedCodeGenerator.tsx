import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Copy, Check, Code } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { WidgetConfig } from './WidgetConfigurator';

interface EmbedCodeGeneratorProps {
  agentId: string;
  config: WidgetConfig;
}

export const EmbedCodeGenerator = ({ agentId, config }: EmbedCodeGeneratorProps) => {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const embedCode = `<!-- AVA Statistics Widget -->
<script>
  (function(w, d, s, o, f, js, fjs) {
    w['AVAWidget'] = o;
    w[o] = w[o] || function() {
      (w[o].q = w[o].q || []).push(arguments);
    };
    js = d.createElement(s);
    fjs = d.getElementsByTagName(s)[0];
    js.id = o;
    js.src = f;
    js.async = 1;
    fjs.parentNode.insertBefore(js, fjs);
  }(window, document, 'script', 'ava', 'https://widget.avastatistics.com/widget.js'));
  
  ava('init', {
    agentId: '${agentId}',
    position: '${config.position}',
    primaryColor: '${config.primaryColor}',
    welcomeMessage: '${config.welcomeMessage.replace(/'/g, "\\'")}',
    agentName: '${config.agentName.replace(/'/g, "\\'")}'${config.agentAvatar ? `,
    agentAvatar: '${config.agentAvatar}'` : ''}
  });
</script>`;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(embedCode);
    setCopied(true);
    toast({ title: 'Code copié dans le presse-papier' });
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card className="bg-card/50 backdrop-blur-sm border-border/50">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Code className="h-5 w-5 text-primary" />
          Code d'intégration
        </CardTitle>
        <Button onClick={handleCopy} variant="outline" size="sm">
          {copied ? (
            <>
              <Check className="h-4 w-4 mr-2" />
              Copié
            </>
          ) : (
            <>
              <Copy className="h-4 w-4 mr-2" />
              Copier
            </>
          )}
        </Button>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-4">
          Collez ce code juste avant la balise <code className="bg-muted px-1 rounded">&lt;/body&gt;</code> de votre site web.
        </p>
        <pre className="bg-muted p-4 rounded-lg overflow-x-auto">
          <code className="text-sm text-foreground whitespace-pre-wrap break-all">
            {embedCode}
          </code>
        </pre>
      </CardContent>
    </Card>
  );
};
