import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { APP_VERSION, BUILD_ID, BUILD_TIME, hardReload } from "@/lib/version";
import { cn } from "@/lib/utils";

interface Props {
  className?: string;
  compact?: boolean;
}

export function VersionBadge({ className, compact = false }: Props) {
  const [busy, setBusy] = useState(false);

  const onClear = async () => {
    setBusy(true);
    await hardReload("user-clicked-clear-cache");
  };

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground/70 select-none",
        className,
      )}
      title={`Build ${BUILD_ID}\n${BUILD_TIME}`}
    >
      <span className="opacity-70">{compact ? BUILD_ID : APP_VERSION}</span>
      <button
        type="button"
        onClick={onClear}
        disabled={busy}
        className="inline-flex items-center gap-1 rounded-md border border-border/60 px-1.5 py-0.5 hover:bg-muted/50 transition disabled:opacity-50"
        title="Clear cache & hard reload"
      >
        <RefreshCw className={cn("w-2.5 h-2.5", busy && "animate-spin")} />
        {!compact && <span>Vider le cache</span>}
      </button>
    </div>
  );
}
