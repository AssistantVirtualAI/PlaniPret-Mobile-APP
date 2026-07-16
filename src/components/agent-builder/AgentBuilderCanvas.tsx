import { useCallback, useRef, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  type Connection,
  type Edge,
  type Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { SystemPromptNode } from './nodes/SystemPromptNode';
import { FirstMessageNode } from './nodes/FirstMessageNode';
import { VoiceSettingsNode } from './nodes/VoiceSettingsNode';
import { KnowledgeBaseNode } from './nodes/KnowledgeBaseNode';
import { ToolsNode } from './nodes/ToolsNode';
import { ResponseSettingsNode } from './nodes/ResponseSettingsNode';

const nodeTypes = {
  systemPrompt: SystemPromptNode,
  firstMessage: FirstMessageNode,
  voiceSettings: VoiceSettingsNode,
  knowledgeBase: KnowledgeBaseNode,
  tools: ToolsNode,
  responseSettings: ResponseSettingsNode,
};

interface AgentConfig {
  systemPrompt: string;
  firstMessage: string;
  voiceId: string;
  voiceStability: number;
  voiceSimilarity: number;
  knowledgeItems: string[];
  enabledTools: string[];
  temperature: number;
  maxTokens: number;
}

interface AgentBuilderCanvasProps {
  onConfigChange: (config: AgentConfig) => void;
}

const initialNodes: Node[] = [
  {
    id: 'system-prompt-1',
    type: 'systemPrompt',
    position: { x: 250, y: 50 },
    data: { prompt: '', onChange: () => {} },
  },
];

export function AgentBuilderCanvas({ onConfigChange }: AgentBuilderCanvasProps) {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  
  const [config, setConfig] = useState<AgentConfig>({
    systemPrompt: '',
    firstMessage: '',
    voiceId: '',
    voiceStability: 0.5,
    voiceSimilarity: 0.75,
    knowledgeItems: [],
    enabledTools: [],
    temperature: 0.7,
    maxTokens: 150,
  });

  const updateConfig = useCallback((updates: Partial<AgentConfig>) => {
    setConfig(prev => {
      const newConfig = { ...prev, ...updates };
      onConfigChange(newConfig);
      return newConfig;
    });
  }, [onConfigChange]);

  const updateNodeData = useCallback((nodeId: string, dataUpdates: Partial<Node['data']>) => {
    setNodes(nds =>
      nds.map(node => {
        if (node.id === nodeId) {
          return { ...node, data: { ...node.data, ...dataUpdates } };
        }
        return node;
      })
    );
  }, [setNodes]);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const type = event.dataTransfer.getData('application/agentbuilder');
      if (!type || !reactFlowWrapper.current) return;

      const reactFlowBounds = reactFlowWrapper.current.getBoundingClientRect();
      const position = {
        x: event.clientX - reactFlowBounds.left - 150,
        y: event.clientY - reactFlowBounds.top - 50,
      };

      const newNodeId = `${type}-${Date.now()}`;
      let newNodeData: Node['data'] = {};

      switch (type) {
        case 'systemPrompt':
          newNodeData = {
            prompt: config.systemPrompt,
            onChange: (value: string) => updateConfig({ systemPrompt: value }),
          };
          break;
        case 'firstMessage':
          newNodeData = {
            message: config.firstMessage,
            onChange: (value: string) => updateConfig({ firstMessage: value }),
          };
          break;
        case 'voiceSettings':
          newNodeData = {
            voiceId: config.voiceId,
            stability: config.voiceStability,
            similarity: config.voiceSimilarity,
            onVoiceChange: (value: string) => updateConfig({ voiceId: value }),
            onStabilityChange: (value: number) => updateConfig({ voiceStability: value }),
            onSimilarityChange: (value: number) => updateConfig({ voiceSimilarity: value }),
          };
          break;
        case 'knowledgeBase':
          newNodeData = {
            items: config.knowledgeItems,
            onAddItem: () => {
              const item = prompt('Nom de la source de connaissance:');
              if (item) {
                updateConfig({ knowledgeItems: [...config.knowledgeItems, item] });
              }
            },
            onRemoveItem: (index: number) => {
              updateConfig({ 
                knowledgeItems: config.knowledgeItems.filter((_, i) => i !== index) 
              });
            },
          };
          break;
        case 'tools':
          newNodeData = {
            enabledTools: config.enabledTools,
            onToggleTool: (toolId: string) => {
              const newTools = config.enabledTools.includes(toolId)
                ? config.enabledTools.filter(t => t !== toolId)
                : [...config.enabledTools, toolId];
              updateConfig({ enabledTools: newTools });
            },
          };
          break;
        case 'responseSettings':
          newNodeData = {
            temperature: config.temperature,
            maxTokens: config.maxTokens,
            onTemperatureChange: (value: number) => updateConfig({ temperature: value }),
            onMaxTokensChange: (value: number) => updateConfig({ maxTokens: value }),
          };
          break;
      }

      const newNode: Node = {
        id: newNodeId,
        type,
        position,
        data: newNodeData,
      };

      setNodes((nds) => nds.concat(newNode));
    },
    [config, updateConfig, setNodes]
  );

  // Update existing nodes when config changes
  const nodesWithUpdatedData = nodes.map(node => {
    switch (node.type) {
      case 'systemPrompt':
        return {
          ...node,
          data: {
            prompt: config.systemPrompt,
            onChange: (value: string) => updateConfig({ systemPrompt: value }),
          },
        };
      case 'firstMessage':
        return {
          ...node,
          data: {
            message: config.firstMessage,
            onChange: (value: string) => updateConfig({ firstMessage: value }),
          },
        };
      case 'voiceSettings':
        return {
          ...node,
          data: {
            voiceId: config.voiceId,
            stability: config.voiceStability,
            similarity: config.voiceSimilarity,
            onVoiceChange: (value: string) => updateConfig({ voiceId: value }),
            onStabilityChange: (value: number) => updateConfig({ voiceStability: value }),
            onSimilarityChange: (value: number) => updateConfig({ voiceSimilarity: value }),
          },
        };
      case 'knowledgeBase':
        return {
          ...node,
          data: {
            items: config.knowledgeItems,
            onAddItem: () => {
              const item = prompt('Nom de la source de connaissance:');
              if (item) {
                updateConfig({ knowledgeItems: [...config.knowledgeItems, item] });
              }
            },
            onRemoveItem: (index: number) => {
              updateConfig({ 
                knowledgeItems: config.knowledgeItems.filter((_, i) => i !== index) 
              });
            },
          },
        };
      case 'tools':
        return {
          ...node,
          data: {
            enabledTools: config.enabledTools,
            onToggleTool: (toolId: string) => {
              const newTools = config.enabledTools.includes(toolId)
                ? config.enabledTools.filter(t => t !== toolId)
                : [...config.enabledTools, toolId];
              updateConfig({ enabledTools: newTools });
            },
          },
        };
      case 'responseSettings':
        return {
          ...node,
          data: {
            temperature: config.temperature,
            maxTokens: config.maxTokens,
            onTemperatureChange: (value: number) => updateConfig({ temperature: value }),
            onMaxTokensChange: (value: number) => updateConfig({ maxTokens: value }),
          },
        };
      default:
        return node;
    }
  });

  return (
    <div ref={reactFlowWrapper} className="flex-1 h-full">
      <ReactFlow
        nodes={nodesWithUpdatedData}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onDrop={onDrop}
        onDragOver={onDragOver}
        nodeTypes={nodeTypes}
        fitView
        snapToGrid
        snapGrid={[15, 15]}
        className="bg-muted/30"
      >
        <Background gap={15} size={1} />
        <Controls />
        <MiniMap 
          nodeColor={(node) => {
            switch (node.type) {
              case 'systemPrompt': return 'hsl(var(--primary))';
              case 'firstMessage': return '#22c55e';
              case 'voiceSettings': return '#f59e0b';
              case 'knowledgeBase': return '#06b6d4';
              case 'tools': return '#a855f7';
              case 'responseSettings': return '#f43f5e';
              default: return '#888';
            }
          }}
        />
      </ReactFlow>
    </div>
  );
}
