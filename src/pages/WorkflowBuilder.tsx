import { useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Node, Edge } from '@xyflow/react';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/context/OrganizationContext';
import { AppLayout } from '@/components/layout/AppLayout';
import { WorkflowCanvas } from '@/components/workflows/WorkflowCanvas';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { ArrowLeft, Save, Play, Pause } from 'lucide-react';
import { Json } from '@/integrations/supabase/types';

export default function WorkflowBuilder() {
  const { workflowId } = useParams();
  const navigate = useNavigate();
  const { selectedOrg } = useOrganization();
  const queryClient = useQueryClient();
  const [workflowName, setWorkflowName] = useState('Nouveau Workflow');
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);

  const isNewWorkflow = workflowId === 'new';

  const { data: workflow, isLoading } = useQuery({
    queryKey: ['workflow', workflowId],
    queryFn: async () => {
      if (isNewWorkflow || !workflowId) return null;
      const { data, error } = await supabase
        .from('workflows')
        .select('*')
        .eq('id', workflowId)
        .single();
      
      if (error) throw error;
      return data;
    },
    enabled: !isNewWorkflow && !!workflowId
  });

  // Initialize state from loaded workflow
  useState(() => {
    if (workflow) {
      const config = workflow.config as { name?: string; nodes?: Node[]; edges?: Edge[] } | null;
      setWorkflowName(config?.name || workflow.app_name);
      setNodes(config?.nodes || []);
      setEdges(config?.edges || []);
    }
  });

  const saveMutation = useMutation({
    mutationFn: async ({ nodes, edges }: { nodes: Node[]; edges: Edge[] }) => {
      if (!selectedOrg?.id) throw new Error('No organization');

      const workflowConfig: Json = {
        name: workflowName,
        nodes: nodes as unknown as Json,
        edges: edges as unknown as Json,
        type: 'visual-workflow'
      };

      if (isNewWorkflow) {
        const { data, error } = await supabase
          .from('workflows')
          .insert({
            organization_id: selectedOrg.id,
            app_name: `workflow-${Date.now()}`,
            config: workflowConfig,
            is_active: false
          })
          .select()
          .single();
        
        if (error) throw error;
        return data;
      } else {
        const { error } = await supabase
          .from('workflows')
          .update({ config: workflowConfig })
          .eq('id', workflowId);
        
        if (error) throw error;
      }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
      toast.success('Workflow saved');
      if (isNewWorkflow && data) {
        navigate(`/workflow-builder/${data.id}`, { replace: true });
      }
    },
    onError: () => {
      toast.error('Error while saving');
    }
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async () => {
      if (!workflowId || isNewWorkflow) return;
      const { error } = await supabase
        .from('workflows')
        .update({ is_active: !workflow?.is_active })
        .eq('id', workflowId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflow', workflowId] });
      toast.success(workflow?.is_active ? 'Workflow disabled' : 'Workflow enabled');
    }
  });

  const handleSave = useCallback((updatedNodes: Node[], updatedEdges: Edge[]) => {
    setNodes(updatedNodes);
    setEdges(updatedEdges);
    saveMutation.mutate({ nodes: updatedNodes, edges: updatedEdges });
  }, [saveMutation]);

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-full">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="flex flex-col h-[calc(100vh-64px)]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b bg-card">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/workflows')}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <Input
              value={workflowName}
              onChange={(e) => setWorkflowName(e.target.value)}
              className="w-64 font-semibold"
                placeholder="Workflow name"
            />
          </div>
          <div className="flex items-center gap-2">
            {!isNewWorkflow && (
              <Button
                variant="outline"
                onClick={() => toggleActiveMutation.mutate()}
                disabled={toggleActiveMutation.isPending}
              >
                {workflow?.is_active ? (
                  <>
                    <Pause className="h-4 w-4 mr-2" />
                    Deactivate
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 mr-2" />
                    Activate
                  </>
                )}
              </Button>
            )}
            <Button onClick={() => handleSave(nodes, edges)} disabled={saveMutation.isPending}>
              <Save className="h-4 w-4 mr-2" />
              Save
            </Button>
          </div>
        </div>

        {/* Canvas */}
        <div className="flex-1">
          <WorkflowCanvas
            initialNodes={nodes}
            initialEdges={edges}
            onSave={handleSave}
          />
        </div>
      </div>
    </AppLayout>
  );
}
