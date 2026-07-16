import { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { GitBranch } from 'lucide-react';

function ConditionNode({ data }: NodeProps) {
  const label = (data?.label as string) || 'Condition';
  const condition = (data?.condition as string) || 'Si...';

  return (
    <div className="px-4 py-3 shadow-lg rounded-lg border-2 border-amber-500 bg-amber-500/10 min-w-[180px]">
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-amber-500 !border-2 !border-white"
      />
      <div className="flex items-center gap-2">
        <div className="p-1.5 rounded bg-amber-500 text-white">
          <GitBranch className="h-4 w-4" />
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-amber-600 font-medium">Condition</p>
          <p className="text-sm font-medium text-foreground">{label}</p>
        </div>
      </div>
      <p className="text-xs text-muted-foreground mt-2 pl-8">{condition}</p>
      <div className="flex justify-between mt-2 text-[10px] text-muted-foreground px-4">
        <span>Oui</span>
        <span>Non</span>
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        id="yes"
        style={{ left: '25%' }}
        className="!w-3 !h-3 !bg-green-500 !border-2 !border-white"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="no"
        style={{ left: '75%' }}
        className="!w-3 !h-3 !bg-red-500 !border-2 !border-white"
      />
    </div>
  );
}

export default memo(ConditionNode);
