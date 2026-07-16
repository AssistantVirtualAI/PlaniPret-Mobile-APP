import { MessageSquare, MessageCircle, Mic, BookOpen, Wrench, Settings2 } from 'lucide-react';

interface NodeType {
  type: string;
  label: string;
  icon: React.ReactNode;
  color: string;
  description: string;
}

const nodeTypes: NodeType[] = [
  { 
    type: 'systemPrompt', 
    label: 'System Prompt', 
    icon: <MessageSquare className="h-4 w-4" />, 
    color: 'bg-primary',
    description: 'Instructions and personality'
  },
  { 
    type: 'firstMessage', 
    label: 'First Message', 
    icon: <MessageCircle className="h-4 w-4" />, 
    color: 'bg-green-500',
    description: 'Welcome message'
  },
  { 
    type: 'voiceSettings', 
    label: 'Voice Settings', 
    icon: <Mic className="h-4 w-4" />, 
    color: 'bg-amber-500',
    description: 'Voice and tone'
  },
  { 
    type: 'knowledgeBase', 
    label: 'Knowledge Base', 
    icon: <BookOpen className="h-4 w-4" />, 
    color: 'bg-cyan-500',
    description: 'Documents et FAQ'
  },
  { 
    type: 'tools', 
    label: 'Agent Tools', 
    icon: <Wrench className="h-4 w-4" />, 
    color: 'bg-purple-500',
    description: 'Actions disponibles'
  },
  { 
    type: 'responseSettings', 
    label: 'Response Settings', 
    icon: <Settings2 className="h-4 w-4" />, 
    color: 'bg-rose-500',
    description: 'Temperature and tokens'
  },
];

interface AgentBuilderSidebarProps {
  onDragStart: (event: React.DragEvent, nodeType: string) => void;
}

export function AgentBuilderSidebar({ onDragStart }: AgentBuilderSidebarProps) {
  return (
    <div className="w-72 bg-card border-r p-4 overflow-y-auto">
      <h3 className="font-semibold mb-2">Agent Components</h3>
      <p className="text-xs text-muted-foreground mb-4">
        Drag and drop blocks onto the canvas to build your agent
      </p>
      
      <div className="space-y-2">
        {nodeTypes.map((node) => (
          <div
            key={node.type}
            draggable
            onDragStart={(e) => onDragStart(e, node.type)}
            className="flex items-center gap-3 p-3 rounded-lg border bg-background hover:bg-accent cursor-grab active:cursor-grabbing transition-colors"
          >
            <div className={`p-2 rounded ${node.color} text-white`}>
              {node.icon}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{node.label}</p>
              <p className="text-xs text-muted-foreground truncate">{node.description}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 p-3 rounded-lg bg-muted/50 border border-dashed">
        <p className="text-xs text-muted-foreground">
          💡 <strong>Astuce:</strong> Connectez les blocs entre eux pour créer le flux de votre agent. 
          Commencez par le System Prompt !
        </p>
      </div>
    </div>
  );
}
