import { useState, useEffect } from 'react';
import { usePortal } from '@/hooks/usePortalAuth';
import { usePortalAgentConfig, usePortalUpdateAgentPrompt } from '@/hooks/usePortalAgentConfig';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { FileCode, MessageSquare, Eye, Save, Loader2, AlertCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { PromptAIAssistant } from '@/components/agents/PromptAIAssistant';

const PortalPrompt = () => {
  const { session } = usePortal();

  const { data: agentConfig, isLoading } = usePortalAgentConfig();
  const updatePrompt = usePortalUpdateAgentPrompt();

  // Only admins can edit: super_admin, admin role, client principal, or member with admin role
  const isAdmin =
    session?.role === 'super_admin' ||
    session?.role === 'admin' ||
    session?.memberType === 'client' ||
    session?.memberRole === 'admin';
  const canEdit = isAdmin;

  const [systemPrompt, setSystemPrompt] = useState('');
  const [firstMessage, setFirstMessage] = useState('');
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (agentConfig) {
      setSystemPrompt(agentConfig.systemPrompt || '');
      setFirstMessage(agentConfig.firstMessage || '');
    }
  }, [agentConfig]);

  const handleSave = async () => {
    try {
      await updatePrompt.mutateAsync({ systemPrompt, firstMessage });
      toast.success('Prompt updated successfully');
      setHasChanges(false);
    } catch (error: any) {
      toast.error(error.message || 'Error while updating');
    }
  };

  const handlePromptChange = (value: string) => {
    setSystemPrompt(value);
    setHasChanges(true);
  };

  const handleFirstMessageChange = (value: string) => {
    setFirstMessage(value);
    setHasChanges(true);
  };

  const platformLabel = session?.platform?.toUpperCase() || 'Agent';

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-500 to-yellow-500 flex items-center justify-center">
            <FileCode className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Prompt</h1>
            <div className="flex items-center gap-2">
              <p className="text-muted-foreground">{session?.agentName}</p>
              <Badge variant="outline">{platformLabel}</Badge>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!canEdit && (
            <Badge variant="secondary" className="gap-1">
              <Eye className="h-3 w-3" />Read only
            </Badge>
          )}
          {canEdit && hasChanges && (
            <Button onClick={handleSave} disabled={updatePrompt.isPending} className="gap-2">
              {updatePrompt.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Save
            </Button>
          )}
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}

      {!isLoading && !agentConfig && (
        <Card className="bg-card/50 backdrop-blur-sm border-border/30">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Configuration unavailable</h3>
            <p className="text-muted-foreground text-center max-w-md">
              Verify that the {platformLabel} agent is configured correctly.
            </p>
          </CardContent>
        </Card>
      )}

      {agentConfig && (
        <div className="space-y-6">
          {/* AI Assistant for Prompt Improvement */}
          {canEdit && (
            <PromptAIAssistant
              agentId={session?.agentId || ''}
              agentName={session?.agentName}
              currentPrompt={systemPrompt}
              currentFirstMessage={firstMessage}
              organizationId={session?.organizationId}
              onApplyPrompt={(newPrompt) => {
                setSystemPrompt(newPrompt);
                setHasChanges(true);
              }}
              onApplyFirstMessage={(newFirstMessage) => {
                setFirstMessage(newFirstMessage);
                setHasChanges(true);
              }}
              canEdit={canEdit}
            />
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="bg-card/50 backdrop-blur-sm border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileCode className="h-5 w-5 text-primary" />
                System Prompt
              </CardTitle>
            </CardHeader>
            <CardContent>
              {canEdit ? (
                <Textarea
                  value={systemPrompt}
                  onChange={(e) => handlePromptChange(e.target.value)}
                  className="min-h-[300px] bg-muted/30 border-border/50 font-mono text-sm"
                  placeholder="Enter the system prompt..."
                />
              ) : (
                <div className="min-h-[300px] p-4 rounded-lg bg-muted/30 border border-border/50 font-mono text-sm whitespace-pre-wrap">
                  {systemPrompt || 'No prompt configured'}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="bg-card/50 backdrop-blur-sm border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-primary" />
                First Message
              </CardTitle>
            </CardHeader>
            <CardContent>
              {canEdit ? (
                <Textarea
                  value={firstMessage}
                  onChange={(e) => handleFirstMessageChange(e.target.value)}
                  className="min-h-[300px] bg-muted/30 border-border/50"
                  placeholder="Enter the agent's first message..."
                />
              ) : (
                <div className="min-h-[300px] p-4 rounded-lg bg-muted/30 border border-border/50 whitespace-pre-wrap">
                  {firstMessage || 'No message configured'}
                </div>
              )}
            </CardContent>
          </Card>
          </div>
        </div>
      )}
    </motion.div>
  );
};

export default PortalPrompt;
