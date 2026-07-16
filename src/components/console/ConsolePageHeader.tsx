import { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { SourceBadge } from "@/components/pbx/SourceBadge";
import { WriteScopeButton } from "@/components/pbx/WriteScopeButton";
import { computeStatus, getSource, type PbxSourceId } from "@/lib/pbx/sources";

interface Props {
  title: string;
  description?: string;
  sourceId: PbxSourceId;
  syncedAt?: string | null;
  hasData?: boolean;
  onRefresh?: () => void;
  onSyncFromPbx?: () => void;
  onPushToPbx?: () => void;
  onSaveLocal?: () => void;
  busy?: boolean;
  rightExtra?: ReactNode;
}

export function ConsolePageHeader({
  title, description, sourceId, syncedAt = null, hasData = true,
  onRefresh, onSyncFromPbx, onPushToPbx, onSaveLocal, busy, rightExtra,
}: Props) {
  const source = getSource(sourceId);
  const status = computeStatus(source, syncedAt, hasData);
  return (
    <div className="border-b px-4 py-3 flex flex-wrap items-center justify-between gap-3 bg-card/30">
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-lg font-semibold truncate">{title}</h1>
          <SourceBadge source={source} status={status} syncedAt={syncedAt} />
        </div>
        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
        {syncedAt && (
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Last sync: {new Date(syncedAt).toLocaleString()}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2">
        {rightExtra}
        {onRefresh && (
          <Button size="sm" variant="outline" onClick={onRefresh} disabled={busy}>
            <RefreshCw className={`h-4 w-4 mr-1 ${busy ? "animate-spin" : ""}`} /> Refresh
          </Button>
        )}
        {(onSaveLocal || onPushToPbx || onSyncFromPbx) && (
          <WriteScopeButton
            onSaveLocal={onSaveLocal}
            onPushToPbx={onPushToPbx}
            onSyncFromPbx={onSyncFromPbx}
            primary={onPushToPbx ? "push" : onSyncFromPbx ? "sync" : "save"}
            busy={busy}
          />
        )}
      </div>
    </div>
  );
}
